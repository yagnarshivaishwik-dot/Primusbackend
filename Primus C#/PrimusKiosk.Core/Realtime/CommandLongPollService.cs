using Microsoft.Extensions.Options;
using PrimusKiosk.Core.Abstractions;
using PrimusKiosk.Core.Infrastructure;
using PrimusKiosk.Core.Models;
using Serilog;

namespace PrimusKiosk.Core.Realtime;

/// <summary>
/// HTTP long-poll fallback that kicks in when the WebSocket has been disconnected for &gt;10 s.
/// Owned by <see cref="CommandService"/>; never started directly.
/// </summary>
public sealed class CommandLongPollService
{
    private readonly IPrimusApiClient _api;
    private readonly ICommandDispatcher _dispatcher;
    private readonly PrimusSettings _settings;

    public CommandLongPollService(
        IPrimusApiClient api,
        ICommandDispatcher dispatcher,
        IOptionsMonitor<PrimusSettings> settings)
    {
        _api = api;
        _dispatcher = dispatcher;
        _settings = settings.CurrentValue;
    }

    public async Task RunAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                var commands = await _api.PullCommandsAsync(_settings.LongPollIntervalSeconds, cancellationToken).ConfigureAwait(false);

                foreach (var command in commands)
                {
                    if (cancellationToken.IsCancellationRequested)
                    {
                        break;
                    }

                    try
                    {
                        var ack = await _dispatcher.DispatchAsync(command, cancellationToken).ConfigureAwait(false);
                        await _api.AckCommandAsync(ack, cancellationToken).ConfigureAwait(false);
                    }
                    catch (Exception ex)
                    {
                        Log.Warning(ex, "Long-poll command {Command}/#{Id} failed.", command.Command, command.Id);
                        await _api.AckCommandAsync(new CommandAck
                        {
                            CommandId = command.Id,
                            State = CommandAckState.Failed,
                            Result = new { reason = "dispatch_exception", message = ex.Message },
                        }, cancellationToken).ConfigureAwait(false);
                    }
                }
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                Log.Warning(ex, "Long-poll command pull failed; backing off.");
                try
                {
                    await Task.Delay(TimeSpan.FromSeconds(5), cancellationToken).ConfigureAwait(false);
                }
                catch (OperationCanceledException) { return; }
            }
        }
    }
}
