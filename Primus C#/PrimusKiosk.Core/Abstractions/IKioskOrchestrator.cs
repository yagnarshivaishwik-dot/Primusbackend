namespace PrimusKiosk.Core.Abstractions;

/// <summary>
/// Coordinates everything needed to enter or exit full kiosk lockdown:
/// shell replacement, auto-boot, keyboard hook, taskbar hide.
/// </summary>
public interface IKioskOrchestrator
{
    Task EnableAsync(CancellationToken cancellationToken);
    Task DisableAsync(CancellationToken cancellationToken);
    bool IsActive { get; }
}
