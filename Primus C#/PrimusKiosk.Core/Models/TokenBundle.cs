namespace PrimusKiosk.Core.Models;

/// <summary>
/// Combined access + refresh token with metadata. Stored DPAPI-wrapped on disk.
/// </summary>
public sealed record TokenBundle
{
    public string AccessToken { get; init; } = string.Empty;
    public string? RefreshToken { get; init; }
    public DateTime AccessTokenExpiresAtUtc { get; init; }
    public string TokenType { get; init; } = "Bearer";

    public bool IsExpired(TimeSpan slack) =>
        DateTime.UtcNow >= AccessTokenExpiresAtUtc - slack;
}
