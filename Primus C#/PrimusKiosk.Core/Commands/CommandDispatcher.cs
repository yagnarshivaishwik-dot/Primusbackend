using System.Collections.Concurrent;
using PrimusKiosk.Core.Abstractions;
using PrimusKiosk.Core.Models;
using Serilog;

namespace PrimusKiosk.Core.Commands;

public sealed class CommandDispatcher : ICommandDispatcher
{
    private readonly ConcurrentDictionary<string, ICommandHandler> _handlers =
        new(StringComparer.OrdinalIgnoreCase);

    public CommandDispatcher(IEnumerable<ICommandHandler> handlers)
    {
        foreach (var handler in handlers)
        {
            _handlers[handler.CommandType] = handler;
        }
    }

    public void RegisterHandler(ICommandHandler handler)
        => _handlers[handler.CommandType] = handler;

    public async Task<CommandAck> DispatchAsync(PrimusCommand command, CancellationToken cancellationToken)
    {
        if (command.ExpiresAtUtc is { } expiry && expiry < DateTime.UtcNow)
        {
            Log.Information("Command {Command}/#{Id} expired at {Expiry}.", command.Command, command.Id, expiry);
            return new CommandAck
            {
                CommandId = command.Id,
                State = CommandAckState.Failed,
                Result = new { reason = "expired", expired_at = expiry.ToString("O") },
            };
        }

        if (!_handlers.TryGetValue(command.Command, out var handler))
        {
            Log.Warning("No handler registered for command '{Command}' (#{Id}).", command.Command, command.Id);
            return new CommandAck
            {
                CommandId = command.Id,
                State = CommandAckState.Failed,
                Result = new { reason = "unsupported_command", command = command.Command },
            };
        }

        try
        {
            return await handler.HandleAsync(command, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Command handler for {Command}/#{Id} threw.", command.Command, command.Id);
            return new CommandAck
            {
                CommandId = command.Id,
                State = CommandAckState.Failed,
                Result = new { reason = "handler_exception", message = ex.Message },
            };
        }
    }
}
