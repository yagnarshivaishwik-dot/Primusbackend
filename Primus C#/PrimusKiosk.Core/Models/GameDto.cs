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

    /// <summary>
    /// Optional inline logo as a `data:image/png;base64,…` URI extracted
    /// from the .exe by <c>IconExtractor</c>. Stored on
    /// <c>Game.logo_url</c> in the backend so the kiosk UI can render
    /// real app icons in the catalog tiles instead of the placeholder.
    /// </summary>
    public string? LogoDataUri { get; init; }
}
