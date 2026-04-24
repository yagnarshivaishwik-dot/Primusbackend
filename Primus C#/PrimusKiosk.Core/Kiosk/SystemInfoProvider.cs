using System.Management;
using System.Runtime.InteropServices;
using PrimusKiosk.Core.Abstractions;
using Serilog;

namespace PrimusKiosk.Core.Kiosk;

public sealed class SystemInfoProvider : ISystemInfoProvider
{
    public Task<SystemInfo> GetAsync(CancellationToken cancellationToken)
    {
        var info = new SystemInfo
        {
            Hostname = Environment.MachineName,
            OsVersion = Environment.OSVersion.ToString(),
            Architecture = RuntimeInformation.OSArchitecture.ToString(),
            ProcessorCount = Environment.ProcessorCount,
            TotalMemoryBytes = QueryTotalMemoryBytes(),
            UserName = Environment.UserName,
            DotNetVersion = Environment.Version.ToString(),
        };
        return Task.FromResult(info);
    }

    private static long QueryTotalMemoryBytes()
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
            Log.Debug(ex, "WMI total-memory query failed.");
        }
        return 0;
    }
}
