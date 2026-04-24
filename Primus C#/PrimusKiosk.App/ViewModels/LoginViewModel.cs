using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using PrimusKiosk.Core.Abstractions;
using PrimusKiosk.Core.State;
using Serilog;

namespace PrimusKiosk.App.ViewModels;

public sealed partial class LoginViewModel : ObservableObject
{
    private readonly INavigationService _navigation;
    private readonly IPrimusApiClient _api;
    private readonly ITokenStore _tokenStore;
    private readonly AuthStore _authStore;
    private readonly ICommandService _commandService;

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(LoginCommand))]
    private string _email = string.Empty;

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(LoginCommand))]
    private string _password = string.Empty;

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(LoginCommand))]
    private bool _isBusy;

    [ObservableProperty]
    private string? _errorMessage;

    public string LoginButtonText => IsBusy ? "Signing in..." : "Sign in";

    public LoginViewModel(
        INavigationService navigation,
        IPrimusApiClient api,
        ITokenStore tokenStore,
        AuthStore authStore,
        ICommandService commandService)
    {
        _navigation = navigation;
        _api = api;
        _tokenStore = tokenStore;
        _authStore = authStore;
        _commandService = commandService;
    }

    partial void OnIsBusyChanged(bool value) => OnPropertyChanged(nameof(LoginButtonText));

    private bool CanLogin()
        => !IsBusy && !string.IsNullOrWhiteSpace(Email) && !string.IsNullOrWhiteSpace(Password);

    [RelayCommand(CanExecute = nameof(CanLogin))]
    private async Task LoginAsync(CancellationToken cancellationToken)
    {
        ErrorMessage = null;
        IsBusy = true;
        try
        {
            var tokens = await _api.LoginAsync(Email, Password, cancellationToken).ConfigureAwait(false);
            if (string.IsNullOrWhiteSpace(tokens.AccessToken))
            {
                ErrorMessage = "Login failed. Please check your credentials.";
                return;
            }

            await _tokenStore.SaveAsync(tokens, cancellationToken).ConfigureAwait(false);
            _authStore.UpdateTokens(tokens);

            var me = await _api.GetMeAsync(cancellationToken).ConfigureAwait(false);
            _authStore.SignIn(me, tokens);

            await _commandService.StartAsync(cancellationToken).ConfigureAwait(false);

            _navigation.NavigateTo<SessionViewModel>();
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Login failed for {Email}", Email);
            ErrorMessage = "Login failed. Please check your credentials.";
        }
        finally
        {
            IsBusy = false;
        }
    }
}
