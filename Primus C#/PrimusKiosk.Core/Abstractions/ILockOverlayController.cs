namespace PrimusKiosk.Core.Abstractions;

/// <summary>
/// Contract that lets Core command handlers drive the lock overlay without
/// taking a hard dependency on PresentationCore. The App layer provides the
/// WPF implementation; additionally, <see cref="StateChanged"/> is raised
/// so the WebView2 bridge can forward the lock state to the React UI for
/// full-screen presentation.
/// </summary>
public interface ILockOverlayController
{
    void Show(string? message);
    void Hide();

    /// <summary>
    /// Raised whenever <see cref="Show"/> or <see cref="Hide"/> is called,
    /// with the new locked state and optional message.
    /// </summary>
    event EventHandler<LockStateEventArgs>? StateChanged;
}

public sealed class LockStateEventArgs : EventArgs
{
    public bool Locked { get; }
    public string? Message { get; }

    public LockStateEventArgs(bool locked, string? message)
    {
        Locked = locked;
        Message = message;
    }
}
