using PrimusKiosk.Core.Models;

namespace PrimusKiosk.Core.Abstractions;

public interface IPrimusRealtimeClient
{
    event EventHandler<RealtimeConnectionState>? ConnectionStateChanged;
    event EventHandler<PrimusCommand>? CommandReceived;
    event EventHandler<ChatMessageDto>? ChatMessageReceived;
    event EventHandler<int>? RemainingTimeUpdated;
    event EventHandler<WalletDto>? WalletUpdated;
    event EventHandler<AnnouncementDto>? NotificationReceived;

    RealtimeConnectionState State { get; }

    Task ConnectAsync(CancellationToken cancellationToken);
    Task DisconnectAsync(CancellationToken cancellationToken);
    Task SendAsync(object envelope, CancellationToken cancellationToken);
}

public enum RealtimeConnectionState
{
    Disconnected,
    Connecting,
    Connected,
    Reconnecting,
    Failed
}
