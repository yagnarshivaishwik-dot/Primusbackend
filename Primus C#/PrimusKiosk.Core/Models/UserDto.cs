namespace PrimusKiosk.Core.Models;

/// <summary>User profile returned from <c>GET /api/auth/me</c>.</summary>
public sealed record UserDto
{
    public long Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public string Email { get; init; } = string.Empty;
    /// <summary>One of <c>admin</c>, <c>staff</c>, <c>client</c>, <c>superadmin</c>.</summary>
    public string Role { get; init; } = "client";
    public long? CafeId { get; init; }
    public double WalletBalance { get; init; }
    public double CoinsBalance { get; init; }
}
