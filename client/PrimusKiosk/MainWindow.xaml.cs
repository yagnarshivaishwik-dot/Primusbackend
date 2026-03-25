using System;
using System.Windows;
using System.Windows.Input;
using PrimusKiosk.Services;
using PrimusKiosk.ViewModels;
using PrimusKiosk.Views;

namespace PrimusKiosk;

public partial class MainWindow : Window
{
    private readonly NavigationService _navigation;

    public MainWindow()
    {
        InitializeComponent();

        _navigation = new NavigationService(RootContent);

        Loaded += OnLoaded;
        PreviewKeyDown += OnPreviewKeyDown;
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        try
        {
            var appState = new AppStateService();
            var backend = new BackendClient(appState);
            var realtime = new RealtimeClient(appState);
            var queue = new OfflineQueueService(appState, backend);
            var commandHandler = new CommandHandler(appState, backend, realtime, queue, ShowLockOverlay, HideLockOverlay);

            appState.Initialize(backend, realtime, queue, commandHandler);

            var loginVm = new LoginViewModel(appState, backend);
            var loginView = new LoginView { DataContext = loginVm };

            loginVm.LoginSucceeded += async (_, _) =>
            {
                var sessionVm = new SessionViewModel(appState, backend, realtime, queue, commandHandler);
                await sessionVm.InitializeAsync();
                var sessionView = new SessionView { DataContext = sessionVm };
                _navigation.Navigate(sessionView);
            };

            _navigation.Navigate(loginView);

            await appState.InitializeAsync();
        }
        catch (Exception ex)
        {
            Serilog.Log.Fatal(ex, "Fatal error during kiosk startup");
            MessageBox.Show(
                "Primus Kiosk failed to start:\n\n" + ex.Message,
                "Primus Kiosk",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
            Application.Current.Shutdown();
        }
    }

    private void OnPreviewKeyDown(object sender, KeyEventArgs e)
    {
        // Basic kiosk key suppression; full lockdown is completed via GPO/Assigned Access
        if (e.SystemKey == Key.F4 && (Keyboard.Modifiers & ModifierKeys.Alt) == ModifierKeys.Alt)
        {
            e.Handled = true;
        }

        if ((Keyboard.Modifiers & ModifierKeys.Alt) == ModifierKeys.Alt ||
            (Keyboard.Modifiers & ModifierKeys.Windows) == ModifierKeys.Windows)
        {
            e.Handled = true;
        }
    }

    private void ShowLockOverlay(string? message)
    {
        Dispatcher.Invoke(() =>
        {
            LockOverlay.Visibility = Visibility.Visible;
            LockMessage.Text = string.IsNullOrWhiteSpace(message)
                ? "Please contact staff to unlock."
                : message;
        });
    }

    private void HideLockOverlay()
    {
        Dispatcher.Invoke(() =>
        {
            LockOverlay.Visibility = Visibility.Collapsed;
        });
    }
}


