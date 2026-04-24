using System.Runtime.InteropServices;
using System.Text;
using PrimusKiosk.Core.Abstractions;
using Serilog;

namespace PrimusKiosk.Core.Native;

/// <summary>
/// Managed wrapper over the <c>PrimusKiosk.Native.dll</c> C/C++ exports.
/// Every method checks <see cref="IsAvailable"/> and falls back to safe managed behavior
/// when the DLL is missing, so builds without the native project still run (minus the
/// features that genuinely require kernel/user32 interop, which are addressed in P8).
/// </summary>
public sealed class NativeBridge : INativeBridge
{
    private const string Dll = "PrimusKiosk.Native";

    public bool IsAvailable { get; }

    public NativeBridge()
    {
        IsAvailable = ProbeNativeLibrary();
        if (!IsAvailable)
        {
            Log.Information("PrimusKiosk.Native DLL not loaded; operating in managed-fallback mode.");
        }
    }

    private static bool ProbeNativeLibrary()
    {
        try
        {
            // Lightweight probe: calling a cheap export verifies the load and exports exist.
            _ = PK_Version();
            return true;
        }
        catch (DllNotFoundException)
        {
            return false;
        }
        catch (EntryPointNotFoundException)
        {
            return false;
        }
        catch (Exception ex)
        {
            Log.Debug(ex, "Native DLL probe failed with unexpected exception.");
            return false;
        }
    }

    // ---------------- Keyboard hook ------------------------------------

    public void InstallKeyboardHook()
    {
        if (!IsAvailable) return;
        try { PK_InstallKeyboardHook(); }
        catch (Exception ex) { Log.Warning(ex, "PK_InstallKeyboardHook failed."); }
    }

    public void UninstallKeyboardHook()
    {
        if (!IsAvailable) return;
        try { PK_UninstallKeyboardHook(); }
        catch (Exception ex) { Log.Warning(ex, "PK_UninstallKeyboardHook failed."); }
    }

    public void SetKeyboardHookAllowlist(bool allowSystemKeys)
    {
        if (!IsAvailable) return;
        try { PK_SetKeyboardHookAllowlist(allowSystemKeys ? 1 : 0); }
        catch (Exception ex) { Log.Debug(ex, "PK_SetKeyboardHookAllowlist failed."); }
    }

    // ---------------- Screenshot ---------------------------------------

    public Task<string> CaptureScreenshotPngAsync(int quality, CancellationToken cancellationToken)
    {
        if (IsAvailable)
        {
            return Task.Run(() =>
            {
                var buffer = new StringBuilder(260);
                var hr = PK_CaptureScreenshotPng(buffer, buffer.Capacity, quality);
                if (hr != 0)
                {
                    throw new InvalidOperationException($"PK_CaptureScreenshotPng returned HRESULT 0x{hr:X8}");
                }
                return buffer.ToString();
            }, cancellationToken);
        }

        // Managed fallback: System.Drawing.Graphics.CopyFromScreen is implemented by
        // Kiosk.GdiScreenshotService (P7) — this method only exists as a native-path convenience.
        throw new NotSupportedException("Native screenshot capture not available; use GdiScreenshotService.");
    }

    // ---------------- Process enumeration ------------------------------

    public IReadOnlyList<NativeProcessInfo> EnumerateProcesses()
    {
        if (!IsAvailable)
        {
            return System.Diagnostics.Process.GetProcesses()
                .Select(p =>
                {
                    string? title = null;
                    try { title = string.IsNullOrEmpty(p.MainWindowTitle) ? null : p.MainWindowTitle; }
                    catch { /* ignore access denied */ }
                    return new NativeProcessInfo
                    {
                        ProcessId = p.Id,
                        Name = p.ProcessName,
                        MainWindowTitle = title,
                    };
                })
                .ToArray();
        }

        var result = new List<NativeProcessInfo>();
        const int capacity = 512;
        var buffer = new PK_ProcessInfo[capacity];
        try
        {
            var count = PK_EnumerateProcesses(buffer, capacity);
            for (var i = 0; i < count; i++)
            {
                result.Add(new NativeProcessInfo
                {
                    ProcessId = (int)buffer[i].ProcessId,
                    Name = buffer[i].Name ?? string.Empty,
                    MainWindowTitle = string.IsNullOrEmpty(buffer[i].WindowTitle) ? null : buffer[i].WindowTitle,
                });
            }
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "PK_EnumerateProcesses failed; returning empty list.");
        }

