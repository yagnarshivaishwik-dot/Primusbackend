using Serilog;
using Serilog.Events;

namespace PrimusKiosk.Core.Infrastructure;

/// <summary>
/// Configures Serilog once, before any host or service is constructed, so early-startup
/// failures are still captured in the log files.
/// </summary>
public static class LogBootstrapper
{
    public static void ConfigureLogging()
    {
        try
        {
            PrimusPaths.EnsureDirectories();

            var logPath = Path.Combine(PrimusPaths.LogsDirectory, "kiosk-.log");

            Log.Logger = new LoggerConfiguration()
                .MinimumLevel.Information()
                .MinimumLevel.Override("Microsoft", LogEventLevel.Warning)
                .MinimumLevel.Override("System.Net.Http.HttpClient", LogEventLevel.Warning)
                .Enrich.FromLogContext()
                .Enrich.WithEnvironmentUserName()
                .Enrich.WithEnvironmentName()
                .Enrich.WithMachineName()
                .Enrich.WithProcessId()
                .Enrich.WithThreadId()
                .WriteTo.Async(c => c.File(
                    logPath,
                    rollingInterval: RollingInterval.Day,
                    retainedFileCountLimit: 7,
                    outputTemplate:
                        "{Timestamp:yyyy-MM-dd HH:mm:ss.fff zzz} [{Level:u3}] ({MachineName}/{EnvironmentUserName}) {Message:lj}{NewLine}{Exception}"))
                .WriteTo.Console()
                .CreateLogger();
        }
        catch
        {
            ConfigureFallbackLogger();
        }
    }

    private static void ConfigureFallbackLogger()
    {
        try
        {
            var fallbackDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "PrimusKiosk", "logs");
            Directory.CreateDirectory(fallbackDir);

            Log.Logger = new LoggerConfiguration()
                .MinimumLevel.Information()
                .WriteTo.File(
                    Path.Combine(fallbackDir, "kiosk-.log"),
                    rollingInterval: RollingInterval.Day,
                    retainedFileCountLimit: 7)
                .CreateLogger();
        }
        catch
        {
            Log.Logger = new LoggerConfiguration().CreateLogger();
        }
    }

    public static void Flush()
    {
        Log.CloseAndFlush();
    }
}
