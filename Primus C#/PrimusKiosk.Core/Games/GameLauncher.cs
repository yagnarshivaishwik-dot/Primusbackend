using PrimusKiosk.Core.Abstractions;
using PrimusKiosk.Core.Models;
using Serilog;

namespace PrimusKiosk.Core.Games;

public sealed class GameLauncher : IGameLauncher
{
    private readonly INativeBridge _native;

    public GameLauncher(INativeBridge native) => _native = native;

    public Task<int> LaunchAsync(GameDto game, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(game.ExecutablePath))
        {
            throw new InvalidOperationException($"Game '{game.Name}' has no ExecutablePath; launch requires it.");
        }

        var pid = _native.LaunchProcess(game.ExecutablePath, arguments: null);
        Log.Information("Launched {Game} pid={Pid} via {Exe}", game.Name, pid, game.ExecutablePath);
        return Task.FromResult(pid);
    }

    public Task<bool> IsRunningAsync(int pid, CancellationToken cancellationToken)
    {
        try
        {
            var proc = System.Diagnostics.Process.GetProcessById(pid);
            return Task.FromResult(!proc.HasExited);
        }
        catch (ArgumentException)
        {
            return Task.FromResult(false);
        }
    }

    public Task TerminateAsync(int pid, CancellationToken cancellationToken)
    {
        try
        {
            var proc = System.Diagnostics.Process.GetProcessById(pid);
            if (!proc.HasExited)
            {
                proc.Kill(entireProcessTree: true);
            }
        }
        catch (ArgumentException)
        {
            // Already exited; ignore.
        }
        return Task.CompletedTask;
    }
}
