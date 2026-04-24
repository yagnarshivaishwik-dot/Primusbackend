namespace PrimusKiosk.Core.Abstractions;

/// <summary>
/// Abstraction over the <c>PrimusKiosk.Native.dll</c> C++ boundary. In production this is
/// implemented by <see cref="Native.NativeBridge"/> which P/Invokes into the unmanaged DLL;
/// tests supply an in-memory fake.
/// </summary>
public interface INativeBridge
{
    // Keyboard hook
    void InstallKeyboardHook();
    void UninstallKeyboardHook();
    void SetKeyboardHookAllowlist(bool allowSystemKeys);

    // Screenshot
    Task<string> CaptureScreenshotPngAsync(int quality, CancellationToken cancellationToken);

    // Process management
    IReadOnlyList<NativeProcessInfo> EnumerateProcesses();
    void SwitchToWindow(int pid);
    int LaunchProcess(string executable, string? arguments);

    // Window / shell
    void HideTaskbar(bool hide);

    // Hardware
    Task<string> GenerateHardwareFingerprintAsync(CancellationToken cancellationToken);
}

public sealed record NativeProcessInfo
{
    public int ProcessId { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? MainWindowTitle { get; init; }
}
