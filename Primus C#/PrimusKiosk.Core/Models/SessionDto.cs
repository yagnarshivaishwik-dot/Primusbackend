namespace PrimusKiosk.Core.Models;

public sealed record SessionDto
{
    public long SessionId { get; init; }
    public long? UserId { get; init; }
    public string? UserName { get; init; }
    public string? GameName { get; init; }
    public DateTime StartedAtUtc { get; init; }
    public DateTime? EndedAtUtc { get; init; }
    public int RemainingTimeSeconds { get; init; }
    public double CostSoFar { get; init; }
}
