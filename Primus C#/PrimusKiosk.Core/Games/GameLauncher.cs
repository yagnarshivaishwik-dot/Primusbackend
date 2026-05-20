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

        // URI-style launch targets (e.g. steam://rungameid/730,
        // com.epicgames.launcher://apps/...) can't be handed to the
        // native CreateProcess wrapper — that expects a file path.
        // Route them straight to Process.Start with UseShellExecute=true
        // so Windows dispatches via URI handler.
        if (IsUriLaunch(game.ExecutablePath))
        {
            var psi = new System.Diagnostics.ProcessStartInfo
            {
                FileName = game.ExecutablePath,
                UseShellExecute = true,
            };
            using var proc = System.Diagnostics.Process.Start(psi);
            var uriPid = proc?.Id ?? -1;
            Log.Information("Launched {Game} pid={Pid} via URI {Uri}", game.Name, uriPid, game.ExecutablePath);
            return Task.FromResult(uriPid);
        }

        var pid = _native.LaunchProcess(game.ExecutablePath, arguments: null);
        Log.Information("Launched {Game} pid={Pid} via {Exe}", game.Name, pid, game.ExecutablePath);
        return Task.FromResult(pid);
    }

    private static bool IsUriLaunch(string target)
    {
        // Heuristic: any string with a scheme (e.g. steam://, com.epicgames.launcher://)
        // before a colon-slash-slash. Won't false-positive on Windows
        // paths because those use `C:\…`, never `://`.
        return target.Contains("://", StringComparison.Ordinal);
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
