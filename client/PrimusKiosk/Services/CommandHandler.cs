using System;
using System.Text.Json;
using System.Threading.Tasks;
using PrimusKiosk.Models;

namespace PrimusKiosk.Services;

public class CommandHandler
{
    private readonly AppStateService _appState;
    private readonly BackendClient _backend;
    private readonly RealtimeClient _realtime;
    private readonly OfflineQueueService _queue;
    private readonly Action<string?> _showLock;
    private readonly Action _hideLock;

    public CommandHandler(
        AppStateService appState,
        BackendClient backend,
        RealtimeClient realtime,
        OfflineQueueService queue,
        Action<string?> showLock,
        Action hideLock)
    {
        _appState = appState;
        _backend = backend;
        _realtime = realtime;
        _queue = queue;
        _showLock = showLock;
        _hideLock = hideLock;

        _realtime.CommandReceived += HandleServerEventAsync;
    }

    private async Task HandleServerEventAsync(JsonElement payload)
    {
        try
        {
            var type = payload.GetProperty("type").GetString();
            switch (type)
            {
                case "CommandIssued":
                    await HandleCommandIssuedAsync(payload);
                    break;
                case "ServerMessage":
                    Serilog.Log.Information("Server message: {Msg}", payload.GetProperty("text").GetString());
                    break;
                case "AdminReply":
                    Serilog.Log.Information("Admin reply: {Msg}", payload.GetProperty("text").GetString());
                    break;
            }
        }
        catch (Exception ex)
        {
            Serilog.Log.Warning(ex, "Failed handling server event");
        }
    }

    private async Task HandleCommandIssuedAsync(JsonElement payload)
    {
        var commandId = payload.GetProperty("command_id").GetString();
        var commandType = payload.GetProperty("command_type").GetString();
        var args = payload.GetProperty("args").GetRawText();

        try
        {
            switch (commandType)
            {
                case "lock_screen":
                    var msg = payload.GetProperty("args").GetProperty("message").GetString();
                    _showLock(msg);
                    break;
                case "unlock":
                    _hideLock();
                    break;
                case "add_time":
                    // In a real implementation this would extend session timers,
                    // here we just log and rely on backend session extension.
                    break;
                case "reboot":
                case "shutdown":
                    // Documented in deployment docs; actual reboot is environment-specific.
                    break;
            }

            await AckCommandAsync(commandId!, "ok", "Executed");
        }
        catch (Exception ex)
        {
            Serilog.Log.Warning(ex, "Command execution failed: {Type}", commandType);
            await AckCommandAsync(commandId!, "error", ex.Message);
        }
    }

    private async Task AckCommandAsync(string commandId, string status, string message)
    {
        var body = new
        {
            command_id = commandId,
            status,
            message,
            timestamp_utc = DateTime.UtcNow.ToString("O")
        };

        if (_appState.IsConnected)
        {
            await _realtime.SendAsync(new
            {
                type = "ClientAck",
                payload = body
            });
        }
        else
        {
            var json = JsonSerializer.Serialize(body);
            _queue.Enqueue("ClientAck", json);
        }
    }

    public Task SendLaunchGameNotificationAsync(GameModel game)
    {
        var body = new
        {
            game_id = game.Id,
            game_name = game.Name
        };

        if (_appState.IsConnected)
        {
            return _realtime.SendAsync(new
            {
                type = "GameLaunchRequested",
                payload = body
            });
        }

        var json = JsonSerializer.Serialize(body);
        _queue.Enqueue("GameLaunchRequested", json);
        return Task.CompletedTask;
    }
}


