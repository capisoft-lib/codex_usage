[CmdletBinding()]
param(
    [ValidateSet('Install', 'Update', 'Diagnose', 'Uninstall')]
    [string]$Action = 'Install',
    [ValidatePattern('^[A-Za-z0-9._-]+$')]
    [string]$TaskName = 'CodexUsageMesh',
    [string]$RepoRoot,
    [string]$InstallDirectory,
    [string]$StatePath,
    [string]$NodePath,
    [string]$HubUrl,
    [string]$AssociationCode,
    [string]$Alias,
    [ValidateRange(1, 86400)]
    [int]$RestartDelaySeconds = 30,
    [ValidateSet('hash', 'basename', 'full')]
    [string]$ProjectMode = 'hash',
    [switch]$IncludeTitles,
    [ValidateRange(1, 1440)]
    [int]$MaxSyncAgeMinutes = 5
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ManagedTaskPath = '\'

function Resolve-FullPath {
    param([Parameter(Mandatory = $true)][string]$Path)
    return [System.IO.Path]::GetFullPath($Path)
}

function Resolve-Configuration {
    $resolvedRepo = if ($RepoRoot) {
        Resolve-FullPath $RepoRoot
    } else {
        Resolve-FullPath (Join-Path $PSScriptRoot '..\..')
    }
    $resolvedInstall = if ($InstallDirectory) {
        Resolve-FullPath $InstallDirectory
    } else {
        Resolve-FullPath (Join-Path $env:LOCALAPPDATA 'CodexUsageMesh')
    }
    $resolvedState = if ($StatePath) {
        Resolve-FullPath $StatePath
    } else {
        Join-Path $resolvedInstall 'mesh-agent.windows.json'
    }
    $previousInstalledStatePath = Join-Path $resolvedInstall 'state\mesh-agent.json'
    $legacyStatePath = if (Test-Path -LiteralPath $previousInstalledStatePath -PathType Leaf) {
        $previousInstalledStatePath
    } else {
        Join-Path $resolvedRepo '.cache\mesh-agent.json'
    }
    $resolvedNode = if ($NodePath) {
        Resolve-FullPath $NodePath
    } elseif ($Action -in @('Install', 'Update')) {
        $nodeCommand = Get-Command node.exe -ErrorAction Stop
        Resolve-FullPath $nodeCommand.Source
    } else {
        $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
        if ($nodeCommand) { Resolve-FullPath $nodeCommand.Source } else { $null }
    }

    return [pscustomobject]@{
        RepoRoot = $resolvedRepo
        InstallDirectory = $resolvedInstall
        StatePath = $resolvedState
        LegacyStatePath = $legacyStatePath
        NodePath = $resolvedNode
        LauncherPath = Join-Path $resolvedRepo ".cache\windows-agent\$TaskName.Supervisor.ps1"
        LogPath = Join-Path $resolvedRepo ".cache\windows-agent\$TaskName.Supervisor.log"
        AgentPath = Join-Path $resolvedRepo 'agent.mjs'
        GeneratorPath = Resolve-FullPath (Join-Path $PSScriptRoot '..\generate-windows-agent-files.mjs')
    }
}

function Assert-WindowsEnvironment {
    if ($env:OS -ne 'Windows_NT') {
        throw 'Cette commande de supervision est réservée à Windows.'
    }
    if (-not $env:LOCALAPPDATA) { throw 'LOCALAPPDATA est requis pour installer la supervision.' }
}

function Read-AgentState {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
    try {
        $state = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
        throw "État Mesh illisible à $Path : $($_.Exception.Message)"
    }
    if (-not $state.privateKey -or -not $state.publicKey -or -not $state.projectSalt -or -not $state.hubUrl) {
        throw "État Mesh incomplet à $Path. Le fichier existant n'a pas été modifié."
    }
    return $state
}

function Stop-ExistingTask {
    param([Parameter(Mandatory = $true)][string]$Name)
    $task = Get-ScheduledTask -TaskName $Name -TaskPath $ManagedTaskPath -ErrorAction SilentlyContinue
    if (-not $task) { return }
    if ($task.State -eq 'Running') {
        Stop-ScheduledTask -TaskName $Name -TaskPath $ManagedTaskPath
        $deadline = [DateTimeOffset]::Now.AddSeconds(15)
        do {
            Start-Sleep -Milliseconds 250
            $task = Get-ScheduledTask -TaskName $Name -TaskPath $ManagedTaskPath -ErrorAction SilentlyContinue
        } while ($task -and $task.State -eq 'Running' -and [DateTimeOffset]::Now -lt $deadline)
        if ($task -and $task.State -eq 'Running') {
            throw "La tâche $Name ne s'est pas arrêtée dans le délai prévu."
        }
    }
}

function Get-MatchingProcesses {
    param([Parameter(Mandatory = $true)]$Configuration)
    try {
        $processes = @(Get-CimInstance Win32_Process -ErrorAction Stop)
    } catch {
        return [pscustomobject]@{ Supervisors = @(); Agents = @(); InspectionError = $_.Exception.Message }
    }

    $supervisors = @($processes | Where-Object {
        $_.ProcessId -ne $PID -and $_.Name -in @('powershell.exe', 'pwsh.exe') -and
        $_.CommandLine -and $_.CommandLine.IndexOf($Configuration.LauncherPath, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
    })
    $agents = @($processes | Where-Object {
        $_.Name -ieq 'node.exe' -and $_.CommandLine -and
        $_.CommandLine.IndexOf('agent.mjs', [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -and
        ($_.CommandLine.IndexOf($Configuration.StatePath, [System.StringComparison]::OrdinalIgnoreCase) -ge 0 -or
         $_.CommandLine.IndexOf($Configuration.RepoRoot, [System.StringComparison]::OrdinalIgnoreCase) -ge 0)
    })
    return [pscustomobject]@{ Supervisors = $supervisors; Agents = $agents; InspectionError = $null }
}

function Invoke-FileGeneration {
    param([Parameter(Mandatory = $true)]$Configuration)
    $arguments = @(
        $Configuration.GeneratorPath,
        '--launcher-path', $Configuration.LauncherPath,
        '--repo-root', $Configuration.RepoRoot,
        '--state-path', $Configuration.StatePath,
        '--state-source', $Configuration.LegacyStatePath,
        '--node-path', $Configuration.NodePath,
        '--log-path', $Configuration.LogPath,
        '--task-name', $TaskName,
        '--restart-delay-seconds', [string]$RestartDelaySeconds,
        '--project-mode', $ProjectMode
    )
    if ($IncludeTitles) { $arguments += '--include-titles' }
    $result = & $Configuration.NodePath @arguments
    if ($LASTEXITCODE -ne 0) { throw "La génération du lanceur a échoué avec le code $LASTEXITCODE." }
    return $result | Select-Object -Last 1
}

function Invoke-FirstAssociation {
    param([Parameter(Mandatory = $true)]$Configuration)
    if (-not $HubUrl -or -not $AssociationCode) {
        throw "Aucun état associé n'existe. Fournissez ensemble -HubUrl et -AssociationCode pour la première installation."
    }
    $arguments = @(
        $Configuration.AgentPath,
        '--once',
        '--state-path', $Configuration.StatePath,
        '--hub-url', $HubUrl,
        '--associate', $AssociationCode
    )
    if ($Alias) { $arguments += @('--alias', $Alias) }
    & $Configuration.NodePath @arguments
    if ($LASTEXITCODE -ne 0) { throw "L'association initiale a échoué avec le code $LASTEXITCODE." }
}

function Escape-XmlText {
    param([AllowEmptyString()][string]$Value)
    return [System.Security.SecurityElement]::Escape($Value)
}

function New-TaskXml {
    param([Parameter(Mandatory = $true)]$Configuration)
    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $userSid = Escape-XmlText $identity.User.Value
    $author = Escape-XmlText $identity.Name
    $uri = Escape-XmlText ("\" + $TaskName)
    $powershellPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $command = Escape-XmlText $powershellPath
    $actionArguments = Escape-XmlText ("-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$($Configuration.LauncherPath)`"")
    $recoveryStart = [DateTimeOffset]::Now.AddMinutes(1).ToString('yyyy-MM-ddTHH:mm:sszzz')
    $eventSubscription = Escape-XmlText '<QueryList><Query Id="0" Path="System"><Select Path="System">*[System[Provider[@Name="Microsoft-Windows-Power-Troubleshooter"] and EventID=1]]</Select></Query></QueryList>'

    return @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Author>$author</Author>
    <Description>Superviseur local Codex Usage Mesh. Démarre sans fenêtre à l'ouverture de session, après veille et reprend chaque minute si arrêté.</Description>
    <URI>$uri</URI>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <UserId>$userSid</UserId>
    </LogonTrigger>
    <EventTrigger>
      <Enabled>true</Enabled>
      <Subscription>$eventSubscription</Subscription>
    </EventTrigger>
    <TimeTrigger>
      <Repetition>
        <Interval>PT1M</Interval>
        <StopAtDurationEnd>false</StopAtDurationEnd>
      </Repetition>
      <StartBoundary>$recoveryStart</StartBoundary>
      <Enabled>true</Enabled>
    </TimeTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>$userSid</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>999</Count>
    </RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>$command</Command>
      <Arguments>$actionArguments</Arguments>
      <WorkingDirectory>$(Escape-XmlText $Configuration.RepoRoot)</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"@
}

function Install-Supervision {
    param([Parameter(Mandatory = $true)]$Configuration)
    foreach ($requiredPath in @($Configuration.AgentPath, $Configuration.GeneratorPath, $Configuration.NodePath)) {
        if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) { throw "Fichier requis introuvable : $requiredPath" }
    }

    Stop-ExistingTask $TaskName
    $processes = Get-MatchingProcesses $Configuration
    if ($processes.InspectionError) {
        throw "Impossible de vérifier les processus existants : $($processes.InspectionError)"
    }
    if ($processes.Agents.Count -gt 0 -or $processes.Supervisors.Count -gt 0) {
        $ids = @($processes.Agents.ProcessId) + @($processes.Supervisors.ProcessId)
        throw "Une instance utilisant ce dépôt ou cet état est encore active (PID $($ids -join ', ')). Arrêtez-la avant l'installation."
    }

    $generationResult = Invoke-FileGeneration $Configuration
    $state = Read-AgentState $Configuration.StatePath
    if (-not $state -or -not $state.nodeId) {
        Invoke-FirstAssociation $Configuration
        $state = Read-AgentState $Configuration.StatePath
    }
    if (-not $state.nodeId) { throw "L'état Mesh existe mais la machine n'est pas associée." }
    if ($HubUrl -and ([string]$state.hubUrl).TrimEnd('/') -ne $HubUrl.TrimEnd('/')) {
        Write-Warning "La machine est déjà associée à $($state.hubUrl). Le paramètre -HubUrl a été ignoré et le hub existant a été conservé."
    }

    # Regenerate after first association so the launcher starts only from a
    # complete, durable identity. The copy-if-absent operation remains a no-op.
    $generationResult = Invoke-FileGeneration $Configuration
    $taskXml = New-TaskXml $Configuration
    [xml]$null = $taskXml
    Register-ScheduledTask -TaskName $TaskName -TaskPath $ManagedTaskPath -Xml $taskXml -Force | Out-Null
    Start-ScheduledTask -TaskName $TaskName -TaskPath $ManagedTaskPath
    Start-Sleep -Seconds 2

    $task = Get-ScheduledTask -TaskName $TaskName -TaskPath $ManagedTaskPath
    Write-Output "Supervision Windows installée : $TaskName ($($task.State))."
    Write-Output "État Mesh conservé : $($Configuration.StatePath)"
    Write-Output "Logs UTF-8 : $($Configuration.LogPath)"
    Write-Output "Génération : $generationResult"
}

function Invoke-Diagnostic {
    param([Parameter(Mandatory = $true)]$Configuration)
    $task = Get-ScheduledTask -TaskName $TaskName -TaskPath $ManagedTaskPath -ErrorAction SilentlyContinue
    $taskInfo = if ($task) { Get-ScheduledTaskInfo -TaskName $TaskName -TaskPath $ManagedTaskPath } else { $null }
    $taskXml = if ($task) { Export-ScheduledTask -TaskName $TaskName -TaskPath $ManagedTaskPath } else { '' }
    $processes = Get-MatchingProcesses $Configuration
    $state = Read-AgentState $Configuration.StatePath
    $lastSyncValue = if ($state) { $state.lastSyncAt } else { $null }
    $lastSyncAt = if ($lastSyncValue -is [DateTime] -or $lastSyncValue -is [DateTimeOffset]) {
        $lastSyncValue.ToString('o')
    } elseif ($null -ne $lastSyncValue) {
        [string]$lastSyncValue
    } else { $null }
    $syncAgeMinutes = $null
    $syncRecent = $false
    if ($lastSyncAt) {
        try {
            $syncAgeMinutes = [Math]::Round(([DateTimeOffset]::Now - [DateTimeOffset]::Parse($lastSyncAt)).TotalMinutes, 2)
            $syncRecent = $syncAgeMinutes -le $MaxSyncAgeMinutes
        } catch {
            $syncAgeMinutes = $null
        }
    }

    $hubUrl = if ($state) { [string]$state.hubUrl } else { $null }
    $healthUrl = $null
    $hubReachable = $false
    $hubStatusCode = $null
    $hubError = $null
    if ($hubUrl) {
        foreach ($healthPath in @('/healthz', '/api/health')) {
            $healthUrl = $hubUrl.TrimEnd('/') + $healthPath
            $hubStatusCode = $null
            $hubError = $null
            try {
                $response = Invoke-WebRequest -Uri $healthUrl -Method Get -UseBasicParsing -TimeoutSec 10 -MaximumRedirection 0
                $hubStatusCode = [int]$response.StatusCode
                $hubReachable = $hubStatusCode -ge 200 -and $hubStatusCode -lt 300
            } catch {
                $hubError = $_.Exception.Message
                if ($_.Exception.PSObject.Properties['Response'] -and $_.Exception.Response -and $_.Exception.Response.StatusCode) {
                    $hubStatusCode = [int]$_.Exception.Response.StatusCode
                }
            }
            # The public ingress uses /healthz; the self-hosted hub uses /api/health.
            # Only a missing route permits fallback, not auth, server or transport failures.
            if ($hubStatusCode -ne 404) { break }
        }
    }

    $result = [pscustomobject]@{
        TaskName = $TaskName
        TaskInstalled = [bool]$task
        TaskState = if ($task) { [string]$task.State } else { 'Missing' }
        LastTaskResult = if ($taskInfo) { $taskInfo.LastTaskResult } else { $null }
        LogonTrigger = [bool]($taskXml -match '<LogonTrigger>')
        ResumeTrigger = [bool]($taskXml -match 'Microsoft-Windows-Power-Troubleshooter')
        RecoveryTrigger = [bool]($taskXml -match '(?s)<TimeTrigger>.*?<Interval>PT1M</Interval>.*?</TimeTrigger>')
        HiddenWindow = [bool]($task -and ($task.Actions | Where-Object { $_.Arguments -match '(?i)-WindowStyle\s+Hidden\b' }))
        SupervisorProcessCount = $processes.Supervisors.Count
        AgentProcessCount = $processes.Agents.Count
        ProcessInspectionError = $processes.InspectionError
        StatePath = $Configuration.StatePath
        StateEnrolled = [bool]($state -and $state.nodeId)
        HubUrl = $hubUrl
        LastSyncAt = $lastSyncAt
        SyncAgeMinutes = $syncAgeMinutes
        SyncRecent = $syncRecent
        HubHealthUrl = $healthUrl
        HubReachable = $hubReachable
        HubStatusCode = $hubStatusCode
        HubError = $hubError
        LogPath = $Configuration.LogPath
    }
    $healthy = $result.TaskInstalled -and $result.TaskState -eq 'Running' -and
        $result.LogonTrigger -and $result.ResumeTrigger -and $result.RecoveryTrigger -and $result.HiddenWindow -and
        $result.SupervisorProcessCount -eq 1 -and $result.AgentProcessCount -eq 1 -and
        $result.StateEnrolled -and $result.SyncRecent -and $result.HubReachable
    return [pscustomobject]@{ Result = $result; Healthy = $healthy }
}

function Uninstall-Supervision {
    param([Parameter(Mandatory = $true)]$Configuration)
    Stop-ExistingTask $TaskName
    if (Get-ScheduledTask -TaskName $TaskName -TaskPath $ManagedTaskPath -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -TaskPath $ManagedTaskPath -Confirm:$false
    }
    if (Test-Path -LiteralPath $Configuration.LauncherPath -PathType Leaf) {
        Remove-Item -LiteralPath $Configuration.LauncherPath -Force
    }
    Write-Output "Tâche locale supprimée : $TaskName"
    Write-Output "État Mesh et logs conservés : $($Configuration.InstallDirectory)"
    Write-Output "Aucune machine n'a été révoquée ou supprimée du hub."
}

if ($MyInvocation.InvocationName -eq '.') { return }

Assert-WindowsEnvironment
$configuration = Resolve-Configuration
switch ($Action) {
    'Install' { Install-Supervision $configuration }
    'Update' { Install-Supervision $configuration }
    'Diagnose' {
        $diagnostic = Invoke-Diagnostic $configuration
        $diagnostic.Result | Format-List
        if (-not $diagnostic.Healthy) { exit 1 }
    }
    'Uninstall' { Uninstall-Supervision $configuration }
}
