using Microsoft.Extensions.Options;
using PrimusKiosk.Core.Abstractions;
using PrimusKiosk.Core.Infrastructure;
using Serilog;

namespace PrimusKiosk.Core.Kiosk;

/// <summary>
/// Coordinates the steps required to enter or exit full kiosk lockdown. Actual shell
/// replacement + auto-boot + keyboard hook are stubbed/minimal in P0-P4; the full
/// implementation lands in P8.
/// </summary>
public sealed class KioskOrchestrator : IKioskOrchestrator
{
    private readonly PrimusSettings _settings;
    private readonly INativeBridge _native;

    public KioskOrchestrator(IOptionsMonitor<PrimusSettings> settings, INativeBridge native)
    {
        _settings = settings.CurrentValue;
        _native = native;
    }

    public bool IsActive { get; private set; }

    public Task EnableAsync(CancellationToken cancellationToken)
    {
        if (IsActive) return Task.CompletedTask;

        if (_settings.KeyboardHookEnabled)
        {
            _native.InstallKeyboardHook();
        }

        if (_settings.HideTaskbar)
        {
            _native.HideTaskbar(true);
        }

        // Shell replacement + auto-boot are performed by the installer + P8 services;
        // this orchestrator only toggles in-process behavior.
        IsActive = true;
        Log.Information("Kiosk mode enabled (keyboard-hook={Hook}, hide-taskbar={Taskbar}).",
            _settings.KeyboardHookEnabled, _settings.HideTaskbar);

        return Task.CompletedTask;
    }

    public Task DisableAsync(CancellationToken cancellationToken)
    {
        if (!IsActive) return Task.CompletedTask;

        _native.UninstallKeyboardHook();
        _native.HideTaskbar(false);
        IsActive = false;

        Log.Information("Kiosk mode disabled.");
        return Task.CompletedTask;
    }
}
