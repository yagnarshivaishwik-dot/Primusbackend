namespace PrimusKiosk.Core.Infrastructure;

/// <summary>
/// Strongly-typed configuration bound from layered appsettings sources.
/// Resolution order (lowest to highest precedence):
///   1. appsettings.json (shipped defaults)
///   2. appsettings.{Environment}.json
///   3. %ProgramData%\PrimusKiosk\overrides.json (DPAPI-wrapped, runtime-writable)
///   4. PRIMUS_* environment variables (debugging escape hatch)
/// </summary>
public sealed class PrimusSettings
{
    public const string SectionName = "Primus";

    /// <summary>HTTPS base URL of the FastAPI backend, e.g. https://api.primustech.in.</summary>
    public string ApiBaseUrl { get; set; } = string.Empty;

    /// <summary>WSS base URL of the FastAPI realtime gateway, e.g. wss://api.primustech.in.</summary>
    public string WsBaseUrl { get; set; } = string.Empty;

    /// <summary>
    /// Path to the one-time provisioning token file used for first-run device
    /// pairing. The file is consumed and securely erased after the first
    /// successful pairing exchange — see
    /// <see cref="Device.ProvisioningTokenStore"/>. The long-lived device
    /// credentials are then DPAPI-wrapped via
    /// <see cref="Device.DeviceCredentialStore"/> at
    /// <c>%ProgramData%\PrimusKiosk\device.bin</c>.
    ///
    /// Relative paths resolve to %ProgramData%\PrimusKiosk\&lt;path&gt; so the
    /// token never lives in the user's profile.
    /// </summary>
    public string ProvisioningTokenPath { get; set; } = "provisioning_token.txt";

    /// <summary>Long-poll command pull timeout in seconds.</summary>
    public int LongPollIntervalSeconds { get; set; } = 25;

    /// <summary>Heartbeat interval in seconds for /api/clientpc/heartbeat.</summary>
    public int HeartbeatIntervalSeconds { get; set; } = 30;

    /// <summary>Maximum allowed clock skew for HMAC-signed requests.</summary>
    public int HmacTimestampSkewSeconds { get; set; } = 60;

    /// <summary>HttpClient timeout in seconds for non-long-poll calls.</summary>
    public int HttpTimeoutSeconds { get; set; } = 10;

    /// <summary>Number of retry attempts for transient HTTP failures.</summary>
    public int HttpRetryAttempts { get; set; } = 3;

    /// <summary>When true, the client runs in full-screen kiosk mode. Defaults to true on first launch.</summary>
    public bool KioskModeEnabled { get; set; } = true;

    /// <summary>When true, the kiosk enforces shell replacement. Requires admin.</summary>
    public bool ShellReplacementEnabled { get; set; } = false;

    /// <summary>When true, global low-level keyboard hook is installed.</summary>
    public bool KeyboardHookEnabled { get; set; } = true;

    /// <summary>When true, the taskbar is hidden while the kiosk is focused.</summary>
    public bool HideTaskbar { get; set; } = true;

    /// <summary>Returns true when both ApiBaseUrl and WsBaseUrl are configured.</summary>
    public bool IsConfigured() =>
        !string.IsNullOrWhiteSpace(ApiBaseUrl) &&
        !string.IsNullOrWhiteSpace(WsBaseUrl);
}
