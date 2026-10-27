[CmdletBinding()]
param(
    [ValidateSet('Install', 'Update', 'Diagnose', 'Uninstall')]
    [string]$Action = 'Install',
    [ValidatePattern('^[A-Za-z0-9._-]+$')]
    [string]$TaskName = 'CodexUsageMesh',
    [string]$RepoRoot,
    [string]$InstallDirectory,
    [string]$StatePath,
    [string]$DashboardUrl,
    [ValidateRange(1, 1440)]
    [int]$MaxSyncAgeMinutes = 5
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Resolve-TrayConfiguration {
    $root = if ($RepoRoot) { [IO.Path]::GetFullPath($RepoRoot) } else { [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..')) }
    $install = if ($InstallDirectory) { [IO.Path]::GetFullPath($InstallDirectory) } else { Join-Path $env:LOCALAPPDATA 'CodexUsageMesh' }
    # New AppData files can be private to a packaged caller such as Codex.
    # The scheduler must launch a physical path shared with the interactive user.
    $trayDirectory = Join-Path $root ".cache\windows-tray\$TaskName"
    [pscustomobject]@{
        RepoRoot = $root
        Directory = $trayDirectory
        Executable = Join-Path $trayDirectory 'CodexUsageMesh.Tray.exe'
        Config = Join-Path $trayDirectory 'CodexUsageMesh.Tray.json'
        Icon = Join-Path $trayDirectory 'CodexUsageMesh.Tray.ico'
        Status = Join-Path $trayDirectory 'tray-state.json'
        TaskName = "$TaskName-Tray"
        Shortcut = Join-Path ([Environment]::GetFolderPath('Programs')) "Codex Usage - $TaskName.lnk"
        StatePath = if ($StatePath) { [IO.Path]::GetFullPath($StatePath) } else { Join-Path $install 'mesh-agent.windows.json' }
        AgentPath = Join-Path $root 'agent.mjs'
        LogPath = Join-Path $root ".cache\windows-agent\$TaskName.Supervisor.log"
    }
}

function Build-TrayApplication {
    param([Parameter(Mandatory = $true)][string]$Destination, [string]$IconPath)
    $framework = if ([Environment]::Is64BitOperatingSystem) { 'Framework64' } else { 'Framework' }
    $compiler = Join-Path $env:SystemRoot "Microsoft.NET\$framework\v4.0.30319\csc.exe"
    if (-not (Test-Path -LiteralPath $compiler -PathType Leaf)) { throw 'Le compilateur .NET Framework Windows est requis.' }
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Destination)) | Out-Null
    $arguments = @('/nologo', '/target:winexe', '/optimize+', "/out:$Destination",
        '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll',
        '/reference:System.Management.dll', '/reference:System.Web.Extensions.dll', '/reference:Microsoft.CSharp.dll')
    if ($IconPath) { $arguments += "/win32icon:$IconPath" }
    $brandIcon = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\public\icon-192.png'))
    if (-not (Test-Path -LiteralPath $brandIcon -PathType Leaf)) { throw 'Logo Codex Usage introuvable.' }
    $arguments += "/resource:$brandIcon,CodexUsageMesh.AppIcon.png"
    $arguments += (Join-Path $PSScriptRoot 'MeshTray.cs')
    $output = & $compiler @arguments 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Compilation de l'application de notification impossible : $output" }
}

function Assert-TrayOwnership {
    param($Configuration)
    $task = Get-ScheduledTask -TaskPath '\' -TaskName $Configuration.TaskName -ErrorAction SilentlyContinue
    if ($task -and @($task.Actions | Where-Object { $_.Execute -ieq $Configuration.Executable }).Count -ne 1) {
        throw "La tache $($Configuration.TaskName) appartient a une autre installation. Elle a ete conservee."
    }
}

function Stop-TrayApplication {
    param($Configuration)
    if (Test-Path -LiteralPath $Configuration.Executable -PathType Leaf) {
        # Graceful quit affects only this tray; it never stops the reporting task.
        $quit = Start-Process -FilePath $Configuration.Executable -ArgumentList '--quit' -WindowStyle Hidden -PassThru
        if (-not $quit.WaitForExit(5000)) { throw 'La demande de fermeture de l''icone n''a pas abouti.' }
        $deadline = [DateTime]::UtcNow.AddSeconds(10)
        do {
            $processes = @(Get-CimInstance Win32_Process -Filter "Name='CodexUsageMesh.Tray.exe'" | Where-Object { $_.ExecutablePath -ieq $Configuration.Executable })
            if ($processes.Count -eq 0) { return }
            Start-Sleep -Milliseconds 200
        } while ([DateTime]::UtcNow -lt $deadline)
        throw 'L''application de notification est encore active ; aucun fichier n''a ete remplace.'
    }
}

function Install-TrayApplication {
    param($Configuration)
    Assert-TrayOwnership $Configuration
    if (-not (Test-Path -LiteralPath $Configuration.AgentPath -PathType Leaf)) { throw 'Depot de collecte introuvable.' }
    if ($DashboardUrl -and ([uri]$DashboardUrl).Scheme -notin @('http', 'https')) { throw 'DashboardUrl doit etre une URL HTTP ou HTTPS.' }
    [IO.Directory]::CreateDirectory($Configuration.Directory) | Out-Null
    $prepared = Join-Path $Configuration.Directory 'CodexUsageMesh.Tray.prepared.exe'
    $preparedIcon = Join-Path $Configuration.Directory 'CodexUsageMesh.Tray.prepared.ico'
    try {
        # Compile before touching an existing tray or its startup registration.
        Build-TrayApplication -Destination $prepared
        $export = Start-Process -FilePath $prepared -ArgumentList @('--export-icon', ('"' + $preparedIcon + '"')) -WindowStyle Hidden -PassThru
        if (-not $export.WaitForExit(10000) -or $export.ExitCode -ne 0) { throw 'Creation de l''icone impossible.' }
        Build-TrayApplication -Destination $prepared -IconPath $preparedIcon
        $config = @{
            TaskName = $TaskName; StatePath = $Configuration.StatePath; AgentPath = $Configuration.AgentPath
            LogPath = $Configuration.LogPath; StatusPath = $Configuration.Status
            ShortcutPath = $Configuration.Shortcut; IconPath = $Configuration.Icon
            DashboardUrl = $DashboardUrl; MaxSyncAgeMinutes = $MaxSyncAgeMinutes
        }
        # Preserve a previously configured dashboard URL on routine updates.
        if (-not $DashboardUrl -and (Test-Path -LiteralPath $Configuration.Config -PathType Leaf)) {
            $oldConfig = Get-Content -LiteralPath $Configuration.Config -Raw -Encoding UTF8 | ConvertFrom-Json
            $config.DashboardUrl = $oldConfig.DashboardUrl
        }
        Stop-TrayApplication $Configuration
        Copy-Item -LiteralPath $prepared -Destination $Configuration.Executable
        Copy-Item -LiteralPath $preparedIcon -Destination $Configuration.Icon
        [IO.File]::WriteAllText($Configuration.Config, ($config | ConvertTo-Json), [Text.UTF8Encoding]::new($false))

        $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
        $principal = New-ScheduledTaskPrincipal -UserId $identity.Name -LogonType Interactive -RunLevel Limited
        $taskAction = New-ScheduledTaskAction -Execute $Configuration.Executable -WorkingDirectory $Configuration.Directory
        $trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity.Name
        $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
            -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
        Register-ScheduledTask -TaskName $Configuration.TaskName -TaskPath '\' -Action $taskAction -Principal $principal `
            -Trigger $trigger -Settings $settings -Description 'Codex Usage : etat de synchronisation et commandes de collecte dans la zone de notification.' -Force | Out-Null
        $shell = New-Object -ComObject WScript.Shell
        try {
            $shortcut = $shell.CreateShortcut($Configuration.Shortcut)
            $shortcut.TargetPath = $Configuration.Executable
            $shortcut.Arguments = '--status'
            $shortcut.WorkingDirectory = $Configuration.Directory
            $shortcut.IconLocation = $Configuration.Icon
            $shortcut.Description = 'Etat de la collecte Codex Usage et derniere synchronisation'
            $shortcut.Save()
        } finally { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shortcut); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) }
        Start-ScheduledTask -TaskName $Configuration.TaskName -TaskPath '\'
        Write-Output "Application installee : $($Configuration.Executable)"
        Write-Output "Demarrage a la connexion : $($Configuration.TaskName)"
        Write-Output "Menu Demarrer : $($Configuration.Shortcut)"
    } finally {
        foreach ($file in @($prepared, $preparedIcon)) {
            if (Test-Path -LiteralPath $file -PathType Leaf) { Remove-Item -LiteralPath $file -ErrorAction Stop }
        }
    }
}

