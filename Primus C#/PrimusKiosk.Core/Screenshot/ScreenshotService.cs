using PrimusKiosk.Core.Abstractions;
using Serilog;

namespace PrimusKiosk.Core.Screenshot;

/// <summary>
/// Captures the desktop via <see cref="INativeBridge"/> and uploads to
/// <c>POST /api/screenshot/upload</c>. Falls back to a no-op if the native
/// DLL isn't available; managed GDI fallback lands in P7.
/// </summary>
public sealed class ScreenshotService : IScreenshotService
{
    private readonly INativeBridge _native;
    private readonly IPrimusApiClient _api;

    public ScreenshotService(INativeBridge native, IPrimusApiClient api)
    {
        _native = native;
        _api = api;
    }

    public async Task<string> CaptureAndUploadAsync(CancellationToken cancellationToken)
    {
        string path;
        try
        {
            path = await _native.CaptureScreenshotPngAsync(quality: 85, cancellationToken).ConfigureAwait(false);
        }
        catch (NotSupportedException)
        {
            Log.Warning("Screenshot capture skipped — native DLL not loaded (managed fallback not yet implemented).");
            return string.Empty;
        }

        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
        {
            Log.Warning("Screenshot capture returned an empty or missing path: '{Path}'", path);
            return string.Empty;
        }

        try
        {
            await using var stream = File.OpenRead(path);
            return await _api.UploadScreenshotAsync(stream, Path.GetFileName(path), cancellationToken).ConfigureAwait(false);
        }
        finally
        {
            TryDelete(path);
        }
    }

    private static void TryDelete(string path)
    {
        try { File.Delete(path); }
        catch (Exception ex) { Log.Debug(ex, "Failed to delete screenshot temp file {Path}", path); }
    }
}
