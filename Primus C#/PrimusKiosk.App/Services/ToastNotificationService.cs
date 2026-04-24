using System.Windows;
using Microsoft.Extensions.DependencyInjection;
using PrimusKiosk.App.ViewModels;
using PrimusKiosk.Core.Abstractions;
using PrimusKiosk.Core.Models;

namespace PrimusKiosk.App.Services;

internal sealed class ToastNotificationService : INotificationService
{
    private readonly IServiceProvider _services;

    public ToastNotificationService(IServiceProvider services)
    {
        _services = services;
    }

    public void Info(string title, string message) => Push(title, message, "info");
    public void Warn(string title, string message) => Push(title, message, "warning");
    public void Error(string title, string message) => Push(title, message, "error");

    public void Show(AnnouncementDto announcement)
        => Push(announcement.Title, announcement.Body, announcement.Severity);

    private void Push(string title, string message, string severity)
    {
        var vm = _services.GetRequiredService<ToastHostViewModel>();
        var dispatcher = Application.Current?.Dispatcher;

        void PushOnUi()
        {
            vm.Push(new AnnouncementDto
            {
                Title = title,
                Body = message,
                Severity = severity,
                CreatedAtUtc = DateTime.UtcNow,
            });
        }

        if (dispatcher is null || dispatcher.CheckAccess())
        {
            PushOnUi();
        }
        else
        {
            dispatcher.Invoke(PushOnUi);
        }
    }
}
