namespace PrimusKiosk.Core.Abstractions;

public interface IOfflineQueue
{
    Task EnqueueAsync(string eventType, string payloadJson, CancellationToken cancellationToken);
    Task<int> DrainAsync(CancellationToken cancellationToken);
    Task<int> PendingCountAsync(CancellationToken cancellationToken);
}
