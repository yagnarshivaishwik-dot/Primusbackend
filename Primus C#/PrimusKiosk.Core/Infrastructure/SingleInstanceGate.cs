using System.Threading;

namespace PrimusKiosk.Core.Infrastructure;

/// <summary>
/// Enforces single-instance semantics via a named <see cref="Mutex"/>. The mutex is
/// held for the lifetime of the process; the second instance observes the existing
/// mutex and exits silently.
/// </summary>
public sealed class SingleInstanceGate : IDisposable
{
    private const string MutexName = @"Global\PrimusKiosk.SingleInstance.{8B6E5E80-3F11-4E6D-9C2B-4F9C0A9B1AF3}";

    private readonly Mutex _mutex;
    private readonly bool _owned;

    public SingleInstanceGate()
    {
        _mutex = new Mutex(initiallyOwned: true, MutexName, out _owned);
    }

    public bool IsFirstInstance => _owned;

    public void Dispose()
    {
        if (_owned)
        {
            try
            {
                _mutex.ReleaseMutex();
            }
            catch (ApplicationException)
            {
                // Thread did not own the mutex; ignore.
            }
        }

        _mutex.Dispose();
    }
}
