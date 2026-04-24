namespace PrimusKiosk.Core.Models;

public sealed record AnnouncementDto
{
    public long Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public string Body { get; init; } = string.Empty;
    public DateTime CreatedAtUtc { get; init; }
    public string Severity { get; init; } = "info";
}
