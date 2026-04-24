using System.Globalization;
using System.Windows;
using System.Windows.Data;
using System.Windows.Media;
using PrimusKiosk.Core.Abstractions;

namespace PrimusKiosk.App.Converters;

public sealed class ConnectionStateToBrushConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        var color = value switch
        {
            RealtimeConnectionState.Connected => Color.FromRgb(16, 185, 129),
            RealtimeConnectionState.Connecting => Color.FromRgb(245, 158, 11),
            RealtimeConnectionState.Reconnecting => Color.FromRgb(245, 158, 11),
            _ => Color.FromRgb(244, 63, 94),
        };
        return new SolidColorBrush(color);
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => DependencyProperty.UnsetValue;
}

public sealed class ConnectionStateToTextConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        return value switch
        {
            RealtimeConnectionState.Connected => "Online",
            RealtimeConnectionState.Connecting => "Connecting...",
            RealtimeConnectionState.Reconnecting => "Reconnecting...",
            RealtimeConnectionState.Failed => "Offline",
            _ => "Offline",
        };
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => DependencyProperty.UnsetValue;
}
