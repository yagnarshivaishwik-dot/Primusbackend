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
    // Nullable because the backend returns `null` when there's no active
    // PCSession for this kiosk (e.g. between sign-out and sign-in, or
    // during the post-payment-pre-session window). Previously typed as
    // non-nullable int, which crashed System.Text.Json with
    //   JsonException: Cannot get the value of a token type 'Null' as a number.
    //   Path: $.remaining_time_seconds
    // every ~20s for every kiosk without an active session — silently
    // breaking the heartbeat-driven paywall handshake. Matches the
    // request-side declaration at line 15.
    public int? RemainingTimeSeconds { get; init; }
    public bool SessionActive { get; init; }
    public int PendingCommandCount { get; init; }
}
