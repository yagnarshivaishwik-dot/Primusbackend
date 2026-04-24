using System.Drawing;
using System.Drawing.Imaging;
using PrimusKiosk.Core.Abstractions;
using Serilog;

namespace PrimusKiosk.Core.Screenshot;

/// <summary>
/// Managed GDI+ screenshot fallback for when the native DLL isn't present. Captures the
/// primary display into a PNG temp file and uploads to <c>POST /api/screenshot/upload</c>.
/// Runs on Windows only (System.Drawing.Common is gated by CA1416, already suppressed).
/// </summary>
public sealed class GdiScreenshotService : IScreenshotService
{
    private readonly IPrimusApiClient _api;

    public GdiScreenshotService(IPrimusApiClient api)
    {
        _api = api;
    }

    public async Task<string> CaptureAndUploadAsync(CancellationToken cancellationToken)
    {
        var pngPath = Path.Combine(Path.GetTempPath(), $"primus-screenshot-{Guid.NewGuid():N}.png");
        try
        {
            await Task.Run(() => CaptureToFile(pngPath), cancellationToken).ConfigureAwait(false);

            await using var stream = File.OpenRead(pngPath);
            return await _api.UploadScreenshotAsync(stream, Path.GetFileName(pngPath), cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "GdiScreenshotService failed to capture or upload.");
            throw;
        }
        finally
        {
            TryDelete(pngPath);
        }
    }

    private static void CaptureToFile(string path)
    {
        var bounds = GetVirtualScreenBounds();
        using var bitmap = new Bitmap(bounds.Width, bounds.Height, PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(bitmap);
        g.CopyFromScreen(bounds.Left, bounds.Top, 0, 0, bounds.Size, CopyPixelOperation.SourceCopy);
        bitmap.Save(path, ImageFormat.Png);
    }

    private static Rectangle GetVirtualScreenBounds()
    {
        // System.Windows.Forms would make this trivial but we avoid the dependency.
        // SystemParameters (WPF) can't be used from Core. Fall back to GetSystemMetrics.
        var left = NativeMethods.GetSystemMetrics(NativeMethods.SM_XVIRTUALSCREEN);
        var top = NativeMethods.GetSystemMetrics(NativeMethods.SM_YVIRTUALSCREEN);
        var width = NativeMethods.GetSystemMetrics(NativeMethods.SM_CXVIRTUALSCREEN);
        var height = NativeMethods.GetSystemMetrics(NativeMethods.SM_CYVIRTUALSCREEN);
        if (width <= 0 || height <= 0)
        {
            width = NativeMethods.GetSystemMetrics(NativeMethods.SM_CXSCREEN);
            height = NativeMethods.GetSystemMetrics(NativeMethods.SM_CYSCREEN);
        }
        return new Rectangle(left, top, width, height);
    }

    private static void TryDelete(string path)
    {
        try
        {
            if (File.Exists(path)) File.Delete(path);
        }
        catch (Exception ex)
        {
            Log.Debug(ex, "Failed to delete screenshot temp file {Path}", path);
        }
    }

    private static class NativeMethods
    {
        public const int SM_CXSCREEN = 0;
        public const int SM_CYSCREEN = 1;
        public const int SM_XVIRTUALSCREEN = 76;
        public const int SM_YVIRTUALSCREEN = 77;
        public const int SM_CXVIRTUALSCREEN = 78;
        public const int SM_CYVIRTUALSCREEN = 79;

        [System.Runtime.InteropServices.DllImport("user32.dll")]
        public static extern int GetSystemMetrics(int nIndex);
    }
}
