// Per-user notification app. The scheduled reporting agent remains its own owner.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Globalization;
using System.IO;
using System.Management;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace CodexUsageMesh
{
    public sealed class TrayConfiguration
    {
        public string TaskName { get; set; }
        public string StatePath { get; set; }
        public string AgentPath { get; set; }
        public string LogPath { get; set; }
        public string StatusPath { get; set; }
        public string DashboardUrl { get; set; }
        public string ShortcutPath { get; set; }
        public string IconPath { get; set; }
        public int MaxSyncAgeMinutes { get; set; }
    }

    public sealed class TraySnapshot
    {
        public bool TaskInstalled, TaskEnabled, Enrolled;
        public int TaskState, AgentCount;
        public DateTimeOffset? LastSyncAt;
        public string Error;
    }

    public sealed class TrayHealth
    {
        public string State, Label, Detail;
        public static TrayHealth Evaluate(TraySnapshot value, DateTimeOffset now, int maxAgeMinutes)
        {
            if (!String.IsNullOrEmpty(value.Error)) return Result("warning", "État indisponible", value.Error);
            if (!value.TaskInstalled) return Result("offline", "Agent non installé", "La tâche de collecte est introuvable.");
            if (!value.TaskEnabled) return Result("paused", "Collecte en pause", "La reprise automatique est désactivée.");
            if (!value.Enrolled) return Result("warning", "Association à vérifier", "L’état local ne contient pas de machine associée.");
            if (value.AgentCount > 1) return Result("warning", "Plusieurs collecteurs", "Plusieurs processus utilisent le même état local.");
            if (value.TaskState != 4 || value.AgentCount != 1)
                return Result("offline", "Collecteur arrêté", "Le superviseur ou son collecteur n’est pas actif.");
            if (!value.LastSyncAt.HasValue) return Result("warning", "Synchronisation en attente", "Aucune synchronisation réussie n’est enregistrée.");
            double age = (now - value.LastSyncAt.Value).TotalMinutes;
            if (age < -1) return Result("warning", "Horloge à vérifier", "La date de synchronisation est dans le futur.");
            if (age > maxAgeMinutes) return Result("warning", "Synchronisation en retard", "Le collecteur tourne, mais aucune synchronisation récente n’est enregistrée.");
            return Result("connected", "Synchronisation récente", "Un collecteur actif et une synchronisation réussie récente.");
        }
        private static TrayHealth Result(string state, string label, string detail)
        { return new TrayHealth { State = state, Label = label, Detail = detail }; }
    }

    public static class TrayProbe
    {
        private static void Release(object value)
        { if (value != null && Marshal.IsComObject(value)) Marshal.FinalReleaseComObject(value); }

        // COM objects are created and released on the same worker thread.
        public static T WithTask<T>(string name, Func<dynamic, T> action, T missing)
        {
            object service = null, folder = null, task = null;
            try
            {
                service = Activator.CreateInstance(Type.GetTypeFromProgID("Schedule.Service", true));
                ((dynamic)service).Connect();
                folder = ((dynamic)service).GetFolder("\\");
                try { task = ((dynamic)folder).GetTask(name); }
                catch (FileNotFoundException) { return missing; }
                catch (COMException error) { if ((uint)error.ErrorCode == 0x80070002) return missing; throw; }
                return action((dynamic)task);
            }
            finally { Release(task); Release(folder); Release(service); }
        }

        public static TraySnapshot Read(TrayConfiguration configuration)
        {
            var result = new TraySnapshot();
            try
            {
                WithTask<bool>(configuration.TaskName, task => {
                    result.TaskInstalled = true;
                    result.TaskEnabled = (bool)task.Enabled;
                    result.TaskState = (int)task.State;
                    return true;
                }, false);
                if (File.Exists(configuration.StatePath))
                {
                    var json = new JavaScriptSerializer { MaxJsonLength = 64 * 1024 * 1024 };
                    var state = json.Deserialize<Dictionary<string, object>>(File.ReadAllText(configuration.StatePath, Encoding.UTF8));
                    object value;
                    result.Enrolled = state.TryGetValue("nodeId", out value) && !String.IsNullOrEmpty(value as string);
                    DateTimeOffset sync;
                    if (state.TryGetValue("lastSyncAt", out value) && DateTimeOffset.TryParse(value as string, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out sync)) result.LastSyncAt = sync;
                }
                using (var query = new ManagementObjectSearcher("SELECT CommandLine FROM Win32_Process WHERE Name='node.exe'"))
                using (var processes = query.Get())
                {
                    foreach (ManagementObject process in processes)
                    using (process)
                    {
                        string command = process["CommandLine"] as string ?? "";
                        // Match complete path arguments, not a substring of another installation.
                        if (command.IndexOf("\"" + configuration.AgentPath + "\"", StringComparison.OrdinalIgnoreCase) >= 0 &&
                            command.IndexOf("\"" + configuration.StatePath + "\"", StringComparison.OrdinalIgnoreCase) >= 0) result.AgentCount++;
                    }
                }
            }
            catch { result.Error = "Impossible de lire la tâche, les processus ou l’état local. Consultez les journaux."; }
            return result;
        }

        public static void Control(string taskName, string action)
        {
            bool found = WithTask<bool>(taskName, task => {
                if (action == "pause") { task.Enabled = false; task.Stop(0); }
                else
                {
                    // Disable recovery before a restart so its minute trigger cannot race us.
                    if (action == "restart")
                    {
                        bool enabled = (bool)task.Enabled;
                        task.Enabled = false;
                        try
                        {
                            task.Stop(0);
                            var deadline = DateTime.UtcNow.AddSeconds(15);
                            while ((int)task.State == 4 && DateTime.UtcNow < deadline) Thread.Sleep(200);
                            if ((int)task.State == 4) throw new InvalidOperationException();
                            Thread.Sleep(500); // Allow the host job to finish child cleanup.
                        }
                        catch { task.Enabled = enabled; throw; }
                    }
                    task.Enabled = true;
                    object running = task.Run(null);
                    Release(running);
                }
                return true;
            }, false);
            if (!found) throw new InvalidOperationException("Tâche de collecte introuvable.");
        }
    }

    public static class TrayArt
    {
        private static readonly Bitmap Brand = LoadBrand();
        [DllImport("user32.dll")] private static extern bool DestroyIcon(IntPtr icon);

        private static Bitmap LoadBrand()
        {
            using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("CodexUsageMesh.AppIcon.png"))
            {
                if (stream == null) throw new InvalidOperationException("The Codex Usage icon resource is missing.");
                using (var source = Image.FromStream(stream)) return new Bitmap(source);
            }
        }

        private static Bitmap Render(string state, int size)
        {
            Color status = state == "connected" ? Color.FromArgb(38, 187, 129) :
                state == "warning" ? Color.FromArgb(244, 178, 56) :
                state == "paused" ? Color.FromArgb(148, 163, 184) : Color.FromArgb(239, 83, 80);
            var bitmap = new Bitmap(size, size);
            using (var graphics = Graphics.FromImage(bitmap))
            {
                graphics.SmoothingMode = SmoothingMode.AntiAlias;
                graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                graphics.ScaleTransform(size / 64f, size / 64f);
                graphics.DrawImage(Brand, new Rectangle(0, 0, 64, 64));
                if (!String.IsNullOrEmpty(state))
                {
                    using (var border = new SolidBrush(Color.FromArgb(18, 21, 19))) graphics.FillEllipse(border, 44, 44, 20, 20);
                    using (var brush = new SolidBrush(status)) graphics.FillEllipse(brush, 47, 47, 14, 14);
                }
            }
            return bitmap;
        }

        public static Icon Create(string state, int size)
        {
            using (var bitmap = Render(state, size))
            {
                IntPtr handle = bitmap.GetHicon();
                try { using (var original = Icon.FromHandle(handle)) return (Icon)original.Clone(); }
                finally { DestroyIcon(handle); }
            }
        }

        public static void Export(string path)
        {
            // Icon.FromHandle(...).Save() can quantize the palette. Write 32-bit
            // ICO frames directly, retaining the PNG colors and alpha at each size.
            int[] sizes = { 16, 32, 48, 64, 128 };
            using (var writer = new BinaryWriter(File.Create(path)))
            {
                writer.Write((ushort)0); writer.Write((ushort)1); writer.Write((ushort)sizes.Length);
                int offset = 6 + sizes.Length * 16;
                foreach (int size in sizes)
                {
                    int bytes = 40 + size * size * 4 + ((size + 31) / 32) * 4 * size;
                    writer.Write((byte)size); writer.Write((byte)size); writer.Write((byte)0); writer.Write((byte)0);
                    writer.Write((ushort)1); writer.Write((ushort)32); writer.Write(bytes); writer.Write(offset);
                    offset += bytes;
                }
                foreach (int size in sizes)
                using (var bitmap = Render(null, size))
                {
                    int maskStride = ((size + 31) / 32) * 4;
                    writer.Write(40); writer.Write(size); writer.Write(size * 2);
                    writer.Write((ushort)1); writer.Write((ushort)32); writer.Write(0);
                    writer.Write(size * size * 4 + maskStride * size);
                    writer.Write(0); writer.Write(0); writer.Write(0); writer.Write(0);
                    for (int y = size - 1; y >= 0; y--)
                        for (int x = 0; x < size; x++)
                        {
                            Color color = bitmap.GetPixel(x, y);
                            writer.Write(color.B); writer.Write(color.G); writer.Write(color.R); writer.Write(color.A);
                        }
                    for (int y = size - 1; y >= 0; y--)
                    {
                        var mask = new byte[maskStride];
                        for (int x = 0; x < size; x++)
                            if (bitmap.GetPixel(x, y).A == 0) mask[x / 8] |= (byte)(0x80 >> (x % 8));
                        writer.Write(mask);
                    }
                }
            }
        }
    }

    public sealed class TrayContext : ApplicationContext
    {
        private readonly TrayConfiguration configuration;
        private readonly NotifyIcon icon;
        private readonly ContextMenuStrip menu;
        private readonly ToolStripMenuItem statusItem, syncItem, pauseItem, resumeItem, restartItem;
        private readonly System.Windows.Forms.Timer timer;
        private readonly Control dispatcher = new Control();
        private readonly EventWaitHandle showEvent, quitEvent;
        private TraySnapshot snapshot = new TraySnapshot { Error = "Lecture de l’état en cours…" };
        private TrayHealth health;
        private Icon currentIcon;
        private Form statusWindow;
        private Label statusLabel, detailLabel, syncLabel, taskLabel;
        private Button restartButton;
        private bool reading, busy, exiting;
        private int ticks;

        public TrayContext(TrayConfiguration config, EventWaitHandle show, EventWaitHandle quit, bool open)
        {
            configuration = config; showEvent = show; quitEvent = quit;
            dispatcher.CreateControl();
            menu = new ContextMenuStrip { Font = new Font("Segoe UI", 10f) };
            statusItem = new ToolStripMenuItem("Lecture de l’état…") { Enabled = false };
            syncItem = new ToolStripMenuItem("Dernière synchro : —") { Enabled = false };
            menu.Items.Add(statusItem); menu.Items.Add(syncItem); menu.Items.Add(new ToolStripSeparator());
            AddMenu("Afficher l’état", delegate { ShowStatus(); });
            if (!String.IsNullOrEmpty(config.DashboardUrl)) AddMenu("Ouvrir le tableau de bord", delegate { Open(config.DashboardUrl); });
            AddMenu("Ouvrir les journaux", delegate { OpenLog(); });
            AddMenu("Actualiser l’état", delegate { Refresh(); });
            menu.Items.Add(new ToolStripSeparator());
            restartItem = AddMenu("Redémarrer la collecte", delegate { ControlAgent("restart"); });
            pauseItem = AddMenu("Mettre la collecte en pause", delegate { ControlAgent("pause"); });
            resumeItem = AddMenu("Reprendre la collecte", delegate { ControlAgent("resume"); });
            menu.Items.Add(new ToolStripSeparator());
            AddMenu("Quitter l’icône", delegate { ExitThread(); });
            currentIcon = TrayArt.Create("paused", 32);
            icon = new NotifyIcon { Icon = currentIcon, Text = "Codex Usage · Lecture de l’état", ContextMenuStrip = menu, Visible = true };
            icon.DoubleClick += delegate { ShowStatus(); };
            timer = new System.Windows.Forms.Timer { Interval = 500 };
            timer.Tick += delegate {
                if (quitEvent.WaitOne(0)) { ExitThread(); return; }
                if (showEvent.WaitOne(0)) ShowStatus();
                if (++ticks >= 20) { ticks = 0; Refresh(); }
            };
            timer.Start();
            Apply(); Refresh();
            if (open) ShowStatus();
        }

        private ToolStripMenuItem AddMenu(string label, Action action)
        { var item = new ToolStripMenuItem(label); item.Click += delegate { action(); }; menu.Items.Add(item); return item; }

        private void Refresh()
        {
            if (reading || busy || exiting) return;
            reading = true;
            Task.Factory.StartNew(delegate {
                TraySnapshot value = TrayProbe.Read(configuration);
                Post(delegate { reading = false; snapshot = value; Apply(); });
            });
        }

        private void Post(Action action)
        { if (!exiting) { try { dispatcher.BeginInvoke(action); } catch (InvalidOperationException) { } } }

        private string LastSync()
        { return snapshot.LastSyncAt.HasValue ? snapshot.LastSyncAt.Value.ToLocalTime().ToString("dd/MM/yyyy HH:mm:ss") : "Aucune"; }

        private string TaskDescription()
        {
            return !snapshot.TaskInstalled ? "Non installée" : !snapshot.TaskEnabled ? "Désactivée" :
                snapshot.TaskState == 4 ? "Active" : "En attente de reprise";
        }

        private void Apply()
        {
            health = TrayHealth.Evaluate(snapshot, DateTimeOffset.UtcNow, configuration.MaxSyncAgeMinutes);
            statusItem.Text = health.Label;
            syncItem.Text = "Dernière synchro : " + LastSync();
            string tip = "Codex Usage · " + health.Label;
            icon.Text = tip.Length > 63 ? tip.Substring(0, 63) : tip;
            var previous = currentIcon; currentIcon = TrayArt.Create(health.State, 32); icon.Icon = currentIcon; previous.Dispose();
            pauseItem.Enabled = !busy && snapshot.TaskInstalled && snapshot.TaskEnabled;
            resumeItem.Enabled = !busy && snapshot.TaskInstalled && !snapshot.TaskEnabled;
            restartItem.Enabled = !busy && snapshot.TaskInstalled;
            if (statusWindow != null && !statusWindow.IsDisposed)
            {
                statusWindow.Icon = currentIcon;
                statusLabel.Text = busy ? "Commande en cours…" : health.Label;
                statusLabel.ForeColor = health.State == "connected" ? Color.FromArgb(19, 117, 78) :
                    health.State == "warning" ? Color.FromArgb(151, 92, 0) : Color.FromArgb(58, 70, 88);
                detailLabel.Text = health.Detail;
                syncLabel.Text = "Dernière synchronisation réussie\n" + LastSync();
                taskLabel.Text = "Collecte : " + TaskDescription() + "  ·  Collecteurs : " + snapshot.AgentCount;
                restartButton.Enabled = restartItem.Enabled;
            }
            // Diagnostic allowlist. Never serialize the enrollment file or credentials.
            try
            {
                var payload = new { pid = Process.GetCurrentProcess().Id, updatedAt = DateTimeOffset.UtcNow.ToString("o"),
                    iconVisible = icon.Visible, iconState = health.State, label = health.Label,
                    taskInstalled = snapshot.TaskInstalled, taskEnabled = snapshot.TaskEnabled,
                    taskState = snapshot.TaskState, agentCount = snapshot.AgentCount,
                    lastSyncAt = snapshot.LastSyncAt.HasValue ? snapshot.LastSyncAt.Value.ToString("o") : null,
                    statusWindowVisible = statusWindow != null && !statusWindow.IsDisposed && statusWindow.Visible };
                string temporary = configuration.StatusPath + ".tmp";
                Directory.CreateDirectory(Path.GetDirectoryName(configuration.StatusPath));
                File.WriteAllText(temporary, new JavaScriptSerializer().Serialize(payload), new UTF8Encoding(false));
                if (File.Exists(configuration.StatusPath)) File.Replace(temporary, configuration.StatusPath, null);
                else File.Move(temporary, configuration.StatusPath);
            }
            catch { /* Diagnostics must never interrupt collection or hide the icon. */ }
        }

        private void ShowStatus()
        {
            if (statusWindow == null || statusWindow.IsDisposed)
            {
                statusWindow = new Form { Text = "Codex Usage — Collecte Windows", ClientSize = new Size(520, 330),
                    StartPosition = FormStartPosition.CenterScreen, FormBorderStyle = FormBorderStyle.FixedSingle,
                    MaximizeBox = false, Font = new Font("Segoe UI", 10f), BackColor = Color.FromArgb(247, 249, 252), AutoScaleMode = AutoScaleMode.Dpi };
                var title = new Label { Text = "CODEX USAGE", Location = new Point(24, 20), AutoSize = true,
                    ForeColor = Color.FromArgb(60, 78, 104), Font = new Font("Segoe UI", 10f, FontStyle.Bold) };
                statusLabel = new Label { Location = new Point(22, 55), Size = new Size(478, 38), Font = new Font("Segoe UI", 18f, FontStyle.Bold) };
                detailLabel = new Label { Location = new Point(24, 101), Size = new Size(466, 48) };
                syncLabel = new Label { Location = new Point(24, 160), Size = new Size(466, 46) };
                taskLabel = new Label { Location = new Point(24, 218), Size = new Size(466, 24) };
                var logs = new Button { Text = "Journaux", Location = new Point(24, 270), Size = new Size(105, 34) };
                logs.Click += delegate { OpenLog(); };
                var refresh = new Button { Text = "Actualiser", Location = new Point(139, 270), Size = new Size(105, 34) };
                refresh.Click += delegate { Refresh(); };
                restartButton = new Button { Text = "Redémarrer la collecte", Location = new Point(254, 270), Size = new Size(240, 34) };
                restartButton.Click += delegate { ControlAgent("restart"); };
                statusWindow.Controls.AddRange(new Control[] { title, statusLabel, detailLabel, syncLabel, taskLabel, logs, refresh, restartButton });
                statusWindow.FormClosed += delegate { statusWindow = null; Apply(); };
            }
            statusWindow.Show(); statusWindow.WindowState = FormWindowState.Normal; statusWindow.Activate(); Apply(); Refresh();
        }

        private void OpenLog()
        { Open(File.Exists(configuration.LogPath) ? configuration.LogPath : Path.GetDirectoryName(configuration.LogPath)); }

        private void Open(string target)
        {
            try { Process.Start(new ProcessStartInfo(target) { UseShellExecute = true }); }
            catch { MessageBox.Show("Impossible d’ouvrir cette destination.", "Codex Usage", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
        }

        private void ControlAgent(string action)
        {
            if (busy) return;
            busy = true; Apply();
            Task.Factory.StartNew(delegate {
                bool success = true;
                try { TrayProbe.Control(configuration.TaskName, action); }
                catch { success = false; }
                Post(delegate {
                    busy = false;
                    if (!success) MessageBox.Show("La commande de collecte a échoué. Consultez les journaux.", "Codex Usage", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    Refresh(); Apply();
                });
            });
        }

        protected override void ExitThreadCore()
        {
            exiting = true; timer.Stop(); timer.Dispose();
            icon.Visible = false; Apply(); icon.Dispose(); menu.Dispose();
            if (statusWindow != null) statusWindow.Dispose();
            currentIcon.Dispose(); dispatcher.Dispose();
            base.ExitThreadCore();
        }
    }

    public static class TrayApp
    {
        // Run inside the ordinary interactive process, so shortcuts are also
        // visible when installation was initiated by a virtualized MSIX caller.
        public static void EnsureShortcut(TrayConfiguration config)
        {
            if (String.IsNullOrEmpty(config.ShortcutPath)) return;
            object shell = null, shortcut = null;
            try
            {
                shell = Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell", true));
                shortcut = ((dynamic)shell).CreateShortcut(config.ShortcutPath);
                ((dynamic)shortcut).TargetPath = Application.ExecutablePath;
                ((dynamic)shortcut).Arguments = "--status";
                ((dynamic)shortcut).WorkingDirectory = Path.GetDirectoryName(Application.ExecutablePath);
                ((dynamic)shortcut).IconLocation = config.IconPath;
                ((dynamic)shortcut).Description = "État de la collecte Codex Usage";
                ((dynamic)shortcut).Save();
            }
            finally
            {
                if (shortcut != null) Marshal.FinalReleaseComObject(shortcut);
                if (shell != null) Marshal.FinalReleaseComObject(shell);
            }
        }

        [STAThread]
        public static int Main(string[] args)
        {
            try
            {
                if (args.Length == 2 && args[0] == "--export-icon")
                {
                    TrayArt.Export(args[1]);
                    return 0;
                }
                string configPath = Path.ChangeExtension(Application.ExecutablePath, ".json");
                var config = new JavaScriptSerializer().Deserialize<TrayConfiguration>(File.ReadAllText(configPath, Encoding.UTF8));
                if (String.IsNullOrEmpty(config.TaskName) || !Path.IsPathRooted(config.StatePath) || !Path.IsPathRooted(config.AgentPath) ||
                    !Path.IsPathRooted(config.StatusPath) || !Path.IsPathRooted(config.LogPath) || config.MaxSyncAgeMinutes < 1) return 2;
                if (!String.IsNullOrEmpty(config.DashboardUrl))
                {
                    Uri url;
                    if (!Uri.TryCreate(config.DashboardUrl, UriKind.Absolute, out url) || (url.Scheme != "https" && url.Scheme != "http")) return 2;
                }
                string key;
                using (var hash = SHA256.Create()) key = BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(configPath.ToLowerInvariant()))).Replace("-", "").Substring(0, 24);
                bool created;
                using (var mutex = new Mutex(true, "Local\\CodexUsageMesh.Tray." + key, out created))
                using (var show = new EventWaitHandle(false, EventResetMode.AutoReset, "Local\\CodexUsageMesh.Tray.Show." + key))
                using (var quit = new EventWaitHandle(false, EventResetMode.AutoReset, "Local\\CodexUsageMesh.Tray.Quit." + key))
                {
                    bool close = Array.IndexOf(args, "--quit") >= 0;
                    if (!created) { if (close) quit.Set(); else show.Set(); return 0; }
                    if (close) return 0;
                    try { EnsureShortcut(config); } catch { /* Tray remains usable if the shortcut cannot be written. */ }
                    Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
                    using (var context = new TrayContext(config, show, quit, Array.IndexOf(args, "--status") >= 0)) Application.Run(context);
                    mutex.ReleaseMutex();
                }
                return 0;
            }
            catch
            {
                MessageBox.Show("L’application de notification n’a pas pu démarrer. Réinstallez-la avec Install-CodexUsageTray.ps1.", "Codex Usage", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return 1;
            }
        }
    }
}
