using System.Diagnostics;
using Serilog;

namespace PrimusKiosk.Core.Infrastructure;

/// <summary>
/// Captures unhandled exceptions, writes a minimal crash report (metadata + log tail + stack)
/// to <c>%ProgramData%\PrimusKiosk\crashes\</c>, and optionally ships it to the backend later.
/// </summary>
public static class CrashReporter
{
    public static void WriteReport(Exception exception, string source)
    {
        try
        {
            PrimusPaths.EnsureDirectories();

            var timestamp = DateTime.UtcNow.ToString("yyyyMMdd-HHmmss-fff");
            var crashPath = Path.Combine(PrimusPaths.CrashDirectory, $"crash-{timestamp}.txt");

            var process = Process.GetCurrentProcess();
            var metadata =
                $"""
                === Primus Kiosk crash report ===
                Timestamp (UTC): {DateTime.UtcNow:O}
                Source: {source}
                Process: {process.ProcessName} (PID {process.Id})
                Machine: {Environment.MachineName}
                User: {Environment.UserName}
                OS: {Environment.OSVersion}
                CLR: {Environment.Version}
                Working set: {process.WorkingSet64 / 1024 / 1024} MB
                Exception type: {exception.GetType().FullName}
                Exception message: {exception.Message}

                Stack trace:
                {exception}
                """;

            File.WriteAllText(crashPath, metadata);

            Log.Fatal(exception, "Unhandled exception in {Source}. Crash report written to {Path}.", source, crashPath);
        }
        catch (Exception ex)
        {
            // Best-effort only; never throw from the crash reporter.
            Log.Warning(ex, "CrashReporter failed to write report for {Source}", source);
        }
    }
}
