using System.Windows;
using System.Windows.Input;

namespace PrimusKiosk.App;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        PreviewKeyDown += OnPreviewKeyDown;
    }

    private void OnPreviewKeyDown(object sender, KeyEventArgs e)
    {
        // Soft-kiosk key suppression: the full LL keyboard hook lives in the native DLL (P8).
        // This catches the obvious escape paths at the focused window level.
        if (e.SystemKey == Key.F4 && (Keyboard.Modifiers & ModifierKeys.Alt) == ModifierKeys.Alt)
        {
            e.Handled = true;
            return;
        }

        if ((Keyboard.Modifiers & ModifierKeys.Alt) == ModifierKeys.Alt
            || (Keyboard.Modifiers & ModifierKeys.Windows) == ModifierKeys.Windows)
        {
            e.Handled = true;
        }
    }
}
