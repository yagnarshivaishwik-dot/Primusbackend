using System.Runtime.InteropServices;
using PrimusKiosk.Core.Abstractions;

namespace PrimusKiosk.Core.Kiosk;

/// <summary>
/// Wraps <c>user32!GetLastInputInfo</c> to report how long the user has been idle.
/// The underlying tick counter wraps every ~49.7 days; we handle the wrap by casting
/// through <see cref="uint"/>.
/// </summary>
public sealed class IdleMonitor : IIdleMonitor
{
    public TimeSpan GetIdleDuration()
    {
        var info = new LASTINPUTINFO
        {
            cbSize = (uint)Marshal.SizeOf<LASTINPUTINFO>(),
            dwTime = 0,
        };

        if (!GetLastInputInfo(ref info))
        {
            return TimeSpan.Zero;
        }

        var ticks = Environment.TickCount;
        var lastInput = unchecked((uint)info.dwTime);
        var now = unchecked((uint)ticks);
        var idleMs = unchecked((int)(now - lastInput));
        if (idleMs < 0) idleMs = 0;
        return TimeSpan.FromMilliseconds(idleMs);
    }

    public bool IsIdle(TimeSpan threshold) => GetIdleDuration() >= threshold;

    [StructLayout(LayoutKind.Sequential)]
    private struct LASTINPUTINFO
    {
        public uint cbSize;
        public uint dwTime;
    }

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
}