function Uninstall-TrayApplication {
    param($Configuration)
    Assert-TrayOwnership $Configuration
    Stop-TrayApplication $Configuration
    if (Get-ScheduledTask -TaskName $Configuration.TaskName -TaskPath '\' -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $Configuration.TaskName -TaskPath '\' -Confirm:$false
    }
    foreach ($file in @($Configuration.Shortcut, $Configuration.Executable, $Configuration.Icon, $Configuration.Config, $Configuration.Status, ($Configuration.Status + '.tmp'))) {
        if (Test-Path -LiteralPath $file -PathType Leaf) { Remove-Item -LiteralPath $file -ErrorAction Stop }
    }
    Write-Output 'Application de notification desinstallee. Collecte, association et journaux conserves.'
}

if ($MyInvocation.InvocationName -eq '.') { return }
if ($env:OS -ne 'Windows_NT') { throw 'Cette application de notification est reservee a Windows.' }
$configuration = Resolve-TrayConfiguration
switch ($Action) {
    'Install' { Install-TrayApplication $configuration }
    'Update' { Install-TrayApplication $configuration }
    'Uninstall' { Uninstall-TrayApplication $configuration }
    'Diagnose' {
        $task = Get-ScheduledTask -TaskName $configuration.TaskName -TaskPath '\' -ErrorAction SilentlyContinue
        [pscustomobject]@{ TaskName = $configuration.TaskName; TaskState = if ($task) { [string]$task.State } else { 'Missing' }; Executable = $configuration.Executable; ShortcutPresent = Test-Path -LiteralPath $configuration.Shortcut }
        if (Test-Path -LiteralPath $configuration.Status) { Get-Content -LiteralPath $configuration.Status -Raw -Encoding UTF8 | ConvertFrom-Json }
    }
}
