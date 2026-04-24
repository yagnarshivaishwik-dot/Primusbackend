using FluentAssertions;
using PrimusKiosk.Core.Abstractions;
using PrimusKiosk.Core.Commands;
using PrimusKiosk.Core.Models;
using Xunit;

namespace PrimusKiosk.Tests.Commands;

public sealed class CommandDispatcherTests
{
    [Fact]
    public async Task Dispatch_UnknownCommand_Fails()
    {
        var dispatcher = new CommandDispatcher(Array.Empty<ICommandHandler>());
        var cmd = new PrimusCommand { Id = 1, Command = "unknown" };

        var ack = await dispatcher.DispatchAsync(cmd, CancellationToken.None);

        ack.CommandId.Should().Be(1);
        ack.State.Should().Be(CommandAckState.Failed);
    }

    [Fact]
    public async Task Dispatch_Expired_Fails()
    {
        var dispatcher = new CommandDispatcher(Array.Empty<ICommandHandler>());
        var cmd = new PrimusCommand
        {
            Id = 2,
            Command = "lock",
            ExpiresAtUtc = DateTime.UtcNow.AddSeconds(-10),
        };

        var ack = await dispatcher.DispatchAsync(cmd, CancellationToken.None);

        ack.State.Should().Be(CommandAckState.Failed);
    }

    [Fact]
    public async Task Dispatch_KnownHandler_ReturnsHandlerAck()
    {
        var handler = new FakeHandler("echo", new CommandAck
        {
            CommandId = 3,
            State = CommandAckState.Succeeded,
            Result = new { ok = true },
        });
        var dispatcher = new CommandDispatcher(new ICommandHandler[] { handler });

        var ack = await dispatcher.DispatchAsync(new PrimusCommand { Id = 3, Command = "echo" }, CancellationToken.None);

        ack.State.Should().Be(CommandAckState.Succeeded);
    }

    [Fact]
    public void CommandAckState_MapsToWireString()
    {
        CommandAckState.Running.ToWireString().Should().Be("RUNNING");
        CommandAckState.Succeeded.ToWireString().Should().Be("SUCCEEDED");
        CommandAckState.Failed.ToWireString().Should().Be("FAILED");
    }

    [Fact]
    public void TryGetParamsAsJson_ParsesJsonString()
    {
        var cmd = new PrimusCommand { Id = 1, Command = "message", Params = "{\"text\":\"hi\"}" };
        var p = cmd.TryGetParamsAsJson();
        p.ValueKind.Should().Be(System.Text.Json.JsonValueKind.Object);
        p.GetProperty("text").GetString().Should().Be("hi");
    }

    [Fact]
    public void TryGetParamsAsJson_NullParams_ReturnsDefault()
    {
        var cmd = new PrimusCommand { Id = 1, Command = "shutdown", Params = null };
        var p = cmd.TryGetParamsAsJson();
        p.ValueKind.Should().Be(System.Text.Json.JsonValueKind.Undefined);
    }

    private sealed class FakeHandler : ICommandHandler
    {
        private readonly CommandAck _ack;
        public FakeHandler(string type, CommandAck ack)
        {
            CommandType = type;
            _ack = ack;
        }

        public string CommandType { get; }

        public Task<CommandAck> HandleAsync(PrimusCommand command, CancellationToken cancellationToken)
            => Task.FromResult(_ack);
    }
}
