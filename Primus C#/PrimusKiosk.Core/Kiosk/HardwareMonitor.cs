using System.Diagnostics;
using System.Management;
using PrimusKiosk.Core.Abstractions;
using Serilog;

namespace PrimusKiosk.Core.Kiosk;

/// <summary>
/// Samples CPU / RAM / GPU / temperature via <see cref="PerformanceCounter"/> + WMI.
/// Counters are cached across invocations because the first NextValue() call always
/// returns zero; we warm them up in the constructor.
/// </summary>
public sealed class HardwareMonitor : IHardwareMonitor
{
    private readonly PerformanceCounter? _cpuCounter;
    private readonly PerformanceCounter? _ramAvailableCounter;
    private readonly long _totalRamBytes;
    private bool _disposed;

    public HardwareMonitor()
    {
        try
        {
            _cpuCounter = new PerformanceCounter("Processor", "% Processor Time", "_Total", readOnly: true);
            _cpuCounter.NextValue(); // warm-up
        }
        catch (Exception ex)
        {
            Log.Debug(ex, "CPU PerformanceCounter unavailable; CPU % will return 0.");
            _cpuCounter = null;
        }

        try
        {
            _ramAvailableCounter = new PerformanceCounter("Memory", "Available Bytes", readOnly: true);
            _ramAvailableCounter.NextValue();
        }
        catch (Exception ex)
        {
            Log.Debug(ex, "Memory PerformanceCounter unavailable; RAM % will return 0.");
            _ramAvailableCounter = null;
        }

        _totalRamBytes = QueryTotalRamBytes();
    }

    public Task<HardwareSnapshot> SampleAsync(CancellationToken cancellationToken)
    {
        return Task.Run(() =>
        {
            var cpu = 0.0;
            try { cpu = _cpuCounter?.NextValue() ?? 0.0; } catch { /* ignore */ }

            var available = 0L;
            try { available = (long)(_ramAvailableCounter?.NextValue() ?? 0f); } catch { /* ignore */ }

            var ramPercent = _totalRamBytes > 0
                ? Math.Round(100.0 * (1.0 - ((double)available / _totalRamBytes)), 1)
                : 0.0;

            return new HardwareSnapshot
            {
                CpuPercent = Math.Round(cpu, 1),
                RamPercent = ramPercent,
                TotalRamBytes = _totalRamBytes,
                AvailableRamBytes = available,
                GpuPercent = SampleGpuPercent(),
                CpuTemperatureCelsius = SampleCpuTemperature(),
            };
        }, cancellationToken);
    }

    // GPU counters are "GPU Engine\\% Utilization" summed across engines; we read
    // the largest value to approximate a single-number view of GPU load.
    private static double? SampleGpuPercent()
    {
        try
        {
            var category = new PerformanceCounterCategory("GPU Engine");
            var instances = category.GetInstanceNames();
            var peak = 0f;
            foreach (var instance in instances)
            {
                if (!instance.EndsWith("_3D", StringComparison.OrdinalIgnoreCase) &&
                    !instance.EndsWith("_Graphics", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                try
                {
                    using var counter = new PerformanceCounter("GPU Engine", "Utilization Percentage", instance, readOnly: true);
                    counter.NextValue();
                    System.Threading.Thread.Sleep(50);
                    var val = counter.NextValue();
                    if (val > peak) peak = val;
                }
                catch { /* ignore per-instance failures */ }
            }
            return Math.Round(peak, 1);
        }
        catch
        {
            return null;
        }
    }

    // CPU temperature via WMI MSAcpi_ThermalZoneTemperature (tenths of Kelvin).
    private static double? SampleCpuTemperature()
    {
        try
        {
            using var searcher = new ManagementObjectSearcher(
                @"root\WMI",
                "SELECT CurrentTemperature FROM MSAcpi_ThermalZoneTemperature");

            foreach (var raw in searcher.Get())
            {
                using var obj = (ManagementObject)raw;
                if (obj["CurrentTemperature"] is { } v && long.TryParse(v.ToString(), out var tenthsKelvin))
                {
                    var celsius = (tenthsKelvin / 10.0) - 273.15;
                    if (celsius > 0 && celsius < 150)
                    {
                        return Math.Round(celsius, 1);
                    }
                }
            }
        }
        catch
        {
            // MSAcpi_ThermalZoneTemperature requires admin + not all machines expose it.
        }
        return null;
    }

    private static long QueryTotalRamBytes()
    {
        try
        {
            using var searcher = new ManagementObjectSearcher("SELECT TotalPhysicalMemory FROM Win32_ComputerSystem");
            foreach (var raw in searcher.Get())
            {
                using var obj = (ManagementObject)raw;
                if (obj["TotalPhysicalMemory"] is { } v && long.TryParse(v.ToString(), out var bytes))
                {
                    return bytes;
                }
            }
        }
        catch (Exception ex)
        {
            Log.Debug(ex, "Total RAM WMI query failed.");
        }
        return 0;
    }

    public void Dispose()
    {
        if (_disposed) return;
        _cpuCounter?.Dispose();
        _ramAvailableCounter?.Dispose();
        _disposed = true;
    }
}
