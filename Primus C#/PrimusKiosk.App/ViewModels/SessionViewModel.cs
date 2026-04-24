using System.Collections.ObjectModel;
using System.Windows;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using PrimusKiosk.Core.Abstractions;
using PrimusKiosk.Core.Http.ApiContracts;
using PrimusKiosk.Core.Models;
using PrimusKiosk.Core.State;
using Serilog;

namespace PrimusKiosk.App.ViewModels;

public sealed partial class SessionViewModel : ObservableObject, IDisposable
{
    private static readonly TimeSpan HeartbeatInterval = TimeSpan.FromSeconds(30);
    private static readonly TimeSpan IdleThreshold = TimeSpan.FromMinutes(5);

    private readonly IPrimusApiClient _api;
    private readonly IPrimusRealtimeClient _realtime;
    private readonly IDeviceCredentialStore _credentialStore;
    private readonly IGameLauncher _launcher;
    private readonly IHardwareMonitor _hardware;
    private readonly IIdleMonitor _idle;
    private readonly ILockOverlayController _overlay;
    private readonly INotificationService _notifications;
    private readonly AuthStore _authStore;
    private readonly SystemStore _systemStore;

    private readonly CancellationTokenSource _cts = new();
    private Task? _heartbeatLoop;
    private Task? _sessionTickLoop;
    private bool _timeExpiredNotified;

    [ObservableProperty]
    private string _sessionTime = "00:00:00";

    [ObservableProperty]
    private string _sessionStatusText = "No active session";

    [ObservableProperty]
    private string _remainingTimeText = "";

    [ObservableProperty]
    private string _walletBalance = "$0.00";

    [ObservableProperty]
    private string _walletCoins = "0";

    [ObservableProperty]
    private string _connectionText = "Offline";

    [ObservableProperty]
    private string _cpuText = "CPU: --";

    [ObservableProperty]
    private string _ramText = "RAM: --";

    [ObservableProperty]
    private GameDto? _selectedGame;

    [ObservableProperty]
    private bool _isSessionActive;

    public ObservableCollection<GameDto> Games => _systemStore.Games;

    public ChatViewModel Chat { get; }

    public string UserName => _authStore.User?.Name ?? string.Empty;

    public SessionViewModel(
        IPrimusApiClient api,
        IPrimusRealtimeClient realtime,
        IDeviceCredentialStore credentialStore,
        IGameLauncher launcher,
        IHardwareMonitor hardware,
        IIdleMonitor idle,
        ILockOverlayController overlay,
        INotificationService notifications,
        AuthStore authStore,
        SystemStore systemStore,
        ChatViewModel chat)
    {
        _api = api;
        _realtime = realtime;
        _credentialStore = credentialStore;
        _launcher = launcher;
        _hardware = hardware;
        _idle = idle;
        _overlay = overlay;
        _notifications = notifications;
        _authStore = authStore;
        _systemStore = systemStore;
        Chat = chat;

        _realtime.ConnectionStateChanged += OnConnectionStateChanged;
        _realtime.RemainingTimeUpdated += OnRemainingTimeUpdated;
        _realtime.WalletUpdated += OnWalletUpdated;

        _ = InitializeAsync();
    }

    [RelayCommand]
    private void Logout()
    {
        try
        {
            _authStore.SignOut();
            _notifications.Info("Logged out", "You have been signed out of Primus.");
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Logout failed");
        }
    }

    [RelayCommand]
    private void SelectGame(GameDto? game) => SelectedGame = game;

    [RelayCommand]
    private void DeselectGame() => SelectedGame = null;

    private async Task InitializeAsync()
    {
        try
        {
            var games = await _api.ListGamesAsync(_cts.Token).ConfigureAwait(false);
            MarshalToUi(() =>
            {
                _systemStore.Games.Clear();
                foreach (var g in games)
                {
                    _systemStore.Games.Add(g);
                }
            });

            try
            {
                var wallet = await _api.GetWalletBalanceAsync(_cts.Token).ConfigureAwait(false);
                UpdateWallet(wallet);
            }
            catch (Exception ex)
            {
                Log.Debug(ex, "Wallet fetch failed; leaving defaults.");
            }

            await LoadAnnouncementsAsync().ConfigureAwait(false);
            await LoadChatHistoryAsync().ConfigureAwait(false);

            try
            {
                var current = await _api.GetCurrentSessionAsync(_cts.Token).ConfigureAwait(false);
                if (current is not null)
                {
                    MarshalToUi(() =>
                    {
                        _systemStore.CurrentSession = current;
                        IsSessionActive = true;
                        SessionStatusText = "Session active";
                        _systemStore.RemainingTimeSeconds = current.RemainingTimeSeconds;
                    });
                }
            }
            catch (Exception ex)
            {
                Log.Debug(ex, "No active session");
            }

            _heartbeatLoop = Task.Run(() => HeartbeatLoopAsync(_cts.Token));
            _sessionTickLoop = Task.Run(() => SessionTickLoopAsync(_cts.Token));
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Session initialization failed");
        }
    }

