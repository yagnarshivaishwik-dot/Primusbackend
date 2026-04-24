namespace PrimusKiosk.Core.Models;

public sealed record ChatMessageDto
{
    public string Id { get; init; } = Guid.NewGuid().ToString("N");
    public string Sender { get; init; } = string.Empty;
    public string Body { get; init; } = string.Empty;
    public DateTime TimestampUtc { get; init; } = DateTime.UtcNow;
    public bool FromAdmin { get; init; }
}
