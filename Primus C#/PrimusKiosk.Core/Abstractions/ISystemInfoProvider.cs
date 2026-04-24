namespace PrimusKiosk.Core.Abstractions;

public interface ISystemInfoProvider
{
    Task<SystemInfo> GetAsync(CancellationToken cancellationToken);
}

public sealed record SystemInfo
{
    public string Hostname { get; init; } = string.Empty;
    public string OsVersion { get; init; } = string.Empty;
    public string Architecture { get; init; } = string.Empty;
    public int ProcessorCount { get; init; }
    public long TotalMemoryBytes { get; init; }
    public string UserName { get; init; } = string.Empty;
    public string DotNetVersion { get; init; } = string.Empty;
}