    private async Task LoadAnnouncementsAsync()
    {
        try
        {
            var announcements = await _api.ListAnnouncementsAsync(_cts.Token).ConfigureAwait(false);
            MarshalToUi(() =>
            {
                _systemStore.Announcements.Clear();
                foreach (var a in announcements)
                {
                    _systemStore.Announcements.Add(a);
                }
            });
        }
        catch (Exception ex)
        {
            Log.Debug(ex, "Announcement fetch failed; panel will backfill from WS events.");
        }
    }

    private async Task LoadChatHistoryAsync()
    {
        try
        {
            var messages = await _api.GetChatHistoryAsync(limit: 50, _cts.Token).ConfigureAwait(false);
            MarshalToUi(() =>
            {
                _systemStore.ChatMessages.Clear();
                foreach (var m in messages)
                {
                    _systemStore.ChatMessages.Add(m);
                }
            });
        }
        catch (Exception ex)
        {
            Log.Debug(ex, "Chat history fetch failed; panel will backfill from WS events.");
        }
    }

    [RelayCommand]
    private async Task LaunchGameAsync(GameDto? game)
    {
        if (game is null) return;

        if (_systemStore.CurrentSession is null)
        {
            _notifications.Warn("Start a session first", "Launch a session before starting a game.");
            return;
        }

        try
        {
            if (string.IsNullOrWhiteSpace(game.ExecutablePath))
            {
                Log.Information("Game {Name} has no executable path; backend must provide one.", game.Name);
                _notifications.Warn("Game not installed", $"{game.Name} is not available on this PC.");
                return;
            }

            var pid = await _launcher.LaunchAsync(game, _cts.Token).ConfigureAwait(false);
            SessionStatusText = $"Playing {game.Name}";
            _notifications.Info("Game launched", $"{game.Name} started (pid {pid}).");
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Failed to launch {Game}", game.Name);
            _notifications.Error("Launch failed", ex.Message);
        }
    }

    [RelayCommand]
    private async Task StartSessionAsync()
    {
        var first = Games.FirstOrDefault(g => g.Enabled);
        var gameId = first?.Id ?? 0;

        try
        {
            var session = await _api.StartSessionAsync(gameId, _cts.Token).ConfigureAwait(false);
            MarshalToUi(() =>
            {
                _systemStore.CurrentSession = session;
                _systemStore.RemainingTimeSeconds = session.RemainingTimeSeconds;
                IsSessionActive = true;
                SessionStatusText = "Session active";
                _timeExpiredNotified = false;
            });
            _notifications.Info("Session started", "Enjoy your gaming session!");
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Start session failed");
            _notifications.Error("Couldn't start session", ex.Message);
        }
    }

