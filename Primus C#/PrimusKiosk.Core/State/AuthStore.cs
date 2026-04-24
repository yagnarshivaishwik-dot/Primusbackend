using CommunityToolkit.Mvvm.ComponentModel;
using PrimusKiosk.Core.Models;

namespace PrimusKiosk.Core.State;

/// <summary>
/// Observable auth state. Single instance registered as a singleton in DI;
/// view-models bind directly and react to <see cref="ObservableObject.PropertyChanged"/>.
/// </summary>
public sealed partial class AuthStore : ObservableObject
{
    [ObservableProperty]
    private UserDto? _user;

    [ObservableProperty]
    private TokenBundle? _tokens;

    [ObservableProperty]
    private bool _isAuthenticated;

    public void SignIn(UserDto user, TokenBundle tokens)
    {
        User = user;
        Tokens = tokens;
        IsAuthenticated = true;
    }

    public void UpdateTokens(TokenBundle tokens)
    {
        Tokens = tokens;
    }

    public void SignOut()
    {
        User = null;
        Tokens = null;
        IsAuthenticated = false;
    }

    public string? Role => User?.Role;

    public bool IsClient => string.Equals(Role, "client", StringComparison.OrdinalIgnoreCase);
}
