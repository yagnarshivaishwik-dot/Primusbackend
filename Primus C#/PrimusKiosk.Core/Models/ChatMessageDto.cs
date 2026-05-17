namespace PrimusKiosk.Core.Models;

/// <summary>
/// Wire shape for a chat message arriving from the backend over the device
/// WebSocket. Field names mirror the backend payload
/// (<c>backend/app/api/endpoints/chat.py::send_message</c>):
///   message_id, client_id, client_name, user_name, text, from, to, ts.
/// Earlier this DTO carried Sender/Body/FromAdmin which never matched the
/// backend → React saw empty bubbles for every admin reply.
/// </summary>
public sealed record ChatMessageDto
{
    public string Id { get; init; } = Guid.NewGuid().ToString("N");
    public string MessageId { get; init; } = string.Empty;
    public int? ClientId { get; init; }
    public string ClientName { get; init; } = string.Empty;
    public string UserName { get; init; } = string.Empty;
    public string Text { get; init; } = string.Empty;
    public string From { get; init; } = string.Empty;
    public string To { get; init; } = string.Empty;
    public long? Ts { get; init; }
    public int? FromUserId { get; init; }
    public DateTime TimestampUtc { get; init; } = DateTime.UtcNow;

    // Kept for back-compat with ChatViewModel / SystemStore which still bind
    // to these names. Populated from the new fields when constructed.
    public string Sender => UserName;
    public string Body => Text;
    public bool FromAdmin => string.Equals(From, "admin", System.StringComparison.OrdinalIgnoreCase);
}
