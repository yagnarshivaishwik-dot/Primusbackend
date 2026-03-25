using System;
using System.Windows;
using PrimusKiosk.Infrastructure;

namespace PrimusKiosk;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        try
        {
            LogBootstrapper.ConfigureLogging();
        }
        catch (Exception ex)
        {
            // Extremely early failure – show something to the user instead of silent exit.
            MessageBox.Show(
                "Primus Kiosk failed to initialize logging:\n\n" + ex.Message,
                "Primus Kiosk",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
        }

        base.OnStartup(e);
    }

    protected override void OnExit(ExitEventArgs e)
    {
        base.OnExit(e);
        Serilog.Log.CloseAndFlush();
    }
}


