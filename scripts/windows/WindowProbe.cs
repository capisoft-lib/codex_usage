using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

namespace CodexUsageMesh
{
    public sealed class WindowRecord
    {
        public long Handle;
        public long Owner;
        public uint ProcessId;
        public bool Visible;
        public string ClassName;
        public int Width;
        public int Height;
    }

    public static class WindowProbe
    {
        private delegate bool Callback(IntPtr hwnd, IntPtr parameter);
        [StructLayout(LayoutKind.Sequential)]
        private struct Rect { public int Left, Top, Right, Bottom; }
        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool EnumWindows(Callback callback, IntPtr parameter);
        [DllImport("user32.dll")]
        private static extern bool IsWindowVisible(IntPtr hwnd);
        [DllImport("user32.dll")]
        private static extern bool GetWindowRect(IntPtr hwnd, out Rect rect);
        [DllImport("user32.dll")]
        private static extern IntPtr GetWindow(IntPtr hwnd, uint command);
        [DllImport("user32.dll")]
        private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern int GetClassName(IntPtr hwnd, StringBuilder name, int capacity);

        public static WindowRecord[] Snapshot()
        {
            var windows = new List<WindowRecord>();
            if (!EnumWindows(delegate(IntPtr hwnd, IntPtr parameter) {
                uint processId;
                GetWindowThreadProcessId(hwnd, out processId);
                var name = new StringBuilder(256);
                GetClassName(hwnd, name, name.Capacity);
                Rect rect;
                bool hasRect = GetWindowRect(hwnd, out rect);
                bool visible = IsWindowVisible(hwnd);
                windows.Add(new WindowRecord {
                    Handle = hwnd.ToInt64(), Owner = GetWindow(hwnd, 4).ToInt64(),
                    ProcessId = processId, Visible = visible, ClassName = name.ToString(),
                    // If geometry cannot be inspected, treat a visible matched
                    // window as non-zero so the diagnostic fails closed.
                    Width = hasRect ? rect.Right - rect.Left : (visible ? 1 : 0),
                    Height = hasRect ? rect.Bottom - rect.Top : (visible ? 1 : 0)
                });
                return true;
            }, IntPtr.Zero)) throw new Win32Exception();
            return windows.ToArray();
        }

        // Test the same classification without displaying windows on the desktop.
        public static WindowRecord[] VisibleWindows(uint[] processIds, WindowRecord[] windows)
        {
            var ids = new HashSet<uint>(processIds);
            var byHandle = new Dictionary<long, WindowRecord>();
            foreach (var window in windows) byHandle[window.Handle] = window;
            var visited = new HashSet<long>();
            var result = new List<WindowRecord>();
            foreach (var root in windows)
            {
                if (!ids.Contains(root.ProcessId)) continue;
                var window = root;
                while (window != null && visited.Add(window.Handle))
                {
                    if (window.Visible && window.ClassName != "PseudoConsoleWindow" && window.Width > 0 && window.Height > 0) result.Add(window);
                    // Zero-sized pseudoconsoles can belong to a visible Terminal
                    // window in a different process; inspect their owner chain.
                    if (!byHandle.TryGetValue(window.Owner, out window)) break;
                }
            }
            return result.ToArray();
        }
    }
}
