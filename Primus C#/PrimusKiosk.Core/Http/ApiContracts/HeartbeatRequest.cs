namespace PrimusKiosk.Core.Http.ApiContracts;

public sealed record HeartbeatRequest
{
    public required string PcId { get; init; }
    public string Hostname { get; init; } = Environment.MachineName;
    public double CpuPercent { get; init; }
    public double RamPercent { get; init; }
    public double? GpuPercent { get; init; }
    public double? CpuTemperatureCelsius { get; init; }
    public long? AvailableRamBytes { get; init; }
    public long? TotalRamBytes { get; init; }
    public bool SessionActive { get; init; }
    public int? CurrentSessionId { get; init; }
    public int? RemainingTimeSeconds { get; init; }
    public double IdleSeconds { get; init; }
    public bool IsIdle { get; init; }
    public string Status { get; init; } = "online";
}

public sealed record HeartbeatResponse
{
    public int RemainingTimeSeconds { get; init; }
    public bool SessionActive { get; init; }
    public int PendingCommandCount { get; init; }
}
