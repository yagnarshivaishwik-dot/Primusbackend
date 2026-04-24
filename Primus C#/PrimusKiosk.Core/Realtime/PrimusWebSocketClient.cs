using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using PrimusKiosk.Core.Abstractions;
using PrimusKiosk.Core.Infrastructure;
using PrimusKiosk.Core.Models;
using Serilog;

namespace PrimusKiosk.Core.Realtime;

/// <summary>
/// <see cref="IPrimusRealtimeClient"/> backed by <see cref="ClientWebSocket"/>.
/// Connects to <c>{WsBaseUrl}/ws/pc/{pc_id}</c> and authenticates with a device_auth
/// envelope signed with the device secret. Reconnects with exponential backoff + jitter.
/// </summary>
public sealed class PrimusWebSocketClient : IPrimusRealtimeClient, IAsyncDisposable
{
    private readonly PrimusSettings _settings;
    private readonly IDeviceCredentialStore _credentialStore;
    private readonly SemaphoreSlim _sendLock = new(1, 1);
    private readonly CancellationTokenSource _lifetimeCts = new();

    private ClientWebSocket? _socket;
    private Task? _runLoop;
    private RealtimeConnectionState _state = RealtimeConnectionState.Disconnected;

    public event EventHandler<RealtimeConnectionState>? ConnectionStateChanged;
    public event EventHandler<PrimusCommand>? CommandReceived;
    public event EventHandler<ChatMessageDto>? ChatMessageReceived;
    public event EventHandler<int>? RemainingTimeUpdated;
    public event EventHandler<WalletDto>? WalletUpdated;
    public event EventHandler<AnnouncementDto>? NotificationReceived;

    public PrimusWebSocketClient(
        IOptionsMonitor<PrimusSettings> settings,
        IDeviceCredentialStore credentialStore)
    {
        _settings = settings.CurrentValue;
        _credentialStore = credentialStore;
    }

    public RealtimeConnectionState State => _state;

    public Task ConnectAsync(CancellationToken cancellationToken)
    {
        _runLoop ??= Task.Run(() => RunLoopAsync(_lifetimeCts.Token));
        return Task.CompletedTask;
    }

    public async Task DisconnectAsync(CancellationToken cancellationToken)
    {
        _lifetimeCts.Cancel();
        if (_socket is { State: WebSocketState.Open })
        {
            try
            {
                await _socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "client shutdown", cancellationToken).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                Log.Debug(ex, "WebSocket graceful close failed.");
            }
        }

