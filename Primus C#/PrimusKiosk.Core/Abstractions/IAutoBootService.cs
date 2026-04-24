namespace PrimusKiosk.Core.Abstractions;

/// <summary>
/// Manages the Windows auto-start registry entry that launches the kiosk at logon.
/// Writes to <c>HKCU\Software\Microsoft\Windows\CurrentVersion\Run</c>.
/// </summary>
public interface IAutoBootService
{
    Task<bool> IsEnabledAsync(CancellationToken cancellationToken);
    Task EnableAsync(CancellationToken cancellationToken);
    Task DisableAsync(CancellationToken cancellationToken);
}
