using System.IO;
using System.Windows;
using System.Windows.Threading;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using PrimusKiosk.App.Services;
using PrimusKiosk.App.ViewModels;
using PrimusKiosk.App.WebHost;
using PrimusKiosk.App.WebHost.Bridge;
using PrimusKiosk.Core.Abstractions;
using PrimusKiosk.Core.Infrastructure;
using PrimusKiosk.Core.State;
using Serilog;

namespace PrimusKiosk.App;

/// <summary>
/// WPF application entry. Creates the Generic Host, registers Core + App services,
/// wires global exception handlers, enforces single-instance, and shows the main window.
/// </summary>
public partial class PrimusApplication : Application
{
    private IHost? _host;
    private SingleInstanceGate? _gate;

    public IServiceProvider Services => _host?.Services
        ?? throw new InvalidOperationException("Host not initialized yet.");

    public static PrimusApplication Instance => (PrimusApplication)Application.Current;

    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        LogBootstrapper.ConfigureLogging();
        Log.Information("Primus Kiosk starting up (args: {Args})", string.Join(' ', e.Args));

        _gate = new SingleInstanceGate();
        if (!_gate.IsFirstInstance)
        {
            Log.Information("Another instance of Primus Kiosk is already running; exiting.");
            Shutdown();
            return;
        }

        DispatcherUnhandledException += OnDispatcherUnhandledException;
        AppDomain.CurrentDomain.UnhandledException += OnAppDomainUnhandledException;
        TaskScheduler.UnobservedTaskException += OnUnobservedTaskException;

        try
        {
            _host = BuildHost();
            await _host.StartAsync().ConfigureAwait(false);

            // Resolve the JS bridge (singleton) and the React web-root path.
            var bridge   = Services.GetRequiredService<JsBridge>();
            var webRoot  = ResolveWebRoot();

            var webWindow = new WebHostWindow(bridge, webRoot);
            webWindow.Closing += (_, _) => bridge.Dispose();
            MainWindow = webWindow;
            webWindow.Show();
        }
        catch (Exception ex)
        {
            CrashReporter.WriteReport(ex, "App.OnStartup");
            MessageBox.Show(
                $"Primus Kiosk failed to start:\n\n{ex.Message}",
                "Primus Kiosk",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
            Shutdown(1);
        }
    }

    protected override async void OnExit(ExitEventArgs e)
    {
        try
        {
            if (_host is not null)
            {
                await _host.StopAsync(TimeSpan.FromSeconds(5)).ConfigureAwait(false);
                _host.Dispose();
            }
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Error while stopping host on exit.");
        }
        finally
        {
            _gate?.Dispose();
            LogBootstrapper.Flush();
            base.OnExit(e);
        }
    }

    /// <summary>
    /// Finds the React build output (<c>index.html</c> present) by probing several
    /// candidate locations so the app works both from the developer repo and from an
    /// installed Inno Setup layout under <c>%ProgramFiles%\Primus\</c>.
    /// </summary>
    private static string ResolveWebRoot()
    {
        var candidates = new[]
        {
            // Installed layout: .\web\ next to the exe
            Path.Combine(AppContext.BaseDirectory, "web"),
            // Developer layout: Primus C#/web/ (build-installer.ps1 stages dist here)
            Path.Combine(AppContext.BaseDirectory, "..", "web"),
            // Common install path
            Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                "Primus", "web"),
            // Repo root: PrimusClient/dist/ (npm run build output)
            Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..",
                "PrimusClient", "dist")),
        };

        foreach (var path in candidates)
        {
            var normalized = Path.GetFullPath(path);
            if (Directory.Exists(normalized) &&
                File.Exists(Path.Combine(normalized, "index.html")))
            {
                Log.Information("WebView2 web root resolved to: {Path}", normalized);
                return normalized;
            }
        }

        // Return the primary candidate even if missing; WebHostWindow logs a warning.
        var fallback = Path.GetFullPath(candidates[0]);
        Log.Warning("React web root not found; defaulting to {Path}. " +
                    "Run 'npm run build' in PrimusClient/ and copy dist/ to the web/ folder.", fallback);
        return fallback;
    }

    private static IHost BuildHost()
    {
        var environment = Environment.GetEnvironmentVariable("PRIMUS_ENV")
                          ?? Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT")
                          ?? "Production";

        var builder = Host.CreateApplicationBuilder();

        builder.Environment.EnvironmentName = environment;

        builder.Configuration
            .SetBasePath(AppContext.BaseDirectory);

        builder.Configuration.Sources.Clear();
        builder.Configuration.AddPrimusLayeredConfiguration(environment);

        builder.Services.AddPrimusCore(builder.Configuration);
        builder.Services.AddPrimusAppServices();

        builder.Logging.ClearProviders();
        builder.Services.AddSerilog();

        return builder.Build();
    }

    private void OnDispatcherUnhandledException(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        CrashReporter.WriteReport(e.Exception, "DispatcherUnhandled");
        // Keep the app alive for kiosk continuity; the watchdog restarts us if we truly die.
        e.Handled = true;
    }

    private void OnAppDomainUnhandledException(object sender, UnhandledExceptionEventArgs e)
    {
        if (e.ExceptionObject is Exception ex)
        {
            CrashReporter.WriteReport(ex, $"AppDomainUnhandled (terminating: {e.IsTerminating})");
        }
    }

    private void OnUnobservedTaskException(object? sender, UnobservedTaskExceptionEventArgs e)
    {
        CrashReporter.WriteReport(e.Exception, "UnobservedTaskException");
        e.SetObserved();
    }
}
