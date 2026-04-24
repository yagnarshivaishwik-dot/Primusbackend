using System.Windows;
using Microsoft.Extensions.DependencyInjection;
using PrimusKiosk.Core.Abstractions;

namespace PrimusKiosk.App.Services;

internal sealed class NavigationService : INavigationService
{
    private readonly IServiceProvider _services;
    private object? _current;

    public NavigationService(IServiceProvider services)
    {
        _services = services;
    }

    public object? Current => _current;

    public event EventHandler<object?>? CurrentChanged;

    public void NavigateTo<TViewModel>() where TViewModel : class
    {
        var vm = _services.GetRequiredService<TViewModel>();
        NavigateTo(vm);
    }

    public void NavigateTo(object viewModel)
    {
        if (ReferenceEquals(_current, viewModel))
        {
            return;
        }

        _current = viewModel;
        if (Application.Current?.Dispatcher is { } dispatcher && !dispatcher.CheckAccess())
        {
            dispatcher.Invoke(() => CurrentChanged?.Invoke(this, viewModel));
        }
        else
        {
            CurrentChanged?.Invoke(this, viewModel);
        }
    }
}
