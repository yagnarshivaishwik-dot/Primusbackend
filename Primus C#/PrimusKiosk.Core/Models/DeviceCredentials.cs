namespace PrimusKiosk.Core.Models;

/// <summary>
/// Persisted device identity. Stored DPAPI-wrapped on disk;
/// <see cref="DeviceSecret"/> must never touch plaintext logs.
/// </summary>
public sealed record DeviceCredentials
{
    public string PcId { get; init; } = string.Empty;
    public string LicenseKey { get; init; } = string.Empty;
    public string DeviceSecret { get; init; } = string.Empty;
    public string HardwareFingerprint { get; init; } = string.Empty;
    public DateTime RegisteredAtUtc { get; init; } = DateTime.UtcNow;

    public bool IsValid() =>
        !string.IsNullOrWhiteSpace(PcId) &&
        !string.IsNullOrWhiteSpace(DeviceSecret);
}
