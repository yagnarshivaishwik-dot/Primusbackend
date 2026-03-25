using System.Windows.Controls;

namespace PrimusKiosk.Services;

public class NavigationService
{
    private readonly ContentControl _host;

    public NavigationService(ContentControl host)
    {
        _host = host;
    }

    public void Navigate(object content)
    {
        _host.Content = content;
    }
}


