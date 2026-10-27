using System;
using System.IO;
using System.Drawing;
using System.Threading;
using CodexUsageMesh;

public static class TrayTests
{
    private static int assertions;
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-10-23T12:00:00Z");
    private static TraySnapshot Healthy()
    { return new TraySnapshot { TaskInstalled = true, TaskEnabled = true, TaskState = 4, AgentCount = 1, Enrolled = true, LastSyncAt = Now.AddSeconds(-20) }; }
    private static void Check(string expected, Action<TraySnapshot> change)
    {
        var value = Healthy(); change(value);
        string actual = TrayHealth.Evaluate(value, Now, 5).State;
        if (actual != expected) throw new Exception("Expected " + expected + ", got " + actual);
        assertions++;
    }
    public static int Main(string[] args)
    {
        try
        {
            if (args.Length > 0 && args[0] == "--brief-worker") { Thread.Sleep(2000); return 0; }
            if (args.Length > 0 && args[0] == "--worker") { Thread.Sleep(120000); return 0; }
            if (args.Length == 3 && args[0] == "--control") { TrayProbe.Control(args[1], args[2]); return 0; }
            Check("connected", value => { });
            Check("connected", value => { value.LastSyncAt = Now.AddMinutes(-5); });
            Check("warning", value => { value.LastSyncAt = Now.AddMinutes(-5).AddSeconds(-1); });
            Check("warning", value => { value.LastSyncAt = null; });
            Check("warning", value => { value.LastSyncAt = Now.AddMinutes(2); });
            Check("warning", value => { value.Enrolled = false; });
            Check("warning", value => { value.AgentCount = 2; });
            Check("warning", value => { value.Error = "Unreadable state"; });
            Check("offline", value => { value.TaskInstalled = false; });
            Check("offline", value => { value.TaskState = 3; });
            Check("offline", value => { value.AgentCount = 0; });
            Check("paused", value => { value.TaskEnabled = false; });
            // A fresh successful sync cannot turn a paused/stopped collector green.
            Check("paused", value => { value.TaskEnabled = false; value.LastSyncAt = Now; });
            Check("offline", value => { value.AgentCount = 0; value.LastSyncAt = Now; });
            string statePath = Path.Combine(args[0], "fixture-state.json");
            var config = new TrayConfiguration { TaskName = "CodexUsageMesh-Missing-" + Guid.NewGuid().ToString("N"), StatePath = statePath,
                AgentPath = Path.Combine(args[0], "nonexistent-agent.mjs") };
            File.WriteAllText(statePath, "{\"nodeId\":\"fixture\",\"lastSyncAt\":\"2026-10-23T12:00:00Z\",\"privateKey\":\"NEVER_REPORT_THIS\"}");
            TrayProbe.WithTask<int>(config.TaskName, task => 1, 0);
            var probe = TrayProbe.Read(config);
            if (probe.Error != null || !probe.Enrolled || probe.LastSyncAt != Now || probe.TaskInstalled || probe.AgentCount != 0)
                throw new Exception("State probe failed: " + probe.Error + ", enrolled=" + probe.Enrolled + ", sync=" + probe.LastSyncAt + ", installed=" + probe.TaskInstalled + ", count=" + probe.AgentCount);
            assertions++;
            File.WriteAllText(statePath, "corrupt private state NEVER_REPORT_THIS");
            probe = TrayProbe.Read(config);
            if (String.IsNullOrEmpty(probe.Error) || probe.Error.Contains("NEVER_REPORT_THIS")) throw new Exception("Probe error leaked state");
            assertions++;
            using (var icon = TrayArt.Create("warning", 32))
                if (icon.Width != 32 || icon.Height != 32) throw new Exception("Icon dimensions invalid");
            assertions++;
            using (var icon = TrayArt.Create(null, 64))
            using (var brand = icon.ToBitmap())
            using (var greenIcon = TrayArt.Create("connected", 64))
            using (var green = greenIcon.ToBitmap())
            using (var amberIcon = TrayArt.Create("warning", 64))
            using (var amber = amberIcon.ToBitmap())
            using (var grayIcon = TrayArt.Create("paused", 64))
            using (var gray = grayIcon.ToBitmap())
            {
                // Recognizable existing brand: lime bar and orange bar, not the former terminal glyph.
                Color lime = brand.GetPixel(18, 42), orange = brand.GetPixel(45, 35);
                if (lime.G < 180 || lime.R < 150 || orange.R < 200 || orange.G < 100 || orange.G > 190) throw new Exception("Official brand pixels missing");
                assertions++;
                for (int y = 0; y < 44; y++)
                    for (int x = 0; x < 64; x++)
                        if (brand.GetPixel(x, y) != green.GetPixel(x, y)) throw new Exception("Status badge altered the logo outside its corner");
                assertions++;
                if (green.GetPixel(54, 54).G <= green.GetPixel(54, 54).R || amber.GetPixel(54, 54).R <= amber.GetPixel(54, 54).G || gray.GetPixel(54, 54) == green.GetPixel(54, 54)) throw new Exception("Status colors are not distinct");
                assertions++;
                using (var small = TrayArt.Create("connected", 16))
                    if (small.Width != 16 || small.Height != 16) throw new Exception("Notification-area icon size invalid");
                assertions++;
            }
            string exportedPath = Path.Combine(args[0], "brand.ico");
            TrayArt.Export(exportedPath);
            using (var exported = new Icon(exportedPath, 64, 64))
            using (var bitmap = exported.ToBitmap())
            {
                Color lime = bitmap.GetPixel(18, 42), orange = bitmap.GetPixel(45, 35);
                if (lime.G < 180 || lime.R < 150 || orange.R < 200 || orange.G < 100 || orange.G > 190) throw new Exception("Exported ICO lost brand colors");
                assertions++;
            }
            using (var exported = new Icon(exportedPath, 16, 16))
                if (exported.Width != 16 || exported.Height != 16) throw new Exception("Exported ICO lacks notification-area size");
            assertions++;
            Console.WriteLine(assertions);
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}
