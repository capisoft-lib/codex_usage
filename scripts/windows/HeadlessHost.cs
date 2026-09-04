// Compiled locally as a Windows application by Install-CodexUsageMesh.ps1.
// No console is allocated to this host, PowerShell, or the reporting agent.
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;

namespace CodexUsageMesh
{
    public static class HeadlessProcess
    {
        private static readonly object LogLock = new object();

        public static string QuoteArgument(string value)
        {
            // Windows CommandLineToArgvW / CRT quoting, including trailing slashes.
            var result = new StringBuilder("\"");
            int slashes = 0;
            foreach (char c in value)
            {
                if (c == '\\') { slashes++; continue; }
                result.Append('\\', c == '"' ? slashes * 2 + 1 : slashes);
                result.Append(c);
                slashes = 0;
            }
            result.Append('\\', slashes * 2);
            return result.Append('"').ToString();
        }

        private static void WriteLog(string path, string message)
        {
            lock (LogLock)
            {
                Directory.CreateDirectory(Path.GetDirectoryName(path));
                File.AppendAllText(path, "[" + DateTimeOffset.Now.ToString("yyyy-MM-ddTHH:mm:ss.fffzzz") + "] " + message + Environment.NewLine, new UTF8Encoding(false));
            }
        }

        public static int Run(string executable, string[] arguments, string directory, string logPath, string prefix)
        {
            using (var job = new ChildJob())
            using (var process = new Process())
            {
                process.StartInfo = new ProcessStartInfo {
                    FileName = executable,
                    Arguments = String.Join(" ", arguments.Select(QuoteArgument)),
                    WorkingDirectory = directory,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardInput = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    StandardOutputEncoding = Encoding.UTF8,
                    StandardErrorEncoding = Encoding.UTF8
                };
                Exception logError = null;
                DataReceivedEventHandler receive = delegate(object sender, DataReceivedEventArgs e) {
                    if (e.Data == null) return;
                    try { WriteLog(logPath, prefix + ": " + e.Data); }
                    catch (Exception error) { lock (LogLock) { logError = error; } }
                };
                process.OutputDataReceived += receive;
                process.ErrorDataReceived += receive;
                process.Start();
                try
                {
                    job.Assign(process);
                    process.StandardInput.Close();
                    process.BeginOutputReadLine();
                    process.BeginErrorReadLine();
                    process.WaitForExit(); // Also waits for asynchronous output handlers.
                    Exception finalLogError;
                    lock (LogLock) { finalLogError = logError; }
                    if (finalLogError != null) throw new IOException("Unable to write the agent log.", finalLogError);
                    return process.ExitCode;
                }
                catch
                {
                    if (!process.HasExited) { process.Kill(); process.WaitForExit(); }
                    throw;
                }
            }
        }

        [STAThread]
        public static int Main(string[] args)
        {
            if (args.Length != 2 || !Path.IsPathRooted(args[0]) || !Path.IsPathRooted(args[1])) return 2;
            try
            {
                var powershell = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell", "v1.0", "powershell.exe");
                return Run(powershell, new[] { "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", args[0] }, Path.GetDirectoryName(args[0]), args[1], "host");
            }
            catch (Exception error)
            {
                try { WriteLog(args[1], "headless host failed: " + error.Message); } catch { }
                return 1;
            }
        }

        private sealed class ChildJob : IDisposable
        {
            private IntPtr handle;
            [StructLayout(LayoutKind.Sequential)]
            private struct BasicLimits {
                public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
                public uint LimitFlags;
                public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
                public uint ActiveProcessLimit;
                public UIntPtr Affinity;
                public uint PriorityClass, SchedulingClass;
            }
            [StructLayout(LayoutKind.Sequential)]
            private struct IoCounters { public ulong ReadOperations, WriteOperations, OtherOperations, ReadBytes, WriteBytes, OtherBytes; }
            [StructLayout(LayoutKind.Sequential)]
            private struct ExtendedLimits {
                public BasicLimits Basic;
                public IoCounters Io;
                public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
            }
            [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
            private static extern IntPtr CreateJobObject(IntPtr attributes, string name);
            [DllImport("kernel32.dll", SetLastError = true)]
            private static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref ExtendedLimits info, uint size);
            [DllImport("kernel32.dll", SetLastError = true)]
            private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
            [DllImport("kernel32.dll")]
            private static extern bool CloseHandle(IntPtr handle);

            public ChildJob()
            {
                handle = CreateJobObject(IntPtr.Zero, null);
                if (handle == IntPtr.Zero) throw new Win32Exception();
                var limits = new ExtendedLimits();
                limits.Basic.LimitFlags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
                if (!SetInformationJobObject(handle, 9, ref limits, (uint)Marshal.SizeOf(limits)))
                {
                    var error = new Win32Exception();
                    Dispose();
                    throw error;
                }
            }
            public void Assign(Process process)
            {
                if (!AssignProcessToJobObject(handle, process.Handle) && !process.HasExited) throw new Win32Exception();
            }
            public void Dispose()
            {
                if (handle != IntPtr.Zero) { CloseHandle(handle); handle = IntPtr.Zero; }
            }
        }
    }
}
