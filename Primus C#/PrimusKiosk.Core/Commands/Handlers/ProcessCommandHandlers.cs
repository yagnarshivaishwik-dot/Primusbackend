using System.Diagnostics;
using System.Text.Json;
using PrimusKiosk.Core.Abstractions;
using PrimusKiosk.Core.Models;
using Serilog;

namespace PrimusKiosk.Core.Commands.Handlers;

/// <summary>
/// Launches an arbitrary executable on the kiosk. Params shape:
/// <c>{exe_path: string, arguments?: string, working_directory?: string}</c>.
/// Used by admins to start a specific app on a remote PC.
/// </summary>
public sealed class LaunchAppCommandHandler : ICommandHandler
{
    private readonly IGameLauncher _launcher;

    public LaunchAppCommandHandler(IGameLauncher launcher) => _launcher = launcher;

    public string CommandType => "launch_app";

    public async Task<CommandAck> HandleAsync(PrimusCommand command, CancellationToken cancellationToken)
    {
        var p = command.TryGetParamsAsJson();
        if (p.ValueKind != JsonValueKind.Object)
        {
            return Failed(command, "launch_app requires params {exe_path: string}");
        }

        var exePath = p.TryGetProperty("exe_path", out var e) ? e.GetString() : null;
        if (string.IsNullOrWhiteSpace(exePath))
        {
            return Failed(command, "exe_path is required");
        }

        if (!File.Exists(exePath))
        {
            return Failed(command, $"exe_path not found on disk: {exePath}");
        }

        var args = p.TryGetProperty("arguments", out var a) ? a.GetString() : null;

        var pid = await _launcher.LaunchAsync(new GameDto
        {
            Name = Path.GetFileNameWithoutExtension(exePath),
            ExecutablePath = exePath,
        }, cancellationToken).ConfigureAwait(false);

        return new CommandAck
        {
            CommandId = command.Id,
            State = CommandAckState.Succeeded,
            Result = new { pid, exe_path = exePath, arguments = args },
        };
    }

    private static CommandAck Failed(PrimusCommand cmd, string reason) => new()
    {
        CommandId = cmd.Id,
        State = CommandAckState.Failed,
        Result = new { reason },
    };
}

/// <summary>
/// Terminates a running process by PID or by name. Params shape:
/// <c>{pid?: int, name?: string, force?: bool}</c>. At least one of <c>pid</c> or <c>name</c>
/// must be supplied. When <c>name</c> is used, every matching process is killed.
/// </summary>
public sealed class KillProcessCommandHandler : ICommandHandler
{
    public string CommandType => "kill_process";

    public Task<CommandAck> HandleAsync(PrimusCommand command, CancellationToken cancellationToken)
    {
        var p = command.TryGetParamsAsJson();
        if (p.ValueKind != JsonValueKind.Object)
        {
            return Task.FromResult(Failed(command, "kill_process requires params {pid} or {name}"));
        }

        var pid = p.TryGetProperty("pid", out var pidEl) && pidEl.ValueKind == JsonValueKind.Number ? pidEl.GetInt32() : 0;
        var name = p.TryGetProperty("name", out var nameEl) ? nameEl.GetString() : null;
        var force = p.TryGetProperty("force", out var forceEl) && forceEl.ValueKind == JsonValueKind.True;

        if (pid <= 0 && string.IsNullOrWhiteSpace(name))
        {
            return Task.FromResult(Failed(command, "Provide either 'pid' or 'name'."));
        }

        var killed = new List<int>();

        try
        {
            if (pid > 0)
            {
                KillOne(pid, force, killed);
            }
            else
            {
                var target = name!.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)
                    ? name![..^4]
                    : name!;
                foreach (var proc in Process.GetProcessesByName(target))
                {
                    KillOne(proc.Id, force, killed);
                    proc.Dispose();
                }
            }
        }
        catch (Exception ex)
        {
            return Task.FromResult(Failed(command, $"Termination error: {ex.Message}"));
        }

        return Task.FromResult(new CommandAck
        {
            CommandId = command.Id,
            State = CommandAckState.Succeeded,
            Result = new { killed_pids = killed, requested_pid = pid, requested_name = name, force },
        });
    }

    private static void KillOne(int pid, bool force, List<int> killed)
    {
        try
        {
            using var proc = Process.GetProcessById(pid);
            if (proc.HasExited)
            {
                return;
            }

            proc.Kill(entireProcessTree: force);
            proc.WaitForExit(3000);
            killed.Add(pid);
        }
        catch (ArgumentException)
        {
            // Already exited; treat as success.
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "KillOne failed for pid {Pid}", pid);
        }
    }

    private static CommandAck Failed(PrimusCommand cmd, string reason) => new()
    {
        CommandId = cmd.Id,
        State = CommandAckState.Failed,
        Result = new { reason },
    };
}
