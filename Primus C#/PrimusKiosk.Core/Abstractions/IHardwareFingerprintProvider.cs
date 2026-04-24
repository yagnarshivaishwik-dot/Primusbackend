namespace PrimusKiosk.Core.Abstractions;

public interface IHardwareFingerprintProvider
{
    /// <summary>Returns a stable 64-char hex fingerprint derived from SMBIOS/CPUID/WMI.</summary>
    Task<string> GetFingerprintAsync(CancellationToken cancellationToken);
}
