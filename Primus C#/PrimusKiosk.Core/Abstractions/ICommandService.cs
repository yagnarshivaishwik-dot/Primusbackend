namespace PrimusKiosk.Core.Abstractions;

/// <summary>
/// Combines realtime WebSocket command reception with HTTP long-poll fallback.
/// Owns the lifecycle of both transports; higher-level code merely calls
/// <see cref="StartAsync"/> once the device is authenticated.
/// </summary>
public interface ICommandService
{
    Task StartAsync(CancellationToken cancellationToken);
    Task StopAsync(CancellationToken cancellationToken);
}
