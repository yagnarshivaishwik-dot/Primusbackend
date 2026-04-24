namespace PrimusKiosk.Core.Abstractions;

public interface ISystemControl
{
    Task ShutdownAsync(TimeSpan delay, string? reason = null, CancellationToken cancellationToken = default);
    Task RestartAsync(TimeSpan delay, string? reason = null, CancellationToken cancellationToken = default);
    Task LogoffAsync(CancellationToken cancellationToken = default);
    Task LockWorkstationAsync(CancellationToken cancellationToken = default);
    Task CancelShutdownAsync(CancellationToken cancellationToken = default);
}
