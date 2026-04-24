namespace PrimusKiosk.Core.Abstractions;

public interface IHardwareMonitor : IDisposable
{
    Task<HardwareSnapshot> SampleAsync(CancellationToken cancellationToken);
}

public sealed record HardwareSnapshot
{
    public double CpuPercent { get; init; }
    public double RamPercent { get; init; }
    public double? GpuPercent { get; init; }
    public double? CpuTemperatureCelsius { get; init; }
    public long TotalRamBytes { get; init; }
    public long AvailableRamBytes { get; init; }
}
