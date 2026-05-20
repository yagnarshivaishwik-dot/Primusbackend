using System.Drawing;
using System.Drawing.Imaging;
using Serilog;

namespace PrimusKiosk.Core.Games;

/// <summary>
/// Pulls an icon out of a Windows .exe and converts it to a
/// `data:image/png;base64,…` URI suitable for inlining into the kiosk
/// catalog UI. Best-effort: returns null on any failure so callers
/// can just drop the field rather than abort the whole scan.
/// </summary>
internal static class IconExtractor
{
    public static string? TryExtractDataUri(string? exePath)
    {
        if (string.IsNullOrWhiteSpace(exePath)) return null;
        if (!File.Exists(exePath)) return null;

        try
        {
            using var icon = Icon.ExtractAssociatedIcon(exePath);
            if (icon is null) return null;

            using var bmp = icon.ToBitmap();
            using var ms = new MemoryStream();
            bmp.Save(ms, ImageFormat.Png);
            return "data:image/png;base64," + Convert.ToBase64String(ms.ToArray());
        }
        catch (Exception ex)
        {
            Log.Debug(ex, "Icon extraction failed for {Exe}", exePath);
            return null;
        }
    }
}
