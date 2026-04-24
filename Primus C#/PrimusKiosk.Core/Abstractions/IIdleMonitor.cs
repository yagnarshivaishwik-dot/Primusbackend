namespace PrimusKiosk.Core.Abstractions;

public interface IIdleMonitor
{
    /// <summary>Seconds since the last keyboard or mouse input on the current session.</summary>
    TimeSpan GetIdleDuration();

    /// <summary>Returns true when <see cref="GetIdleDuration"/> exceeds <paramref name="threshold"/>.</summary>
    bool IsIdle(TimeSpan threshold);
}
