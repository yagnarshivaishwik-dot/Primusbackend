using System.Text.Json;
using PrimusKiosk.Core.Abstractions;
using PrimusKiosk.Core.Models;
using PrimusKiosk.Core.State;

namespace PrimusKiosk.Core.Commands.Handlers;

public sealed class LockCommandHandler : ICommandHandler
{
    private readonly ILockOverlayController _overlay;
    private readonly SystemStore _systemStore;

    public LockCommandHandler(ILockOverlayController overlay, SystemStore systemStore)
    {
        _overlay = overlay;
        _systemStore = systemStore;
    }

    public string CommandType => "lock";

    public Task<CommandAck> HandleAsync(PrimusCommand command, CancellationToken cancellationToken)
    {
        var p = command.TryGetParamsAsJson();
        var message = p.ValueKind == JsonValueKind.Object && p.TryGetProperty("message", out var m)
            ? m.GetString()
            : null;

        _systemStore.LockMessage = message;
        _systemStore.IsLocked = true;
        _overlay.Show(message);

        return Task.FromResult(new CommandAck
        {
            CommandId = command.Id,
            State = CommandAckState.Succeeded,
            Result = new { applied = true },
        });
    }
}

public sealed class UnlockCommandHandler : ICommandHandler
{
    private readonly ILockOverlayController _overlay;
    private readonly SystemStore _systemStore;

    public UnlockCommandHandler(ILockOverlayController overlay, SystemStore systemStore)
    {
        _overlay = overlay;
        _systemStore = systemStore;
    }

    public string CommandType => "unlock";

    public Task<CommandAck> HandleAsync(PrimusCommand command, CancellationToken cancellationToken)
    {
        _systemStore.IsLocked = false;
        _systemStore.LockMessage = null;
        _overlay.Hide();
        return Task.FromResult(new CommandAck
        {
            CommandId = command.Id,
            State = CommandAckState.Succeeded,
            Result = new { applied = true },
        });
    }
}
