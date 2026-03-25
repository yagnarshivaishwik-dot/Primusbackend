using System;
using System.Threading.Tasks;

namespace PrimusKiosk.Services;

public class AppStateService
{
    public BackendClient? Backend { get; private set; }
    public RealtimeClient? Realtime { get; private set; }
    public OfflineQueueService? OfflineQueue { get; private set; }
    public CommandHandler? CommandHandler { get; private set; }

    public Guid? ClientId { get; private set; }
    public string? AccessToken { get; private set; }

    public DateTime? CurrentSessionStartUtc { get; private set; }
    public double WalletBalance { get; private set; }
    public double WalletCoins { get; private set; }

    public bool IsConnected { get; private set; }

    public void Initialize(
        BackendClient backend,
        RealtimeClient realtime,
        OfflineQueueService queue,
        CommandHandler commandHandler)
    {
        Backend = backend;
        Realtime = realtime;
        OfflineQueue = queue;
        CommandHandler = commandHandler;
    }

    public async Task InitializeAsync()
    {
        if (Backend == null) return;

        await Backend.LoadConfigurationAsync();
        await Backend.EnsureProvisionedAsync();

        ClientId = Backend.ClientId;

        if (Realtime != null && ClientId.HasValue)
        {
            await Realtime.ConnectAsync(ClientId.Value);
        }
    }

    public void UpdateSessionStart(DateTime? startUtc)
    {
        CurrentSessionStartUtc = startUtc;
    }

    public void UpdateWallet(double balance, double coins)
    {
        WalletBalance = balance;
        WalletCoins = coins;
    }

    public void UpdateConnectionStatus(bool isConnected)
    {
        IsConnected = isConnected;
    }
}


