using System.Text.Json;
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

    /// <summary>
    /// Raised when the backend broadcasts an `inventory.updated` event
    /// (admin created/updated/toggled/deleted a time-pack). Payload is the
    /// raw JSON shape the backend sent — the kiosk doesn't process it in
    /// C#; <see cref="WebHost.Bridge.JsBridge"/> forwards it verbatim to
    /// React so the Shop tab refetches.
    ///
    /// Without this event the React shop falls back to a 30 s background
    /// poll (ShopPage.jsx:106-116) — packs appear stale for up to that
    /// long after an admin edit. With this event wired, refresh is
    /// effectively instant.
    /// </summary>
    event EventHandler<JsonElement>? InventoryUpdated;

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
