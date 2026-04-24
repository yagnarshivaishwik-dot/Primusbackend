using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;
using PrimusKiosk.Core.Abstractions;
using PrimusKiosk.Core.Commands;
using PrimusKiosk.Core.Commands.Handlers;
using PrimusKiosk.Core.Device;
using PrimusKiosk.Core.Games;
using PrimusKiosk.Core.Http;
using PrimusKiosk.Core.Kiosk;
using PrimusKiosk.Core.Native;
using PrimusKiosk.Core.Realtime;
using PrimusKiosk.Core.Screenshot;
using PrimusKiosk.Core.State;

namespace PrimusKiosk.Core.Infrastructure;

public static class ServiceCollectionExtensions
{
    /// <summary>
    /// Registers Core services (stores, api client, realtime, commands, kiosk). The App project
    /// separately registers UI-bound services (navigation, lock overlay, notification sinks).
    /// </summary>
    public static IServiceCollection AddPrimusCore(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.AddOptions<PrimusSettings>()
            .Bind(configuration.GetSection(PrimusSettings.SectionName))
            .PostConfigure(settings =>
            {
                if (string.IsNullOrWhiteSpace(settings.WsBaseUrl) && !string.IsNullOrWhiteSpace(settings.ApiBaseUrl))
                {
                    settings.WsBaseUrl = InferWsUrl(settings.ApiBaseUrl);
                }
            });

        services.TryAddSingleton<AuthStore>();
        services.TryAddSingleton<SystemStore>();

        services.TryAddSingleton<INativeBridge, NativeBridge>();
        services.TryAddSingleton<IDeviceCredentialStore, DeviceCredentialStore>();
        services.TryAddSingleton<ITokenStore, TokenStore>();
        services.TryAddSingleton<IHardwareFingerprintProvider, HardwareFingerprintProvider>();
        services.TryAddSingleton<ISystemControl, SystemControl>();
        services.TryAddSingleton<IKioskOrchestrator, KioskOrchestrator>();
        services.TryAddSingleton<IShellReplacementService, Kiosk.ShellReplacementService>();
        services.TryAddSingleton<GameRegistryScanner>();
        services.TryAddSingleton<IGameCatalog, GameCatalog>();
        services.TryAddSingleton<IGameLauncher, GameLauncher>();
        // Screenshot uses managed GDI+ by default so the feature works without the native DLL.
        services.TryAddSingleton<IScreenshotService, Screenshot.GdiScreenshotService>();
        services.TryAddSingleton<IAutoBootService, AutoBootService>();
        services.TryAddSingleton<ISystemInfoProvider, SystemInfoProvider>();
        services.TryAddSingleton<IHardwareMonitor, HardwareMonitor>();
        services.TryAddSingleton<IIdleMonitor, IdleMonitor>();

        // Offline queue: the sender delegate is wired up by the App layer when the realtime client is registered.
        services.TryAddSingleton<IOfflineQueue>(sp =>
            new OfflineQueueService((_, _, _) => Task.FromResult(true)));

        // HTTP pipeline
        services.AddTransient<HmacSigningHandler>();
        services.AddTransient<AuthHandler>();

        services.AddHttpClient<IPrimusApiClient, PrimusHttpClient>((sp, http) =>
            {
                var settings = sp.GetRequiredService<IOptionsMonitor<PrimusSettings>>().CurrentValue;
                if (!string.IsNullOrWhiteSpace(settings.ApiBaseUrl))
                {
                    http.BaseAddress = new Uri(settings.ApiBaseUrl.TrimEnd('/') + "/");
                }
                http.Timeout = TimeSpan.FromSeconds(Math.Max(5, settings.HttpTimeoutSeconds));
            })
            .AddHttpMessageHandler<HmacSigningHandler>()
            .AddHttpMessageHandler<AuthHandler>()
            .AddPolicyHandler((sp, _) =>
            {
                var settings = sp.GetRequiredService<IOptionsMonitor<PrimusSettings>>().CurrentValue;
                return RetryPolicies.BuildRetry(settings.HttpRetryAttempts);
            })
            .AddPolicyHandler((sp, _) =>
            {
                var settings = sp.GetRequiredService<IOptionsMonitor<PrimusSettings>>().CurrentValue;
                return RetryPolicies.BuildTimeout(TimeSpan.FromSeconds(Math.Max(5, settings.HttpTimeoutSeconds * 2)));
            });

        // Realtime + commands
        services.TryAddSingleton<IPrimusRealtimeClient, PrimusWebSocketClient>();
        services.TryAddSingleton<CommandLongPollService>();
        services.TryAddSingleton<ICommandService, CommandService>();

        // Command handlers — names match the backend's ALLOWED_COMMANDS allowlist in
        // backend/app/api/endpoints/remote_command.py: lock, unlock, message, shutdown,
        // reboot, screenshot, login, logout, restart.
        services.AddSingleton<ICommandHandler, LockCommandHandler>();
        services.AddSingleton<ICommandHandler, UnlockCommandHandler>();
        services.AddSingleton<ICommandHandler, ShutdownCommandHandler>();
        services.AddSingleton<ICommandHandler, RebootCommandHandler>();
        services.AddSingleton<ICommandHandler, RestartCommandHandler>();
        services.AddSingleton<ICommandHandler, LogoutCommandHandler>();
        services.AddSingleton<ICommandHandler, MessageCommandHandler>();
        services.AddSingleton<ICommandHandler, ScreenshotCommandHandler>();
        services.AddSingleton<ICommandHandler, LoginCommandHandler>();
        services.AddSingleton<ICommandHandler, LaunchAppCommandHandler>();
        services.AddSingleton<ICommandHandler, KillProcessCommandHandler>();
        services.AddSingleton<ICommandDispatcher, CommandDispatcher>();

        return services;
    }

    /// <summary>
    /// Adds the layered configuration sources used by the kiosk: appsettings (from any of
    /// the install-time config locations), environment-specific overrides,
    /// <c>%ProgramData%\Primus\overrides.json</c> (DPAPI-wrapped), and PRIMUS_* env vars.
    /// </summary>
    public static IConfigurationBuilder AddPrimusLayeredConfiguration(
        this IConfigurationBuilder builder,
        string? environment)
    {
        AddResolvedJsonFile(builder, "appsettings.json");

        if (!string.IsNullOrWhiteSpace(environment))
        {
            AddResolvedJsonFile(builder, $"appsettings.{environment}.json");
        }

        builder.Add(new OverridesJsonConfigurationSource());
        builder.AddEnvironmentVariables(prefix: "PRIMUS_");

        return builder;
    }

    private static void AddResolvedJsonFile(IConfigurationBuilder builder, string fileName)
    {
        var resolved = PrimusPaths.FindConfigFile(fileName);
        if (resolved is not null)
        {
            builder.AddJsonFile(resolved, optional: true, reloadOnChange: false);
        }
        else
        {
            // Still register by name so CWD-relative loads work for developers.
            builder.AddJsonFile(fileName, optional: true, reloadOnChange: false);
        }
    }

    private static string InferWsUrl(string httpUrl)
    {
        if (httpUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            return "wss://" + httpUrl[8..];
        }
        if (httpUrl.StartsWith("http://", StringComparison.OrdinalIgnoreCase))
        {
            return "ws://" + httpUrl[7..];
        }
        return httpUrl;
    }
}
