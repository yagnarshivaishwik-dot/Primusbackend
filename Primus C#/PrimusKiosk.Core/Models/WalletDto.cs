namespace PrimusKiosk.Core.Models;

public sealed record WalletDto
{
    public double Balance { get; init; }
    public double Coins { get; init; }
    public string Currency { get; init; } = "USD";
}
