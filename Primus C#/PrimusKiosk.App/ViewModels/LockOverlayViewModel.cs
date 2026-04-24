using CommunityToolkit.Mvvm.ComponentModel;

namespace PrimusKiosk.App.ViewModels;

public sealed partial class LockOverlayViewModel : ObservableObject
{
    [ObservableProperty]
    private bool _isVisible;

    [ObservableProperty]
    private string _message = "This station is locked by an administrator.";
}
