namespace PrimusKiosk.Core.Abstractions;

/// <summary>
/// Application-wide navigation. Implemented in the WPF app by swapping a ContentControl target;
/// Core uses it only via the interface so tests and command handlers can stay UI-agnostic.
/// </summary>
public interface INavigationService
{
    /// <summary>Navigates to a registered view-model type. View resolution happens in the UI layer.</summary>
    void NavigateTo<TViewModel>() where TViewModel : class;

    /// <summary>Navigates to an already-constructed view-model instance.</summary>
    void NavigateTo(object viewModel);

    object? Current { get; }
    event EventHandler<object?>? CurrentChanged;
}
