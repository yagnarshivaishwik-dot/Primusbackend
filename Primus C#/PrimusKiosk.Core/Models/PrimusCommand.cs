using System.Text.Json;

namespace PrimusKiosk.Core.Models;

/// <summary>
/// Envelope shared across WebSocket (<c>{"event":"command","payload":{...}}</c>) and
/// HTTP long-poll (<c>/api/command/pull</c>) transports. Matches the backend's
/// <c>RemoteCommandOut</c> schema 1:1: <see cref="Id"/> integer PK, <see cref="Command"/>
/// name from the allowlist, <see cref="Params"/> a JSON-encoded string (or null).
/// </summary>
public sealed record PrimusCommand
{
    public long Id { get; init; }

    /// <summary>One of the backend <c>ALLOWED_COMMANDS</c>: lock, unlock, message, shutdown, reboot, screenshot, login, logout, restart.</summary>
    public string Command { get; init; } = string.Empty;

    /// <summary>JSON-encoded parameter string, e.g. <c>{"text":"hello"}</c>. Null for parameterless commands.</summary>
    public string? Params { get; init; }

    public DateTime IssuedAtUtc { get; init; } = DateTime.UtcNow;
    public DateTime? ExpiresAtUtc { get; init; }

    /// <summary>Deserializes <see cref="Params"/> into a <see cref="JsonElement"/>. Returns default when null/empty.</summary>
    public JsonElement TryGetParamsAsJson()
    {
        if (string.IsNullOrWhiteSpace(Params))
        {
            return default;
        }

        try
        {
            using var doc = JsonDocument.Parse(Params!);
            return doc.RootElement.Clone();
        }
        catch (JsonException)
        {
            return default;
        }
    }
}

/// <summary>
/// Acknowledgement posted to <c>POST /api/command/ack</c>. The backend validates
/// <see cref="State"/> against <c>{"RUNNING", "SUCCEEDED", "FAILED"}</c>.
/// </summary>
public sealed record CommandAck
{
    public required long CommandId { get; init; }
    public required CommandAckState State { get; init; }
    public object? Result { get; init; }
}

public enum CommandAckState
{
    Running,
    Succeeded,
    Failed,
}

public static class CommandAckStateExtensions
{
    public static string ToWireString(this CommandAckState state) => state switch
    {
        CommandAckState.Running => "RUNNING",
        CommandAckState.Succeeded => "SUCCEEDED",
        CommandAckState.Failed => "FAILED",
        _ => "FAILED",
    };
}
