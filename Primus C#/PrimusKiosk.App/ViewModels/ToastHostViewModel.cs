using System.Collections.ObjectModel;
using System.Windows;
using CommunityToolkit.Mvvm.ComponentModel;
using PrimusKiosk.Core.Models;

namespace PrimusKiosk.App.ViewModels;

public sealed partial class ToastHostViewModel : ObservableObject
{
    public ObservableCollection<AnnouncementDto> Toasts { get; } = new();

    public void Push(AnnouncementDto announcement)
    {
        var dispatcher = Application.Current?.Dispatcher;
        if (dispatcher is null || dispatcher.CheckAccess())
        {
            AddAndSchedule(announcement);
        }
        else
        {
            dispatcher.Invoke(() => AddAndSchedule(announcement));
        }
    }

    private void AddAndSchedule(AnnouncementDto announcement)
    {
        Toasts.Add(announcement);
        _ = RemoveAfterAsync(announcement, TimeSpan.FromSeconds(6));
    }

    private async Task RemoveAfterAsync(AnnouncementDto announcement, TimeSpan after)
    {
        await Task.Delay(after).ConfigureAwait(true);
        Toasts.Remove(announcement);
    }
}
