using System.Text.Json;
using PrimusKiosk.Core.Abstractions;
using PrimusKiosk.Core.Models;

namespace PrimusKiosk.Core.Commands.Handlers;

public sealed class ShutdownCommandHandler : ICommandHandler
{
    private readonly ISystemControl _system;

    public ShutdownCommandHandler(ISystemControl system) => _system = system;

    public string CommandType => "shutdown";

    public async Task<CommandAck> HandleAsync(PrimusCommand command, CancellationToken cancellationToken)
    {
        var p = command.TryGetParamsAsJson();
        var delaySeconds = p.ValueKind == JsonValueKind.Object && p.TryGetProperty("delay_seconds", out var d) ? d.GetInt32() : 30;
        var reason = p.ValueKind == JsonValueKind.Object && p.TryGetProperty("reason", out var r) ? r.GetString() : null;

        await _system.ShutdownAsync(TimeSpan.FromSeconds(delaySeconds), reason, cancellationToken).ConfigureAwait(false);

        return new CommandAck
        {
            CommandId = command.Id,
            State = CommandAckState.Succeeded,
            Result = new { delay_seconds = delaySeconds, reason },
        };
    }
}

/// <summary>Shared implementation for the <c>reboot</c> and <c>restart</c> commands — same OS action.</summary>
public abstract class RestartCommandHandlerBase : ICommandHandler
{
    private readonly ISystemControl _system;

    protected RestartCommandHandlerBase(ISystemControl system) => _system = system;

    public abstract string CommandType { get; }

    public async Task<CommandAck> HandleAsync(PrimusCommand command, CancellationToken cancellationToken)
    {
        var p = command.TryGetParamsAsJson();
        var delaySeconds = p.ValueKind == JsonValueKind.Object && p.TryGetProperty("delay_seconds", out var d) ? d.GetInt32() : 30;
        var reason = p.ValueKind == JsonValueKind.Object && p.TryGetProperty("reason", out var r) ? r.GetString() : null;

        await _system.RestartAsync(TimeSpan.FromSeconds(delaySeconds), reason, cancellationToken).ConfigureAwait(false);

        return new CommandAck
        {
            CommandId = command.Id,
            State = CommandAckState.Succeeded,
            Result = new { delay_seconds = delaySeconds, reason },
        };
    }
}

public sealed class RebootCommandHandler : RestartCommandHandlerBase
{
    public RebootCommandHandler(ISystemControl system) : base(system) { }
    public override string CommandType => "reboot";
}

public sealed class RestartCommandHandler : RestartCommandHandlerBase
{
    public RestartCommandHandler(ISystemControl system) : base(system) { }
    public override string CommandType => "restart";
}

public sealed class LogoutCommandHandler : ICommandHandler
{
    private readonly ISystemControl _system;

    public LogoutCommandHandler(ISystemControl system) => _system = system;

    public string CommandType => "logout";

    public async Task<CommandAck> HandleAsync(PrimusCommand command, CancellationToken cancellationToken)
    {
        await _system.LogoffAsync(cancellationToken).ConfigureAwait(false);
        return new CommandAck
        {
            CommandId = command.Id,
            State = CommandAckState.Succeeded,
            Result = new { applied = true },
        };
    }
}

public sealed class MessageCommandHandler : ICommandHandler
{
    private readonly INotificationService _notifications;

    public MessageCommandHandler(INotificationService notifications) => _notifications = notifications;

    public string CommandType => "message";

    public Task<CommandAck> HandleAsync(PrimusCommand command, CancellationToken cancellationToken)
    {
        var p = command.TryGetParamsAsJson();

        // Backend allowlist for "message" is {text: str}. Be tolerant of {title, body} variants too.
        var text = p.ValueKind == JsonValueKind.Object && p.TryGetProperty("text", out var tEl)
            ? tEl.GetString()
            : (p.ValueKind == JsonValueKind.Object && p.TryGetProperty("body", out var bEl) ? bEl.GetString() : null);

        var title = p.ValueKind == JsonValueKind.Object && p.TryGetProperty("title", out var titleEl)
            ? titleEl.GetString() ?? "Message"
            : "Message";

        _notifications.Info(title, text ?? string.Empty);

        return Task.FromResult(new CommandAck
        {
            CommandId = command.Id,
            State = CommandAckState.Succeeded,
            Result = new { displayed = true, text },
        });
    }
}

public sealed class ScreenshotCommandHandler : ICommandHandler
{
    private readonly IScreenshotService _screenshots;

    public ScreenshotCommandHandler(IScreenshotService screenshots) => _screenshots = screenshots;

    public string CommandType => "screenshot";

    public async Task<CommandAck> HandleAsync(PrimusCommand command, CancellationToken cancellationToken)
    {
        var id = await _screenshots.CaptureAndUploadAsync(cancellationToken).ConfigureAwait(false);
        return new CommandAck
        {
            CommandId = command.Id,
            State = CommandAckState.Succeeded,
            Result = new { screenshot_id = id },
        };
    }
}

/// <summary>
/// Handles the backend's <c>login</c> command (<c>{user_id: int}</c>). The kiosk is client-only;
/// we surface it to the user so staff-driven user switches are visible.
/// </summary>
public sealed class LoginCommandHandler : ICommandHandler
{
    private readonly INotificationService _notifications;

    public LoginCommandHandler(INotificationService notifications) => _notifications = notifications;

    public string CommandType => "login";

    public Task<CommandAck> HandleAsync(PrimusCommand command, CancellationToken cancellationToken)
    {
        var p = command.TryGetParamsAsJson();
        var userId = p.ValueKind == JsonValueKind.Object && p.TryGetProperty("user_id", out var uEl) && uEl.ValueKind == JsonValueKind.Number
            ? uEl.GetInt32()
            : 0;

        _notifications.Info("Remote login requested", $"Staff has queued a login for user #{userId}. Please wait for the session to begin.");

        return Task.FromResult(new CommandAck
        {
            CommandId = command.Id,
            State = CommandAckState.Succeeded,
            Result = new { user_id = userId, acknowledged = true },
        });
    }
}
