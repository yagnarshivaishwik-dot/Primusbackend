using System.IO;
using System.Windows;
using Microsoft.Web.WebView2.Core;
using PrimusKiosk.App.WebHost.Bridge;
using Serilog;

namespace PrimusKiosk.App.WebHost;

/// <summary>
/// Fullscreen native window hosting the existing <c>/PrimusClient</c> React UI inside
/// a WebView2 control. The JS bridge (<see cref="JsBridge"/>) forwards every
/// <c>invoke(...)</c> call from the React code to the corresponding C# service, and
/// pushes realtime events (commands, chat, announcements) back to the UI via
/// <c>window.chrome.webview.postMessage(...)</c> handlers.
/// </summary>
public partial class WebHostWindow : Window
{
    private readonly JsBridge _bridge;
    private readonly string _webRoot;
    private bool _bridgeAttached;

    public WebHostWindow(JsBridge bridge, string webRoot)
    {
        InitializeComponent();
        _bridge = bridge;
        _webRoot = webRoot;
        Loaded += OnLoaded;
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        try
        {
            var userDataFolder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                "Primus", "webview2");
            Directory.CreateDirectory(userDataFolder);

            // For kiosk deployment the React UI is served from the virtual host
            // https://primus.localhost/ and calls https://api.primustech.in/* via Axios.
            // We use *.localhost (not *.local) because Google OAuth's Cloud Console
            // refuses to add a `.local` origin to a client's authorized JS origins
            // list — it requires a publicly resolvable TLD. RFC 6761 reserves
            // *.localhost for loopback, and Google explicitly accepts any
            // *.localhost subdomain as a valid origin without DNS verification.
            //
            // Because primus.localhost and api.primustech.in are different origins,
            // the embedded Chromium would normally block every XHR/fetch with a
            // CORS preflight failure (Axios reports this as "Network Error").
            // --disable-web-security removes that restriction for the embedded
            // browser only — it has zero effect on the C# HTTP pipeline and is
            // a standard practice for locked-down kiosk WebView2 deployments.
            var options = new CoreWebView2EnvironmentOptions
            {
                AdditionalBrowserArguments =
                    "--disable-web-security " +
                    "--allow-running-insecure-content " +
                    "--disable-features=IsolateOrigins,site-per-process",
            };

            var env = await CoreWebView2Environment.CreateAsync(
                browserExecutableFolder: null,
                userDataFolder: userDataFolder,
                options: options);

            await WebView.EnsureCoreWebView2Async(env);

            var core = WebView.CoreWebView2;

            // Lock down the embedded chrome for kiosk use.
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.IsZoomControlEnabled = false;
            core.Settings.AreBrowserAcceleratorKeysEnabled = false;
            core.Settings.IsPasswordAutosaveEnabled = false;
            core.Settings.IsGeneralAutofillEnabled = false;

            // Serve the React build as https://primus.localhost/ — WebView2 treats
            // this as a first-party HTTPS origin so fetch / WebSocket / crypto
            // APIs all work, AND Google OAuth accepts it as an authorized
            // JavaScript origin (which https://primus.local was rejected for).
            if (!Directory.Exists(_webRoot))
            {
                Log.Warning("Web root not found at {Path}; WebView2 will navigate to about:blank.", _webRoot);
                SplashMessage.Text = $"React UI missing at {_webRoot}";
                return;
            }

            core.SetVirtualHostNameToFolderMapping(
                "primus.localhost",
                _webRoot,
                CoreWebView2HostResourceAccessKind.Allow);

            // Inject the Tauri-compatible invoke shim before any page script runs.
            await core.AddScriptToExecuteOnDocumentCreatedAsync(JsBridge.InvokeShim);

            // Wire the bridge now that CoreWebView2 is live.
            _bridge.Attach(core);
            _bridgeAttached = true;

            core.NavigationCompleted += (_, args) =>
            {
                if (args.IsSuccess)
                {
                    Log.Information("WebView2 navigation completed successfully.");
                    Dispatcher.Invoke(() => Splash.Visibility = Visibility.Collapsed);
                }
                else
                {
                    Log.Warning("WebView2 navigation failed: {Status}", args.WebErrorStatus);
                }
            };

            core.Navigate("https://primus.localhost/index.html");
        }
        catch (Exception ex)
        {
            Log.Fatal(ex, "WebView2 host failed to initialize.");
            SplashMessage.Text = "WebView2 failed to initialize. Check the log for details.";
        }
    }

    protected override void OnClosed(EventArgs e)
    {
        if (_bridgeAttached)
        {
            _bridge.Detach();
        }
        base.OnClosed(e);
    }
}
