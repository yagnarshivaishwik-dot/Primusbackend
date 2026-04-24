using Microsoft.Extensions.DependencyInjection;
using PrimusKiosk.App.ViewModels;
using PrimusKiosk.App.WebHost.Bridge;
using PrimusKiosk.Core.Abstractions;

namespace PrimusKiosk.App.Services;

internal static class AppServiceRegistration
{
    public static IServiceCollection AddPrimusAppServices(this IServiceCollection services)
    {
        // UI-bound services
        services.AddSingleton<INavigationService, NavigationService>();
        services.AddSingleton<ILockOverlayController, LockOverlayController>();
        services.AddSingleton<INotificationService, ToastNotificationService>();

        // WebView2 JS ↔ C# bridge (singleton so realtime events are forwarded throughout the session)
        services.AddSingleton<JsBridge>();

        // Realtime event routing (eagerly constructed in ShellViewModel so it subscribes
        // before the WebSocket starts dispatching events)
        services.AddSingleton<RealtimeEventRouter>();

        // ViewModels
        services.AddSingleton<ShellViewModel>();
        services.AddTransient<LoadingViewModel>();
        services.AddTransient<SetupViewModel>();
        services.AddTransient<LoginViewModel>();
        services.AddTransient<SessionViewModel>();
        services.AddTransient<ChatViewModel>();
        services.AddSingleton<LockOverlayViewModel>();
        services.AddSingleton<ToastHostViewModel>();

        return services;
    }
}