        return result;
    }

    public void SwitchToWindow(int pid)
    {
        if (IsAvailable)
        {
            try { PK_SwitchToWindow((uint)pid); return; }
            catch (Exception ex) { Log.Debug(ex, "PK_SwitchToWindow failed; skipping."); }
        }
    }

    public int LaunchProcess(string executable, string? arguments)
    {
        if (IsAvailable)
        {
            try
            {
                var hr = PK_LaunchProcess(executable, arguments ?? string.Empty, out var pid);
                if (hr == 0) return (int)pid;
                Log.Warning("PK_LaunchProcess returned HRESULT 0x{Hr:X8}", hr);
            }
            catch (Exception ex)
            {
                Log.Warning(ex, "PK_LaunchProcess threw; falling back to Process.Start.");
            }
        }

        var psi = new System.Diagnostics.ProcessStartInfo
        {
            FileName = executable,
            Arguments = arguments ?? string.Empty,
            UseShellExecute = true,
        };
        using var proc = System.Diagnostics.Process.Start(psi);
        return proc?.Id ?? -1;
    }

    // ---------------- Window / shell -----------------------------------

    public void HideTaskbar(bool hide)
    {
        if (!IsAvailable) return;
        try { PK_HideTaskbar(hide ? 1 : 0); }
        catch (Exception ex) { Log.Debug(ex, "PK_HideTaskbar failed."); }
    }

    // ---------------- Hardware fingerprint -----------------------------

    public Task<string> GenerateHardwareFingerprintAsync(CancellationToken cancellationToken)
    {
        if (!IsAvailable)
        {
            return Task.FromResult(string.Empty);
        }

        return Task.Run(() =>
        {
            var buffer = new StringBuilder(128);
            var hr = PK_GenerateHardwareFingerprint(buffer, buffer.Capacity);
            if (hr != 0)
            {
                Log.Warning("PK_GenerateHardwareFingerprint returned HRESULT 0x{Hr:X8}", hr);
                return string.Empty;
            }
            return buffer.ToString();
        }, cancellationToken);
    }

    // ---------------- P/Invoke declarations ----------------------------

    [DllImport(Dll, CharSet = CharSet.Unicode, CallingConvention = CallingConvention.Cdecl)]
    private static extern int PK_Version();

    [DllImport(Dll, CharSet = CharSet.Unicode, CallingConvention = CallingConvention.Cdecl)]
    private static extern int PK_InstallKeyboardHook();

    [DllImport(Dll, CharSet = CharSet.Unicode, CallingConvention = CallingConvention.Cdecl)]
    private static extern int PK_UninstallKeyboardHook();

    [DllImport(Dll, CharSet = CharSet.Unicode, CallingConvention = CallingConvention.Cdecl)]
    private static extern int PK_SetKeyboardHookAllowlist(int allowSystemKeys);

    [DllImport(Dll, CharSet = CharSet.Unicode, CallingConvention = CallingConvention.Cdecl)]
    private static extern int PK_CaptureScreenshotPng(StringBuilder outPath, int outPathCapacity, int quality);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct PK_ProcessInfo
    {
        public uint ProcessId;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
        public string Name;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
        public string WindowTitle;
    }

    [DllImport(Dll, CharSet = CharSet.Unicode, CallingConvention = CallingConvention.Cdecl)]
    private static extern int PK_EnumerateProcesses([Out] PK_ProcessInfo[] buffer, int capacity);

    [DllImport(Dll, CharSet = CharSet.Unicode, CallingConvention = CallingConvention.Cdecl)]
    private static extern int PK_SwitchToWindow(uint pid);

    [DllImport(Dll, CharSet = CharSet.Unicode, CallingConvention = CallingConvention.Cdecl)]
    private static extern int PK_LaunchProcess(
        [MarshalAs(UnmanagedType.LPWStr)] string executable,
        [MarshalAs(UnmanagedType.LPWStr)] string arguments,
        out uint outPid);

    [DllImport(Dll, CharSet = CharSet.Unicode, CallingConvention = CallingConvention.Cdecl)]
    private static extern int PK_HideTaskbar(int hide);

    [DllImport(Dll, CharSet = CharSet.Unicode, CallingConvention = CallingConvention.Cdecl)]
    private static extern int PK_GenerateHardwareFingerprint(StringBuilder outBuffer, int capacity);
}
