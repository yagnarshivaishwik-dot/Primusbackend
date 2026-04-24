using System.Windows;
using PrimusKiosk.Core.Abstractions;
using PrimusKiosk.Core.Models;
using PrimusKiosk.Core.State;
using Serilog;

namespace PrimusKiosk.App.Services;

/// <summary>
/// Subscribes to <see cref="IPrimusRealtimeClient"/> events and routes them into the
/// observable <see cref="SystemStore"/> and <see cref="INotificationService"/> on the UI
/// thread. Command events are intentionally NOT routed here — <see cref="Core.Realtime.CommandService"/>
/// owns those so it can ACK via HTTP.
/// </summary>
public sealed class RealtimeEventRouter : IDisposable
{
    private readonly IPrimusRealtimeClient _realtime;
    private readonly SystemStore _systemStore;
    private readonly INotificationService _notifications;

    public RealtimeEventRouter(
        IPrimusRealtimeClient realtime,
        SystemStore systemStore,
        INotificationService notifications)
    {
        _realtime = realtime;
        _systemStore = systemStore;
        _notifications = notifications;

        _realtime.ChatMessageReceived += OnChatMessage;
        _realtime.NotificationReceived += OnNotification;
        _realtime.WalletUpdated += OnWalletUpdated;
        _realtime.RemainingTimeUpdated += OnRemainingTimeUpdated;
        _realtime.ConnectionStateChanged += OnConnectionStateChanged;
    }

    private void OnChatMessage(object? sender, ChatMessageDto msg) => Marshal(() =>
    {
        _systemStore.ChatMessages.Add(msg);
        while (_systemStore.ChatMessages.Count > 500)
        {
            _systemStore.ChatMessages.RemoveAt(0);
        }

        if (msg.FromAdmin)
        {
            _notifications.Info($"Message from {msg.Sender}", msg.Body);
        }
    });

    private void OnNotification(object? sender, AnnouncementDto announcement) => Marshal(() =>
    {
        _systemStore.Announcements.Add(announcement);
        while (_systemStore.Announcements.Count > 100)
        {
            _systemStore.Announcements.RemoveAt(0);
        }

        _notifications.Show(announcement);
    });

    private void OnWalletUpdated(object? sender, WalletDto wallet) => Marshal(() =>
    {
        _systemStore.Wallet = wallet;
    });

    private void OnRemainingTimeUpdated(object? sender, int remainingSeconds) => Marshal(() =>
    {
        _systemStore.RemainingTimeSeconds = Math.Max(0, remainingSeconds);
    });

    private void OnConnectionStateChanged(object? sender, RealtimeConnectionState state) => Marshal(() =>
    {
        _systemStore.ConnectionState = state;
    });

    private static void Marshal(Action action)
    {
        try
        {
            var dispatcher = Application.Current?.Dispatcher;
            if (dispatcher is null || dispatcher.CheckAccess())
            {
                action();
            }
            else
            {
                dispatcher.Invoke(action);
            }
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "RealtimeEventRouter marshal failed.");
        }
    }

    public void Dispose()
    {
        _realtime.ChatMessageReceived -= OnChatMessage;
        _realtime.NotificationReceived -= OnNotification;
        _realtime.WalletUpdated -= OnWalletUpdated;
        _realtime.RemainingTimeUpdated -= OnRemainingTimeUpdated;
        _realtime.ConnectionStateChanged -= OnConnectionStateChanged;
    }
}
