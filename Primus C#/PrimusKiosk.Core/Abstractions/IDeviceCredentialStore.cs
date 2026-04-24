using PrimusKiosk.Core.Models;

namespace PrimusKiosk.Core.Abstractions;

public interface IDeviceCredentialStore
{
    Task<DeviceCredentials?> LoadAsync(CancellationToken cancellationToken);
    Task SaveAsync(DeviceCredentials credentials, CancellationToken cancellationToken);
    Task ClearAsync(CancellationToken cancellationToken);
}
