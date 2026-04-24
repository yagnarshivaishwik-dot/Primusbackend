using System.Management;
using System.Security.Cryptography;
using System.Text;
using PrimusKiosk.Core.Abstractions;

namespace PrimusKiosk.Core.Device;

/// <summary>
/// Computes a stable hardware fingerprint by hashing a small set of WMI-derived identifiers.
/// If the <see cref="INativeBridge"/> is available, it is preferred (SMBIOS/CPUID is faster and
/// more stable than WMI); otherwise we fall back to managed <see cref="ManagementObjectSearcher"/>.
/// </summary>
public sealed class HardwareFingerprintProvider : IHardwareFingerprintProvider
{
    private readonly INativeBridge? _native;
    private string? _cached;

    public HardwareFingerprintProvider(INativeBridge? native = null)
    {
        _native = native;
    }

    public async Task<string> GetFingerprintAsync(CancellationToken cancellationToken)
    {
        if (_cached is not null)
        {
            return _cached;
        }

        if (_native is not null)
        {
            try
            {
                _cached = await _native.GenerateHardwareFingerprintAsync(cancellationToken).ConfigureAwait(false);
                if (!string.IsNullOrWhiteSpace(_cached))
                {
                    return _cached;
                }
            }
            catch
            {
                // Fall through to WMI.
            }
        }

        _cached = await Task.Run(ComputeFromWmi, cancellationToken).ConfigureAwait(false);
        return _cached;
    }

    private static string ComputeFromWmi()
    {
        var parts = new List<string>
        {
            Environment.MachineName,
            Environment.OSVersion.ToString(),
            Environment.ProcessorCount.ToString(),
            RuntimeInformation(),
        };

        parts.AddRange(Query("SELECT UUID FROM Win32_ComputerSystemProduct", "UUID"));
        parts.AddRange(Query("SELECT SerialNumber FROM Win32_BIOS", "SerialNumber"));
        parts.AddRange(Query("SELECT SerialNumber FROM Win32_BaseBoard", "SerialNumber"));
        parts.AddRange(Query("SELECT ProcessorId FROM Win32_Processor", "ProcessorId"));

        var canonical = string.Join("|", parts.Where(p => !string.IsNullOrWhiteSpace(p)));
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(canonical));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private static IEnumerable<string> Query(string wql, string propertyName)
    {
        ManagementObjectSearcher? searcher = null;
        try
        {
            searcher = new ManagementObjectSearcher(wql);
            foreach (var raw in searcher.Get())
            {
                using var obj = (ManagementObject)raw;
                var value = obj[propertyName]?.ToString();
                if (!string.IsNullOrWhiteSpace(value))
                {
                    yield return value!;
                }
            }
        }
        finally
        {
            searcher?.Dispose();
        }
    }

    private static string RuntimeInformation() =>
        $"{System.Runtime.InteropServices.RuntimeInformation.OSArchitecture}|" +
        $"{System.Runtime.InteropServices.RuntimeInformation.ProcessArchitecture}";
}
