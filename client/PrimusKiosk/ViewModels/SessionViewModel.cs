using System;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Media;
using System.Windows.Input;
using PrimusKiosk.Models;
using PrimusKiosk.Services;

namespace PrimusKiosk.ViewModels;

public class SessionViewModel : INotifyPropertyChanged
{
    private readonly AppStateService _appState;
    private readonly BackendClient _backend;
    private readonly RealtimeClient _realtime;
    private readonly OfflineQueueService _queue;
    private readonly CommandHandler _commandHandler;

    private string _sessionTime = "00:00:00";
    private string _sessionStatusText = "No active session";
    private CancellationTokenSource? _timerCts;

    public event PropertyChangedEventHandler? PropertyChanged;

    public SessionViewModel(
        AppStateService appState,
        BackendClient backend,
        RealtimeClient realtime,
        OfflineQueueService queue,
        CommandHandler commandHandler)
    {
        _appState = appState;
        _backend = backend;
        _realtime = realtime;
        _queue = queue;
        _commandHandler = commandHandler;

        Games = new ObservableCollection<GameModel>();

        StartSessionCommand = new AsyncRelayCommand(StartSessionAsync);
        EndSessionCommand = new AsyncRelayCommand(EndSessionAsync);
        LaunchGameCommand = new AsyncRelayCommand<GameModel?>(LaunchGameAsync);
    }

    public ObservableCollection<GameModel> Games { get; }

    public string SessionTime
    {
        get => _sessionTime;
        set
        {
            if (value == _sessionTime) return;
            _sessionTime = value;
            OnPropertyChanged();
        }
    }

    public string SessionStatusText
    {
        get => _sessionStatusText;
        set
        {
            if (value == _sessionStatusText) return;
            _sessionStatusText = value;
            OnPropertyChanged();
        }
    }

    public string WalletBalanceFormatted => $"${_appState.WalletBalance:F2}";
    public string WalletCoinsFormatted => _appState.WalletCoins.ToString("0");

    public string GamesSubtitle => $"{Games.Count} games available";

    public string ConnectionStatusText => _appState.IsConnected ? "Online" : "Offline mode";

    public SolidColorBrush ConnectionStatusBrush =>
        _appState.IsConnected ? new SolidColorBrush(Colors.LightGreen) : new SolidColorBrush(Colors.OrangeRed);

    public ICommand StartSessionCommand { get; }
    public ICommand EndSessionCommand { get; }
    public ICommand LaunchGameCommand { get; }

    public async Task InitializeAsync()
    {
        await _backend.LoadInitialSessionDataAsync(Games);
        StartTimerIfNeeded();
        OnPropertyChanged(nameof(WalletBalanceFormatted));
        OnPropertyChanged(nameof(WalletCoinsFormatted));
        OnPropertyChanged(nameof(GamesSubtitle));
        OnPropertyChanged(nameof(ConnectionStatusText));
        OnPropertyChanged(nameof(ConnectionStatusBrush));
    }

    private async Task StartSessionAsync()
    {
        await _backend.StartSessionAsync();
        StartTimerIfNeeded();
        SessionStatusText = "Session active";
    }

    private async Task EndSessionAsync()
    {
        await _backend.EndSessionAsync();
        _timerCts?.Cancel();
        SessionTime = "00:00:00";
        SessionStatusText = "No active session";
    }

    private async Task LaunchGameAsync(GameModel? game)
    {
        if (game == null) return;
        await _commandHandler.SendLaunchGameNotificationAsync(game);
    }

    private void StartTimerIfNeeded()
    {
        _timerCts?.Cancel();
        if (!_appState.CurrentSessionStartUtc.HasValue)
        {
            SessionStatusText = "No active session";
            return;
        }

        _timerCts = new CancellationTokenSource();
        var token = _timerCts.Token;
        _ = Task.Run(async () =>
        {
            while (!token.IsCancellationRequested)
            {
                var start = _appState.CurrentSessionStartUtc ?? DateTime.UtcNow;
                var elapsed = DateTime.UtcNow - start;
                SessionTime = $"{(int)elapsed.TotalHours:00}:{elapsed.Minutes:00}:{elapsed.Seconds:00}";
                await Task.Delay(1000, token);
            }
        }, token);
    }

    protected void OnPropertyChanged([CallerMemberName] string? propertyName = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
    }
}


