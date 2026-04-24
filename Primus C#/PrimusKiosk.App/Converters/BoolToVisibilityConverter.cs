using System.Globalization;
using System.Windows;
using System.Windows.Data;

namespace PrimusKiosk.App.Converters;

public sealed class BoolToVisibilityConverter : IValueConverter
{
    public Visibility True { get; set; } = Visibility.Visible;
    public Visibility False { get; set; } = Visibility.Collapsed;

    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
        => value is bool b && b ? True : False;

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => value is Visibility v && v == True;
}
