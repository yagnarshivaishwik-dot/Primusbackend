using System.Text.Json;
using PrimusKiosk.Core.Abstractions;
using PrimusKiosk.Core.Infrastructure;
using PrimusKiosk.Core.Models;

namespace PrimusKiosk.Core.Device;

/// <summary>
/// Persists <see cref="DeviceCredentials"/> to <c>%ProgramData%\PrimusKiosk\device.bin</c>,
/// DPAPI-wrapped at rest. The device secret never touches plaintext on disk.
/// </summary>
public sealed class DeviceCredentialStore : IDeviceCredentialStore
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = false,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    public Task<DeviceCredentials?> LoadAsync(CancellationToken cancellationToken)
    {
        var path = PrimusPaths.DeviceCredentialsPath;
        if (!File.Exists(path))
        {
            return Task.FromResult<DeviceCredentials?>(null);
        }

        try
        {
            var ciphertext = File.ReadAllText(path);
            var plaintext = DpapiProtector.Unprotect(ciphertext);
            if (string.IsNullOrWhiteSpace(plaintext))
            {
                return Task.FromResult<DeviceCredentials?>(null);
            }

            var creds = JsonSerializer.Deserialize<DeviceCredentials>(plaintext, JsonOptions);
            return Task.FromResult(creds);
        }
        catch (JsonException)
        {
            return Task.FromResult<DeviceCredentials?>(null);
        }
    }

    public Task SaveAsync(DeviceCredentials credentials, CancellationToken cancellationToken)
    {
        PrimusPaths.EnsureDirectories();
        var json = JsonSerializer.Serialize(credentials, JsonOptions);
        var ciphertext = DpapiProtector.Protect(json);
        File.WriteAllText(PrimusPaths.DeviceCredentialsPath, ciphertext);
        return Task.CompletedTask;
    }

    public Task ClearAsync(CancellationToken cancellationToken)
    {
        var path = PrimusPaths.DeviceCredentialsPath;
        if (File.Exists(path))
        {
            File.Delete(path);
        }
        return Task.CompletedTask;
    }
}
