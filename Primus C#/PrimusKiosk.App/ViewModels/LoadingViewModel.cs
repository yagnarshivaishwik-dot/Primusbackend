using CommunityToolkit.Mvvm.ComponentModel;

namespace PrimusKiosk.App.ViewModels;

public sealed partial class LoadingViewModel : ObservableObject
{
    [ObservableProperty]
    private string _message = "Starting Primus Kiosk...";
}
