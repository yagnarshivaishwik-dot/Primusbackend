using PrimusKiosk.Core.Abstractions;
using Serilog;

namespace PrimusKiosk.Core.Realtime;

/// <summary>
/// Orchestrates realtime WebSocket + long-poll fallback command flow. The WS is always
/// preferred; when it has been disconnected for &gt; 10 s the long-poll loop takes over.
/// </summary>
public sealed class CommandService : ICommandService, IAsyncDisposable
{
    private readonly IPrimusRealtimeClient _realtime;
    private readonly ICommandDispatcher _dispatcher;
    private readonly IPrimusApiClient _api;
    private readonly CommandLongPollService _longPoll;

    private CancellationTokenSource? _runCts;
    private CancellationTokenSource? _longPollCts;
    private Task? _longPollTask;
    private DateTime _lastConnectedUtc = DateTime.UtcNow;

    public CommandService(
        IPrimusRealtimeClient realtime,
        ICommandDispatcher dispatcher,
        IPrimusApiClient api,
        CommandLongPollService longPoll)
    {
        _realtime = realtime;
        _dispatcher = dispatcher;
        _api = api;
        _longPoll = longPoll;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        _runCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);

        _realtime.CommandReceived += OnRealtimeCommand;
        _realtime.ConnectionStateChanged += OnConnectionStateChanged;

        _ = _realtime.ConnectAsync(_runCts.Token);
        return Task.CompletedTask;
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        _realtime.CommandReceived -= OnRealtimeCommand;
        _realtime.ConnectionStateChanged -= OnConnectionStateChanged;

        if (_longPollCts is not null)
        {
            _longPollCts.Cancel();
            if (_longPollTask is not null)
            {
                try { await _longPollTask.ConfigureAwait(false); }
                catch (OperationCanceledException) { }
            }
            _longPollCts.Dispose();
            _longPollCts = null;
            _longPollTask = null;
        }

        _runCts?.Cancel();
        await _realtime.DisconnectAsync(cancellationToken).ConfigureAwait(false);
    }

    private async void OnRealtimeCommand(object? sender, Models.PrimusCommand command)
    {
        var token = _runCts?.Token ?? CancellationToken.None;
        try
        {
            var ack = await _dispatcher.DispatchAsync(command, token).ConfigureAwait(false);
            await _api.AckCommandAsync(ack, token).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Realtime command {Command}/#{Id} failed.", command.Command, command.Id);
            try
            {
                await _api.AckCommandAsync(new Models.CommandAck
                {
                    CommandId = command.Id,
                    State = Models.CommandAckState.Failed,
                    Result = new { reason = "dispatch_exception", message = ex.Message },
                }, token).ConfigureAwait(false);
            }
            catch (Exception ackEx)
            {
                Log.Debug(ackEx, "Failed to deliver command ACK.");
            }
        }
    }

    private void OnConnectionStateChanged(object? sender, RealtimeConnectionState state)
    {
        if (state == RealtimeConnectionState.Connected)
        {
            _lastConnectedUtc = DateTime.UtcNow;
            StopLongPoll();
            return;
        }

        if (state is RealtimeConnectionState.Disconnected or RealtimeConnectionState.Reconnecting or RealtimeConnectionState.Failed)
        {
            if ((DateTime.UtcNow - _lastConnectedUtc) > TimeSpan.FromSeconds(10))
            {
                StartLongPoll();
            }
        }
    }

    private void StartLongPoll()
    {
        if (_longPollTask is not null && !_longPollTask.IsCompleted)
        {
            return;
        }

        _longPollCts?.Dispose();
        _longPollCts = CancellationTokenSource.CreateLinkedTokenSource(_runCts?.Token ?? CancellationToken.None);
        _longPollTask = Task.Run(() => _longPoll.RunAsync(_longPollCts.Token));
        Log.Information("Command long-poll fallback started.");
    }

    private void StopLongPoll()
    {
        if (_longPollCts is null)
        {
            return;
        }

        _longPollCts.Cancel();
        _longPollCts.Dispose();
        _longPollCts = null;
        _longPollTask = null;
        Log.Information("Command long-poll fallback stopped (WebSocket reconnected).");
    }

    public async ValueTask DisposeAsync()
    {
        await StopAsync(CancellationToken.None).ConfigureAwait(false);
        _runCts?.Dispose();
    }
}
