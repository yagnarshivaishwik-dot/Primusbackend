using System;
using System.IO;
using Serilog;

namespace PrimusKiosk.Infrastructure;

public static class LogBootstrapper
{
    public static void ConfigureLogging()
    {
        try
        {
            var logDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                "PrimusKiosk", "logs");
            Directory.CreateDirectory(logDir);

            var logPath = Path.Combine(logDir, "kiosk-.log");

            Log.Logger = new LoggerConfiguration()
                .MinimumLevel.Information()
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
                .CreateLogger();
        }
        catch
        {
            // Fallback: log to user's local app data if ProgramData is not writable.
            try
            {
                var fallbackDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "PrimusKiosk", "logs");
                Directory.CreateDirectory(fallbackDir);

                var logPath = Path.Combine(fallbackDir, "kiosk-.log");

                Log.Logger = new LoggerConfiguration()
                    .MinimumLevel.Information()
                    .WriteTo.File(
                        logPath,
                        rollingInterval: RollingInterval.Day,
                        retainedFileCountLimit: 7)
                    .CreateLogger();
            }
            catch
            {
                // As a last resort, use a no-op logger to avoid crashing startup.
                Log.Logger = new LoggerConfiguration().CreateLogger();
            }
        }
    }
}


