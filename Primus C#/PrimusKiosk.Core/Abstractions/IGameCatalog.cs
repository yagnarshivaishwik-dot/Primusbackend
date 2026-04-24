using PrimusKiosk.Core.Models;

namespace PrimusKiosk.Core.Abstractions;

public interface IGameCatalog
{
    Task<IReadOnlyList<GameDto>> GetGamesAsync(CancellationToken cancellationToken);
}

public interface IGameLauncher
{
    Task<int> LaunchAsync(GameDto game, CancellationToken cancellationToken);
    Task<bool> IsRunningAsync(int pid, CancellationToken cancellationToken);
    Task TerminateAsync(int pid, CancellationToken cancellationToken);
}
