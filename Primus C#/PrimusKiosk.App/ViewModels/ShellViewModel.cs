using CommunityToolkit.Mvvm.ComponentModel;
using Microsoft.Extensions.DependencyInjection;
using PrimusKiosk.App.Services;
using PrimusKiosk.Core.Abstractions;
using PrimusKiosk.Core.Infrastructure;
using Serilog;

namespace PrimusKiosk.App.ViewModels;

/// <summary>
/// Root view-model for <see cref="MainWindow"/>. Owns the navigation root and the lock overlay,
/// and performs first-render bootstrap work (credential load, initial route, command service start).
/// </summary>
public sealed partial class ShellViewModel : ObservableObject, IDisposable
{
    private readonly IServiceProvider _services;
    private readonly INavigationService _navigation;
    private readonly IDeviceCredentialStore _credentialStore;
    private readonly ITokenStore _tokenStore;
    private readonly Core.State.AuthStore _authStore;
    private readonly ICommandService _commandService;
    private readonly RealtimeEventRouter _realtimeRouter;
    private readonly Microsoft.Extensions.Options.IOptionsMonitor<PrimusSettings> _settings;
    private readonly CancellationTokenSource _cts = new();

    [ObservableProperty]
    private object? _currentViewModel;

    public LockOverlayViewModel LockOverlay { get; }
    public ToastHostViewModel ToastHost { get; }

    public ShellViewModel(
        IServiceProvider services,
        INavigationService navigation,
        IDeviceCredentialStore credentialStore,
        ITokenStore tokenStore,
        Core.State.AuthStore authStore,
        ICommandService commandService,
        RealtimeEventRouter realtimeRouter,
        LockOverlayViewModel lockOverlay,
        ToastHostViewModel toastHost,
        Microsoft.Extensions.Options.IOptionsMonitor<PrimusSettings> settings)
    {
        _services = services;
        _navigation = navigation;
        _credentialStore = credentialStore;
        _tokenStore = tokenStore;
        _authStore = authStore;
        _commandService = commandService;
        _realtimeRouter = realtimeRouter;
        _settings = settings;
        LockOverlay = lockOverlay;
        ToastHost = toastHost;

        _navigation.CurrentChanged += (_, vm) => CurrentViewModel = vm;

        // Show the loading view immediately so the window isn't blank during bootstrap.
        CurrentViewModel = _services.GetRequiredService<LoadingViewModel>();
    }

    public async Task StartAsync()
    {
        try
        {
            var settings = _settings.CurrentValue;
            if (!settings.IsConfigured())
            {
                _navigation.NavigateTo<SetupViewModel>();
                return;
            }

            var creds = await _credentialStore.LoadAsync(_cts.Token).ConfigureAwait(false);
            if (creds is null || !creds.IsValid())
            {
                _navigation.NavigateTo<SetupViewModel>();
                return;
            }

            var tokens = await _tokenStore.LoadAsync(_cts.Token).ConfigureAwait(false);
            if (tokens is null || string.IsNullOrWhiteSpace(tokens.AccessToken))
            {
                _navigation.NavigateTo<LoginViewModel>();
                return;
            }

            // Best-effort: restore auth state. GetMe/Refresh validations happen lazily on first API call.
            _authStore.UpdateTokens(tokens);

            try
            {
                var api = _services.GetRequiredService<IPrimusApiClient>();
                var me = await api.GetMeAsync(_cts.Token).ConfigureAwait(false);
                _authStore.SignIn(me, tokens);

                await _commandService.StartAsync(_cts.Token).ConfigureAwait(false);

                _navigation.NavigateTo<SessionViewModel>();
            }
            catch (Exception ex)
            {
                Log.Information(ex, "Cached token invalid; falling back to login.");
                _navigation.NavigateTo<LoginViewModel>();
            }
        }
        catch (Exception ex)
        {
            CrashReporter.WriteReport(ex, "ShellViewModel.StartAsync");
            _navigation.NavigateTo<LoginViewModel>();
        }
    }

    public void Dispose()
    {
        try
        {
            _realtimeRouter.Dispose();
            _cts.Cancel();
            _cts.Dispose();
            _ = _commandService.StopAsync(CancellationToken.None);
        }
        catch (Exception ex)
        {
            Log.Debug(ex, "ShellViewModel dispose failure");
        }
    }
}
