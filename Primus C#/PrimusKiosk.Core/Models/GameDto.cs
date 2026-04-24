namespace PrimusKiosk.Core.Models;

public sealed record GameDto
{
    public long Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? Description { get; init; }
    public string? Category { get; init; }
    public string? ExecutablePath { get; init; }
    public string? IconUrl { get; init; }
    public bool Enabled { get; init; } = true;
}