        UpdateState(RealtimeConnectionState.Disconnected);
    }

    public async Task SendAsync(object envelope, CancellationToken cancellationToken)
    {
        if (_socket is not { State: WebSocketState.Open })
        {
            throw new InvalidOperationException("WebSocket is not connected.");
        }

        var json = JsonSerializer.Serialize(envelope);
        var bytes = Encoding.UTF8.GetBytes(json);

        await _sendLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            await _socket.SendAsync(bytes, WebSocketMessageType.Text, endOfMessage: true, cancellationToken).ConfigureAwait(false);
        }
        finally
        {
            _sendLock.Release();
        }
    }

    private async Task RunLoopAsync(CancellationToken cancellationToken)
    {
        var attempt = 0;

        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                UpdateState(attempt == 0 ? RealtimeConnectionState.Connecting : RealtimeConnectionState.Reconnecting);

                var creds = await _credentialStore.LoadAsync(cancellationToken).ConfigureAwait(false);
                if (creds is null || !creds.IsValid())
                {
                    Log.Debug("Realtime loop waiting — device not provisioned yet.");
                    await Task.Delay(TimeSpan.FromSeconds(5), cancellationToken).ConfigureAwait(false);
                    continue;
                }

                if (string.IsNullOrWhiteSpace(_settings.WsBaseUrl))
                {
                    Log.Debug("Realtime loop waiting — WsBaseUrl not configured.");
                    await Task.Delay(TimeSpan.FromSeconds(5), cancellationToken).ConfigureAwait(false);
                    continue;
                }

                var url = new Uri($"{_settings.WsBaseUrl.TrimEnd('/')}/ws/pc/{creds.PcId}");
                _socket = new ClientWebSocket();
                _socket.Options.KeepAliveInterval = TimeSpan.FromSeconds(20);

                await _socket.ConnectAsync(url, cancellationToken).ConfigureAwait(false);
                await SendDeviceAuthAsync(creds, cancellationToken).ConfigureAwait(false);

                UpdateState(RealtimeConnectionState.Connected);
                attempt = 0;

                using var heartbeatCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                var heartbeat = Task.Run(() => HeartbeatLoopAsync(heartbeatCts.Token), heartbeatCts.Token);

                try
                {
                    await ReceiveLoopAsync(_socket, cancellationToken).ConfigureAwait(false);
                }
                finally
                {
                    heartbeatCts.Cancel();
                    try { await heartbeat.ConfigureAwait(false); } catch { /* ignore */ }
                }
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                Log.Warning(ex, "WebSocket run loop encountered an error.");
            }
            finally
            {
                DisposeSocket();
                UpdateState(RealtimeConnectionState.Disconnected);
            }

            if (cancellationToken.IsCancellationRequested)
            {
                break;
            }

            var delay = ComputeBackoff(++attempt);
            Log.Debug("Realtime reconnecting in {Seconds}s (attempt {Attempt}).", delay.TotalSeconds, attempt);

            try
            {
                await Task.Delay(delay, cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }

        UpdateState(RealtimeConnectionState.Disconnected);
    }

    private async Task SendDeviceAuthAsync(DeviceCredentials creds, CancellationToken cancellationToken)
    {
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
        var secretBytes = Encoding.UTF8.GetBytes(creds.DeviceSecret);

        using var hmac = new HMACSHA256(secretBytes);
        var signature = Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes(timestamp))).ToLowerInvariant();
        Array.Clear(secretBytes, 0, secretBytes.Length);

        var envelope = new
        {
            @event = "device_auth",
            payload = new
            {
                pc_id = creds.PcId,
                signature,
                timestamp,
            },
            ts = DateTime.UtcNow.ToString("O"),
        };

        await SendAsync(envelope, cancellationToken).ConfigureAwait(false);
    }

    private async Task HeartbeatLoopAsync(CancellationToken cancellationToken)
    {
        var interval = TimeSpan.FromSeconds(Math.Max(10, _settings.HeartbeatIntervalSeconds));
        while (!cancellationToken.IsCancellationRequested && _socket is { State: WebSocketState.Open })
        {
            try
            {
                await SendAsync(new { @event = "ping", ts = DateTime.UtcNow.ToString("O") }, cancellationToken).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                Log.Debug(ex, "WebSocket heartbeat failed.");
                return;
            }

            try
            {
                await Task.Delay(interval, cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                return;
            }
        }
    }

    private async Task ReceiveLoopAsync(ClientWebSocket socket, CancellationToken cancellationToken)
    {
        var buffer = new byte[16 * 1024];
        var stringBuilder = new StringBuilder();

        while (!cancellationToken.IsCancellationRequested && socket.State == WebSocketState.Open)
        {
            WebSocketReceiveResult result;
            try
            {
                result = await socket.ReceiveAsync(buffer, cancellationToken).ConfigureAwait(false);
            }
            catch (WebSocketException ex)
            {
                Log.Debug(ex, "WebSocket receive failed.");
                return;
            }

            if (result.MessageType == WebSocketMessageType.Close)
            {
                try
                {
                    await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "server close", cancellationToken).ConfigureAwait(false);
                }
                catch { /* ignore */ }
                return;
            }

            stringBuilder.Append(Encoding.UTF8.GetString(buffer, 0, result.Count));
            if (!result.EndOfMessage)
            {
                continue;
            }

            var json = stringBuilder.ToString();
            stringBuilder.Clear();

            try
            {
                HandleMessage(json);
            }
            catch (Exception ex)
            {
                Log.Warning(ex, "Failed to handle realtime message.");
            }
        }
    }

    private void HandleMessage(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        if (!root.TryGetProperty("event", out var eventEl))
        {
            return;
        }

        var eventName = eventEl.GetString();
        var payload = root.TryGetProperty("payload", out var p) ? p : default;

        switch (eventName)
        {
            case "command":
                CommandReceived?.Invoke(this, new PrimusCommand
                {
                    Id = payload.TryGetProperty("id", out var cid) && cid.ValueKind == JsonValueKind.Number ? cid.GetInt64() : 0,
                    Command = payload.TryGetProperty("command", out var cn) ? cn.GetString() ?? string.Empty : string.Empty,
                    Params = payload.TryGetProperty("params", out var pp) && pp.ValueKind != JsonValueKind.Null ? pp.GetString() : null,
                    IssuedAtUtc = payload.TryGetProperty("issued_at", out var ia) && ia.TryGetDateTime(out var iaDt) ? iaDt : DateTime.UtcNow,
                    ExpiresAtUtc = payload.TryGetProperty("expires_at", out var ea) && ea.ValueKind != JsonValueKind.Null && ea.TryGetDateTime(out var eaDt) ? eaDt : null,
                });
                break;

            case "pc.time.update":
                if (payload.TryGetProperty("remaining_time_seconds", out var rt))
                {
                    RemainingTimeUpdated?.Invoke(this, rt.GetInt32());
                }
                break;

            case "chat.message":
                ChatMessageReceived?.Invoke(this, new ChatMessageDto
                {
                    Sender = payload.TryGetProperty("sender", out var s) ? s.GetString() ?? string.Empty : string.Empty,
                    Body = payload.TryGetProperty("body", out var b) ? b.GetString() ?? string.Empty : string.Empty,
                    FromAdmin = payload.TryGetProperty("from_admin", out var fa) && fa.GetBoolean(),
                    TimestampUtc = payload.TryGetProperty("timestamp", out var ts) && ts.TryGetDateTime(out var dt) ? dt : DateTime.UtcNow,
                });
                break;

            case "shop.purchase":
                WalletUpdated?.Invoke(this, new WalletDto
                {
                    Balance = payload.TryGetProperty("balance", out var bal) ? bal.GetDouble() : 0,
                    Coins = payload.TryGetProperty("coins", out var c) ? c.GetDouble() : 0,
                    Currency = payload.TryGetProperty("currency", out var cur) ? cur.GetString() ?? "USD" : "USD",
                });
                break;

            case "notification":
                NotificationReceived?.Invoke(this, new AnnouncementDto
                {
                    Title = payload.TryGetProperty("title", out var tit) ? tit.GetString() ?? string.Empty : string.Empty,
                    Body = payload.TryGetProperty("body", out var body) ? body.GetString() ?? string.Empty : string.Empty,
                    Severity = payload.TryGetProperty("severity", out var sev) ? sev.GetString() ?? "info" : "info",
                    CreatedAtUtc = DateTime.UtcNow,
                });
                break;

            case "message":
                NotificationReceived?.Invoke(this, new AnnouncementDto
                {
                    Title = "Admin",
                    Body = payload.TryGetProperty("text", out var txt) ? txt.GetString() ?? string.Empty : string.Empty,
                    Severity = "info",
                    CreatedAtUtc = DateTime.UtcNow,
                });
                break;
        }
    }

    private TimeSpan ComputeBackoff(int attempt)
    {
        var seconds = Math.Min(60, Math.Pow(2, Math.Clamp(attempt, 0, 6)));
        var jitterSeconds = Random.Shared.NextDouble() * 0.4 * seconds;
        return TimeSpan.FromSeconds(seconds + jitterSeconds);
    }

    private void UpdateState(RealtimeConnectionState newState)
    {
        if (_state == newState)
        {
            return;
        }

        _state = newState;
        ConnectionStateChanged?.Invoke(this, newState);
    }

    private void DisposeSocket()
    {
        try
        {
            _socket?.Dispose();
        }
        catch (Exception ex)
        {
            Log.Debug(ex, "Failed to dispose WebSocket cleanly.");
        }
        _socket = null;
    }

    public async ValueTask DisposeAsync()
    {
        await DisconnectAsync(CancellationToken.None).ConfigureAwait(false);
        _lifetimeCts.Dispose();
        _sendLock.Dispose();
    }
}
