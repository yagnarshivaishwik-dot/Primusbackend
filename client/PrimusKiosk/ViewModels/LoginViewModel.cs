using System;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Threading.Tasks;
using System.Windows.Input;
using PrimusKiosk.Services;

namespace PrimusKiosk.ViewModels;

public class LoginViewModel : INotifyPropertyChanged
{
    private readonly AppStateService _appState;
    private readonly BackendClient _backend;

    private string _usernameOrEmail = string.Empty;
    private string _password = string.Empty;
    private bool _isBusy;
    private string _errorMessage = string.Empty;

    public event PropertyChangedEventHandler? PropertyChanged;
    public event EventHandler? LoginSucceeded;

    public LoginViewModel(AppStateService appState, BackendClient backend)
    {
        _appState = appState;
        _backend = backend;
        LoginCommand = new AsyncRelayCommand(LoginAsync, () => !IsBusy);
    }

    public string UsernameOrEmail
    {
        get => _usernameOrEmail;
        set
        {
            if (value == _usernameOrEmail) return;
            _usernameOrEmail = value;
            OnPropertyChanged();
        }
    }

    public string Password
    {
        get => _password;
        set
        {
            if (value == _password) return;
            _password = value;
            OnPropertyChanged();
        }
    }

    public string ErrorMessage
    {
        get => _errorMessage;
        set
        {
            if (value == _errorMessage) return;
            _errorMessage = value;
            OnPropertyChanged();
        }
    }

    public bool IsBusy
    {
        get => _isBusy;
        set
        {
            if (value == _isBusy) return;
            _isBusy = value;
            OnPropertyChanged();
            (LoginCommand as AsyncRelayCommand)?.RaiseCanExecuteChanged();
            OnPropertyChanged(nameof(LoginButtonText));
        }
    }

    public string LoginButtonText => IsBusy ? "Signing in..." : "Log in";

    public ICommand LoginCommand { get; }

    private async Task LoginAsync()
    {
        ErrorMessage = string.Empty;
        if (string.IsNullOrWhiteSpace(UsernameOrEmail) || string.IsNullOrWhiteSpace(Password))
        {
            ErrorMessage = "Email/username and password are required.";
            return;
        }

        try
        {
            IsBusy = true;
            var success = await _backend.LoginAsync(UsernameOrEmail, Password);
            if (!success)
            {
                ErrorMessage = "Login failed. Please check your credentials.";
                return;
            }

            LoginSucceeded?.Invoke(this, EventArgs.Empty);
        }
        catch (Exception ex)
        {
            Serilog.Log.Error(ex, "Login failed");
            ErrorMessage = "Unexpected error while logging in.";
        }
        finally
        {
            IsBusy = false;
        }
    }

    protected void OnPropertyChanged([CallerMemberName] string? propertyName = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
    }
}


