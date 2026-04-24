using PrimusKiosk.Core.Models;

namespace PrimusKiosk.Core.Abstractions;

public interface ICommandDispatcher
{
    Task<CommandAck> DispatchAsync(PrimusCommand command, CancellationToken cancellationToken);
    void RegisterHandler(ICommandHandler handler);
}

public interface ICommandHandler
{
    string CommandType { get; }
    Task<CommandAck> HandleAsync(PrimusCommand command, CancellationToken cancellationToken);
}