    [RelayCommand]
    private async Task EndSessionAsync()
    {
        var current = _systemStore.CurrentSession;
        if (current is null) return;

        try
        {
            await _api.StopSessionAsync(current.SessionId, _cts.Token).ConfigureAwait(false);
            MarshalToUi(() =>
            {
                _systemStore.CurrentSession = null;
                _systemStore.RemainingTimeSeconds = 0;
                IsSessionActive = false;
                SessionStatusText = "No active session";
            });
            _notifications.Info("Session ended", "Come back soon!");
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "End session failed");
            _notifications.Error("Couldn't end session", ex.Message);
        }
    }

    [RelayCommand]
    private async Task TopUpAsync(string? amountText)
    {
        if (!double.TryParse(amountText, out var amount) || amount <= 0) return;

        // The backend exposes /api/wallet/topup via a separate payment flow; surface the
        // intent for now (kiosk operators usually handle top-up at the counter).
        _notifications.Info("Top-up requested", $"Ask a staff member to add ${amount:F2} to your wallet.");
        await Task.CompletedTask;
    }

    private async Task HeartbeatLoopAsync(CancellationToken cancellationToken)
    {
        var creds = await _credentialStore.LoadAsync(cancellationToken).ConfigureAwait(false);
        if (creds is null || !creds.IsValid())
        {
            return;
        }

        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                var snapshot = await _hardware.SampleAsync(cancellationToken).ConfigureAwait(false);
                var idle = _idle.GetIdleDuration();
                var isIdle = idle >= IdleThreshold;
                var session = _systemStore.CurrentSession;

                MarshalToUi(() =>
                {
                    CpuText = $"CPU {snapshot.CpuPercent:F0}%";
                    RamText = $"RAM {snapshot.RamPercent:F0}%";
                });

                var response = await _api.HeartbeatAsync(new HeartbeatRequest
                {
                    PcId = creds.PcId,
                    Hostname = Environment.MachineName,
                    CpuPercent = snapshot.CpuPercent,
                    RamPercent = snapshot.RamPercent,
                    GpuPercent = snapshot.GpuPercent,
                    CpuTemperatureCelsius = snapshot.CpuTemperatureCelsius,
                    AvailableRamBytes = snapshot.AvailableRamBytes,
                    TotalRamBytes = snapshot.TotalRamBytes,
                    SessionActive = session is not null,
                    CurrentSessionId = session is { } s ? (int?)s.SessionId : null,
                    RemainingTimeSeconds = _systemStore.RemainingTimeSeconds,
                    IdleSeconds = idle.TotalSeconds,
                    IsIdle = isIdle,
                    Status = isIdle ? "idle" : (session is not null ? "in_use" : "online"),
                }, cancellationToken).ConfigureAwait(false);

                if (response.RemainingTimeSeconds > 0)
                {
                    MarshalToUi(() =>
                    {
                        _systemStore.RemainingTimeSeconds = response.RemainingTimeSeconds;
                    });
                }
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                Log.Debug(ex, "Heartbeat failed");
            }

            try
            {
                await Task.Delay(HeartbeatInterval, cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) { return; }
        }
    }

    /// <summary>
    /// 1 Hz tick loop that updates the elapsed-time / remaining-time displays and enforces the
    /// time limit by auto-ending the session + showing a lock overlay when remaining hits 0.
    /// </summary>
    private async Task SessionTickLoopAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                var session = _systemStore.CurrentSession;

                MarshalToUi(() =>
                {
                    if (session is not null)
                    {
                        var elapsed = DateTime.UtcNow - session.StartedAtUtc;
                        if (elapsed.TotalSeconds < 0) elapsed = TimeSpan.Zero;
                        SessionTime = FormatClock(elapsed);

                        if (_systemStore.RemainingTimeSeconds > 0)
                        {
                            var remaining = TimeSpan.FromSeconds(_systemStore.RemainingTimeSeconds);
                            RemainingTimeText = $"Time remaining: {FormatClock(remaining)}";
                        }
                        else
                        {
                            RemainingTimeText = string.Empty;
                        }

                        IsSessionActive = true;
                    }
                    else
                    {
                        SessionTime = "00:00:00";
                        RemainingTimeText = string.Empty;
                        IsSessionActive = false;
                    }
                });

                // Time-limit enforcement: when a session is active and remaining time is known
                // but has reached zero, show the overlay and tell the backend the session is over.
                if (session is not null && _systemStore.RemainingTimeSeconds <= 0 && session.RemainingTimeSeconds > 0)
                {
                    await EnforceTimeExpiredAsync(session.SessionId, cancellationToken).ConfigureAwait(false);
                }
            }
            catch (Exception ex)
            {
                Log.Debug(ex, "Session tick failed");
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(1), cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) { return; }
        }
    }

    private async Task EnforceTimeExpiredAsync(long sessionId, CancellationToken cancellationToken)
    {
        if (_timeExpiredNotified) return;
        _timeExpiredNotified = true;

        Log.Information("Session #{Id} time expired — locking kiosk and ending session.", sessionId);

        MarshalToUi(() =>
        {
            _overlay.Show("Your session time has ended. Please add more time or contact staff.");
            _systemStore.IsLocked = true;
        });

        try
        {
            await _api.StopSessionAsync(sessionId, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Failed to end session after time expiry.");
        }

        MarshalToUi(() =>
        {
            _systemStore.CurrentSession = null;
            IsSessionActive = false;
            SessionStatusText = "Session ended (time expired)";
        });
    }

    private static string FormatClock(TimeSpan span)
    {
        var totalHours = (int)span.TotalHours;
        return $"{totalHours:00}:{span.Minutes:00}:{span.Seconds:00}";
    }

    private void OnConnectionStateChanged(object? sender, RealtimeConnectionState state)
    {
        MarshalToUi(() => ConnectionText = state == RealtimeConnectionState.Connected ? "Online" : "Offline");
    }

    private void OnRemainingTimeUpdated(object? sender, int remainingSeconds)
    {
        MarshalToUi(() =>
        {
            _systemStore.RemainingTimeSeconds = remainingSeconds;
            if (remainingSeconds > 0)
            {
                _timeExpiredNotified = false;
            }
        });
    }

    private void OnWalletUpdated(object? sender, WalletDto wallet) => UpdateWallet(wallet);

    private void UpdateWallet(WalletDto wallet) => MarshalToUi(() =>
    {
        _systemStore.Wallet = wallet;
        WalletBalance = $"${wallet.Balance:F2}";
        WalletCoins = wallet.Coins.ToString("0");
    });

    private static void MarshalToUi(Action action)
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

    public void Dispose()
    {
        _realtime.ConnectionStateChanged -= OnConnectionStateChanged;
        _realtime.RemainingTimeUpdated -= OnRemainingTimeUpdated;
        _realtime.WalletUpdated -= OnWalletUpdated;
        _cts.Cancel();
        _cts.Dispose();
    }
}
