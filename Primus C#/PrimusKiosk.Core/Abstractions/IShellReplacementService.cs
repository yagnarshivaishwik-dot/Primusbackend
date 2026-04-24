namespace PrimusKiosk.Core.Abstractions;

/// <summary>
/// Installs / removes this application as the Windows user shell by writing
/// <c>HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon\Shell</c>.
///
/// Shell replacement is the only way to fully lock down a Windows kiosk —
/// it stops <c>explorer.exe</c> from starting at login, which means no
/// taskbar, no Start menu, no File Explorer, no Win+E hotkeys, and no way
/// for a user to Alt-Tab out of the app. Applies on next login / reboot.
///
/// Requires administrator rights. Methods return <c>false</c> (rather than
/// throwing) when permissions are insufficient, so callers can degrade to
/// the lighter in-process kiosk lockdown.
/// </summary>
public interface IShellReplacementService
{
    /// <summary>
    /// Current state of the machine-wide shell override.
    /// </summary>
    ShellReplacementStatus GetStatus();

    /// <summary>
    /// Writes <c>Winlogon\Shell</c> to point at this process's executable so
    /// Windows launches it instead of Explorer on next login. Returns the
    /// resulting status (<see cref="ShellReplacementStatus.Enabled"/> on success).
    /// </summary>
    ShellReplacementStatus Enable();

    /// <summary>
    /// Restores <c>Winlogon\Shell</c> to <c>explorer.exe</c>. Call this before
    /// uninstalling or when an admin wants to fully exit kiosk mode on
    /// next login. Returns the resulting status.
    /// </summary>
    ShellReplacementStatus Disable();
}

/// <summary>
/// Observable state of <c>HKLM\...\Winlogon\Shell</c>.
/// </summary>
public sealed record ShellReplacementStatus(
    bool IsReplaced,
    string? CurrentShellPath,
    string ThisAppPath,
    bool HasAdminRights,
    string? LastError = null);
