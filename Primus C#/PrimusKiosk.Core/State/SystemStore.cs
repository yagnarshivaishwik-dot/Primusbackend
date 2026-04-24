using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using PrimusKiosk.Core.Abstractions;
using PrimusKiosk.Core.Models;

namespace PrimusKiosk.Core.State;

/// <summary>
/// Observable kiosk state: session, wallet, chat, announcements, realtime status, lock.
/// Mirrors the React <c>systemStore.ts</c> shape.
/// </summary>
public sealed partial class SystemStore : ObservableObject
{
    [ObservableProperty]
    private RealtimeConnectionState _connectionState = RealtimeConnectionState.Disconnected;

    [ObservableProperty]
    private SessionDto? _currentSession;

    [ObservableProperty]
    private WalletDto _wallet = new();

    [ObservableProperty]
    private int _remainingTimeSeconds;

    [ObservableProperty]
    private bool _isLocked;

    [ObservableProperty]
    private string? _lockMessage;

    public ObservableCollection<ChatMessageDto> ChatMessages { get; } = new();

    public ObservableCollection<AnnouncementDto> Announcements { get; } = new();

    public ObservableCollection<GameDto> Games { get; } = new();

    public bool IsConnected => ConnectionState == RealtimeConnectionState.Connected;

    partial void OnConnectionStateChanged(RealtimeConnectionState value)
    {
        OnPropertyChanged(nameof(IsConnected));
    }
}
