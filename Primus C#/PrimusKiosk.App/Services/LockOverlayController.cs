using System.Windows;
using Microsoft.Extensions.DependencyInjection;
using PrimusKiosk.App.ViewModels;
using PrimusKiosk.Core.Abstractions;

namespace PrimusKiosk.App.Services;

internal sealed class LockOverlayController : ILockOverlayController
{
    private readonly IServiceProvider _services;

    public LockOverlayController(IServiceProvider services)
    {
        _services = services;
    }

    public event EventHandler<LockStateEventArgs>? StateChanged;

    public void Show(string? message)
    {
        var effective = string.IsNullOrWhiteSpace(message)
            ? "This station is locked by an administrator."
            : message;
        InvokeOnUi(vm =>
        {
            vm.Message = effective;
            vm.IsVisible = true;
        });
        StateChanged?.Invoke(this, new LockStateEventArgs(true, effective));
    }

    public void Hide()
    {
        InvokeOnUi(vm => vm.IsVisible = false);
        StateChanged?.Invoke(this, new LockStateEventArgs(false, null));
    }

    private void InvokeOnUi(Action<LockOverlayViewModel> action)
    {
        var vm = _services.GetRequiredService<LockOverlayViewModel>();
        var dispatcher = Application.Current?.Dispatcher;

        if (dispatcher is null || dispatcher.CheckAccess())
        {
            action(vm);
        }
        else
        {
            dispatcher.Invoke(() => action(vm));
        }
    }
}
