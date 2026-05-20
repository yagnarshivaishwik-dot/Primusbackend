using System.Management;
using System.Text.Json.Nodes;
using NAudio.CoreAudioApi;
using Serilog;

namespace PrimusKiosk.App.WebHost.Bridge;

/// <summary>
/// System-level volume + display brightness control for the kiosk
/// settings dropdown. Exposes a simple percent-based API the React
/// SettingsPanel already speaks to.
///
/// Volume: NAudio's <see cref="MMDeviceEnumerator"/> → default render
/// device → <see cref="AudioEndpointVolume"/>. Master Volume scalar is
/// 0.0–1.0; the React side talks in 0–100.
///
/// Brightness: WMI <c>WmiMonitorBrightness</c> / <c>WmiMonitorBrightnessMethods</c>.
/// Works on most laptops; fails gracefully on desktops that don't
/// expose it (the result is just <c>null</c> and the kiosk falls back
/// to its local-storage value). DDC-CI for external monitors is not
/// implemented yet — see TECH_DEBT #25 for the follow-up.
///
/// Every method swallows its own exceptions and logs at warning so a
/// failure can't take down the bridge — worst case the slider does
/// nothing instead of crashing the kiosk.
/// </summary>
internal static class SystemSettingsBridge
{
    // --------------------------------------------------------------- VOLUME

    /// <summary>
    /// Returns the current master volume + mute state of the default
    /// audio render device, or null if the device can't be queried.
    /// </summary>
    public static object? GetSystemVolume()
    {
        try
        {
            using var enumerator = new MMDeviceEnumerator();
            using var device = enumerator.GetDefaultAudioEndpoint(
                DataFlow.Render, Role.Multimedia);

            var scalar = device.AudioEndpointVolume.MasterVolumeLevelScalar;
            var muted = device.AudioEndpointVolume.Mute;
            var percent = (int)System.Math.Round(scalar * 100f);

            return new { percent, muted };
        }
        catch (System.Exception ex)
        {
            Log.Warning(ex, "GetSystemVolume failed.");
            return null;
        }
    }

    /// <summary>
    /// Sets the master volume + mute on the default audio render device.
    /// Accepts <c>percent</c> (0–100) and optional <c>muted</c> bool.
    /// </summary>
    public static object SetSystemVolume(JsonObject args)
    {
        try
        {
            var percent = args["percent"]?.GetValue<int>() ?? -1;
            var muted = args["muted"]?.GetValue<bool>();

            if (percent < 0 || percent > 100)
                return new { ok = false, error = "percent must be 0..100" };

            using var enumerator = new MMDeviceEnumerator();
            using var device = enumerator.GetDefaultAudioEndpoint(
                DataFlow.Render, Role.Multimedia);

            device.AudioEndpointVolume.MasterVolumeLevelScalar = percent / 100f;
            if (muted.HasValue)
                device.AudioEndpointVolume.Mute = muted.Value;

            return new { ok = true, percent, muted = muted ?? device.AudioEndpointVolume.Mute };
        }
        catch (System.Exception ex)
        {
            Log.Warning(ex, "SetSystemVolume failed.");
            return new { ok = false, error = ex.Message };
        }
    }

    // ----------------------------------------------------------- BRIGHTNESS

    /// <summary>
    /// Returns the current display brightness as a percent (0–100), or
    /// null if WMI doesn't expose monitor brightness on this hardware
    /// (most desktops, all VMs).
    /// </summary>
    public static object? GetDisplayBrightness()
    {
        try
        {
            using var searcher = new ManagementObjectSearcher(
                "root\\WMI", "SELECT * FROM WmiMonitorBrightness");
            using var collection = searcher.Get();
            foreach (ManagementObject obj in collection)
            {
                using (obj)
                {
                    var current = (byte)obj["CurrentBrightness"];
                    return new { percent = (int)current };
                }
            }
            return null;
        }
        catch (System.Exception ex)
        {
            Log.Warning(ex, "GetDisplayBrightness failed (likely no WMI support on this hardware).");
            return null;
        }
    }

    /// <summary>
    /// Sets the display brightness via WMI's WmiSetBrightness. Accepts
    /// <c>percent</c> (0–100). On hardware without WMI brightness
    /// support, returns <c>{ ok: false }</c> — the kiosk's React side
    /// already tolerates that gracefully.
    /// </summary>
    public static object SetDisplayBrightness(JsonObject args)
    {
        try
        {
            var percent = args["percent"]?.GetValue<int>() ?? -1;
            if (percent < 0 || percent > 100)
                return new { ok = false, error = "percent must be 0..100" };

            using var searcher = new ManagementObjectSearcher(
                "root\\WMI", "SELECT * FROM WmiMonitorBrightnessMethods");
            using var collection = searcher.Get();
            foreach (ManagementObject obj in collection)
            {
                using (obj)
                {
                    // Signature: WmiSetBrightness(timeout_seconds, brightness_pct)
                    obj.InvokeMethod("WmiSetBrightness", new object[]
                    {
                        (uint)0,            // immediate
                        (byte)percent,      // 0..100
                    });
                }
            }
            return new { ok = true, percent };
        }
        catch (System.Exception ex)
        {
            Log.Warning(ex, "SetDisplayBrightness failed (likely no WMI support on this hardware).");
            return new { ok = false, error = ex.Message };
        }
    }
}
