using System.Diagnostics;
using System.Runtime.InteropServices;
using PrimusKiosk.Core.Abstractions;
using Serilog;

namespace PrimusKiosk.Core.Kiosk;

/// <summary>
/// Wraps Windows system control primitives (shutdown/restart/logoff/lock) using
/// <see cref="Process.Start(ProcessStartInfo)"/> where possible and P/Invoke otherwise.
/// </summary>
public sealed class SystemControl : ISystemControl
{
    public Task ShutdownAsync(TimeSpan delay, string? reason = null, CancellationToken cancellationToken = default)
    {
        var args = $"/s /t {(int)delay.TotalSeconds}";
        if (!string.IsNullOrWhiteSpace(reason))
        {
            args += $" /c \"{reason.Replace("\"", "''")}\"";
        }

        Spawn("shutdown.exe", args);
        return Task.CompletedTask;
    }

    public Task RestartAsync(TimeSpan delay, string? reason = null, CancellationToken cancellationToken = default)
    {
        var args = $"/r /t {(int)delay.TotalSeconds}";
        if (!string.IsNullOrWhiteSpace(reason))
        {
            args += $" /c \"{reason.Replace("\"", "''")}\"";
        }

        Spawn("shutdown.exe", args);
        return Task.CompletedTask;
    }

    public Task LogoffAsync(CancellationToken cancellationToken = default)
    {
        Spawn("logoff.exe", string.Empty);
        return Task.CompletedTask;
    }

    public Task LockWorkstationAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            LockWorkStation();
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "LockWorkStation P/Invoke failed; falling back to rundll32.");
            Spawn("rundll32.exe", "user32.dll,LockWorkStation");
        }
        return Task.CompletedTask;
    }

    public Task CancelShutdownAsync(CancellationToken cancellationToken = default)
    {
        Spawn("shutdown.exe", "/a");
        return Task.CompletedTask;
    }

    private static void Spawn(string fileName, string arguments)
    {
        try
        {
            using var proc = Process.Start(new ProcessStartInfo
            {
                FileName = fileName,
                Arguments = arguments,
                UseShellExecute = false,
                CreateNoWindow = true,
            });
            Log.Information("Spawned {File} {Args} (pid {Pid}).", fileName, arguments, proc?.Id);
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Failed to spawn {File} {Args}.", fileName, arguments);
        }
    }

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool LockWorkStation();
}
