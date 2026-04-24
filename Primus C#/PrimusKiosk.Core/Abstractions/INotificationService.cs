using PrimusKiosk.Core.Models;

namespace PrimusKiosk.Core.Abstractions;

public interface INotificationService
{
    void Info(string title, string message);
    void Warn(string title, string message);
    void Error(string title, string message);
    void Show(AnnouncementDto announcement);
}
