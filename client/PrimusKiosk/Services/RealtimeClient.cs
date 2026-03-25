using System;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace PrimusKiosk.Services;

public class RealtimeClient
{
    private readonly AppStateService _appState;
    private ClientWebSocket? _socket;

    public event Func<JsonElement, Task>? CommandReceived;

    public RealtimeClient(AppStateService appState)
    {
        _appState = appState;
    }

    public async Task ConnectAsync(Guid clientId)
    {
        try
        {
            _socket?.Dispose();
            _socket = new ClientWebSocket();

            var uri = new Uri($"wss://192.168.29.38:8000/ws/clients/{clientId}");
            await _socket.ConnectAsync(uri, CancellationToken.None);
            _appState.UpdateConnectionStatus(true);

            _ = Task.Run(() => ReceiveLoopAsync(_socket));
        }
        catch (Exception ex)
        {
            Serilog.Log.Warning(ex, "Failed to establish WebSocket connection");
            _appState.UpdateConnectionStatus(false);
        }
    }

    private async Task ReceiveLoopAsync(ClientWebSocket socket)
    {
        var buffer = new byte[8192];
        var builder = new StringBuilder();
        try
        {
            while (socket.State == WebSocketState.Open)
            {
                var result = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);
                if (result.MessageType == WebSocketMessageType.Close)
                {
                    await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "bye", CancellationToken.None);
                    break;
                }

                builder.Append(Encoding.UTF8.GetString(buffer, 0, result.Count));
                if (result.EndOfMessage)
                {
                    var json = builder.ToString();
                    builder.Clear();
                    try
                    {
                        using var doc = JsonDocument.Parse(json);
                        if (CommandReceived != null)
                        {
                            await CommandReceived.Invoke(doc.RootElement);
                        }
                    }
                    catch (Exception ex)
                    {
                        Serilog.Log.Warning(ex, "Failed parsing WebSocket payload");
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Serilog.Log.Warning(ex, "WebSocket receive loop failed");
        }
        finally
        {
            _appState.UpdateConnectionStatus(false);
        }
    }

    public async Task SendAsync(object payload)
    {
        if (_socket == null || _socket.State != WebSocketState.Open) return;
        var json = JsonSerializer.Serialize(payload);
        var bytes = Encoding.UTF8.GetBytes(json);
        await _socket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None);
    }
}


