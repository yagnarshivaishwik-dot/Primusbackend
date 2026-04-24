namespace PrimusKiosk.Core.Http.ApiContracts;

public sealed record DeviceRegistrationRequest
{
    public required string Name { get; init; }
    public required string LicenseKey { get; init; }
    public required string HardwareFingerprint { get; init; }
    public IReadOnlyCollection<string> Capabilities { get; init; } = Array.Empty<string>();
}
