using Microsoft.Win32;
using PrimusKiosk.Core.Abstractions;
using Serilog;

namespace PrimusKiosk.Core.Kiosk;

/// <summary>
/// Manages <c>HKCU\Software\Microsoft\Windows\CurrentVersion\Run\PrimusKiosk</c> so the
/// kiosk launches automatically at user logon. No admin rights required.
/// </summary>
public sealed class AutoBootService : IAutoBootService
{
    private const string RunKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string ValueName = "PrimusKiosk";

    public Task<bool> IsEnabledAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, writable: false);
            var value = key?.GetValue(ValueName) as string;
            return Task.FromResult(!string.IsNullOrWhiteSpace(value));
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Failed to read auto-boot state.");
            return Task.FromResult(false);
        }
    }

    public Task EnableAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var key = Registry.CurrentUser.CreateSubKey(RunKeyPath, writable: true)
                           ?? throw new InvalidOperationException("Could not open HKCU Run key.");
            var exePath = Environment.ProcessPath ?? throw new InvalidOperationException("ProcessPath unavailable.");
            key.SetValue(ValueName, $"\"{exePath}\"");
            Log.Information("Auto-boot enabled: {Exe}", exePath);
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Failed to enable auto-boot.");
            throw;
        }
        return Task.CompletedTask;
    }

    public Task DisableAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, writable: true);
            if (key?.GetValue(ValueName) is not null)
            {
                key.DeleteValue(ValueName, throwOnMissingValue: false);
                Log.Information("Auto-boot disabled.");
            }
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Failed to disable auto-boot.");
        }
        return Task.CompletedTask;
    }
}
