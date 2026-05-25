using System.IO;
using System.Runtime.InteropServices;
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
    // Windows power-management flags for SetThreadExecutionState. Used to
    // keep the kiosk awake — see OnLoaded.
    [Flags]
    private enum ExecutionState : uint
    {
        Continuous      = 0x80000000,
        DisplayRequired = 0x00000002,
        SystemRequired  = 0x00000001,
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern ExecutionState SetThreadExecutionState(ExecutionState esFlags);

    // Sliding-window of navigation-retry timestamps. The auto-recovery
    // handler caps itself at MaxRetriesPerWindow retries within
    // RetryWindow, so a genuinely-broken state (bad URL, missing web/
    // folder, persistent network outage) doesn't pin the CPU.
    private readonly Queue<DateTime> _recentNavRetries = new();
    // Modest bump from 3 to 5 (defence-in-depth). The root cause of the
    // back-to-back ConnectionAborted retries that hit the original cap
    // is fixed at a different layer below (Chromium renderer-keepalive
    // flags in AdditionalBrowserArguments) — Windows + Chromium were
    // freezing the WebView2 renderer when the kiosk lost focus on dev
    // workstations. With the renderer no longer suspending, transport
    // failures should be rare enough that 5/min is plenty headroom; the
    // cap exists only to prevent infinite loops on a genuinely-broken
    // state (bad URL, missing web/ folder, persistent outage), and
    // anything that fails 5 times in 60 s legitimately deserves to stop.
    private const int MaxRetriesPerWindow = 5;
    private static readonly TimeSpan RetryWindow = TimeSpan.FromMinutes(1);
    private const string HomeNavUrl = "https://kiosk.primustech.in/index.html";

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
            // https://kiosk.primustech.in/ and calls https://api.primustech.in/* via Axios.
            //
            // Origin choice: Google OAuth's Cloud Console rejects ".local" AND
            // "*.localhost" subdomains as authorized JavaScript origins — it
            // requires a publicly registered TLD. We use a subdomain of our
            // own brand domain (primustech.in) which Google accepts. The
            // subdomain doesn't have to actually resolve in public DNS:
            // SetVirtualHostNameToFolderMapping below intercepts requests to
            // kiosk.primustech.in inside this WebView2 instance only and
            // serves them from the local web/ folder. WebView2 treats it as
            // a first-party HTTPS origin, so fetch / WebSocket / SubtleCrypto
            // / GSI button all behave as if it were a real production page.
            //
            // Because kiosk.primustech.in and api.primustech.in are different
            // origins, the embedded Chromium would normally block every
            // XHR/fetch with a CORS preflight failure (Axios reports this as
            // "Network Error"). --disable-web-security removes that
            // restriction for the embedded browser only — it has zero effect
            // on the C# HTTP pipeline and is standard practice for locked-down
            // kiosk WebView2 deployments.
            var options = new CoreWebView2EnvironmentOptions
            {
                // The three --disable-*backgrounding flags below are the
                // standard kiosk-mode Chromium incantation. Without them,
                // Chromium itself freezes the WebView2 renderer process
                // whenever the host window loses focus (alt-tab to another
                // app on a dev workstation, RDP-disconnect, etc.). When
                // the renderer is frozen, the host's connection to it
                // dies; the very next navigation request hits
                // ConnectionAborted and the customer sees ERR_FILE_NOT_FOUND.
                //
                // SetThreadExecutionState (the kiosk-keepawake call below
                // in OnLoaded) blocks the OS-level display + system sleep
                // but does NOT prevent Chromium's own per-renderer
                // suspension policy — that's a separate layer. These
                // flags address the Chromium layer directly:
                //
                //   --disable-backgrounding-occluded-windows
                //     Don't suspend renderers when the host window is
                //     occluded / minimised / off-screen.
                //   --disable-renderer-backgrounding
                //     Don't throttle CPU/GPU work for background renderers.
                //   --disable-background-timer-throttling
                //     Don't throttle setInterval/setTimeout (1Hz default
                //     in background) — the React app's heartbeat-driven
                //     polls depend on accurate timer intervals.
                //
                // On a production cafe kiosk none of this matters — the
                // app is fullscreen, locked-down, never loses focus. But
                // on dev / remote-managed installs the flags are what
                // keep the renderer alive between alt-tabs.
                AdditionalBrowserArguments =
                    "--disable-web-security " +
                    "--allow-running-insecure-content " +
                    "--disable-features=IsolateOrigins,site-per-process " +
                    "--disable-backgrounding-occluded-windows " +
                    "--disable-renderer-backgrounding " +
                    "--disable-background-timer-throttling",
            };

            var env = await CoreWebView2Environment.CreateAsync(
                browserExecutableFolder: null,
                userDataFolder: userDataFolder,
                options: options);

            await WebView.EnsureCoreWebView2Async(env);

            // Tell Windows to keep this process AND the display awake until
            // the kiosk exits. ES_CONTINUOUS means the flags persist for the
            // life of the thread. Without this, after ~15-30 min of idle,
            // Windows' power manager can:
            //   * Turn off the monitor (customer sees a black screen, recovers
            //     on mouse move — annoying but not fatal).
            //   * Suspend background tabs / renderer processes (WebView2's
            //     renderer is one). On wake, the renderer's IPC pipe is gone
            //     and the next navigation raises ConnectionAborted, which
            //     surfaces as the "File not found" page customers were seeing.
            // The kiosk is a single-purpose appliance; aggressive power
            // saving is the wrong tradeoff here. See also kiosk-*.log entries
            // "WebView2 navigation failed: ConnectionAborted" from 2026-05-22.
            SetThreadExecutionState(
                ExecutionState.Continuous |
                ExecutionState.DisplayRequired |
                ExecutionState.SystemRequired);

            var core = WebView.CoreWebView2;

            // Lock down the embedded chrome for kiosk use.
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.IsZoomControlEnabled = false;
            core.Settings.AreBrowserAcceleratorKeysEnabled = false;
            core.Settings.IsPasswordAutosaveEnabled = false;
            core.Settings.IsGeneralAutofillEnabled = false;

            // Serve the React build as https://kiosk.primustech.in/ — WebView2 treats
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
                "kiosk.primustech.in",
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
                    return;
                }

                Log.Warning("WebView2 navigation failed: {Status}", args.WebErrorStatus);

                // Only auto-retry transport-level failures. A genuine
                // 404 / forbidden / cert error indicates a config bug
                // and bouncing them would mask the real problem.
                //
                // Statuses below are the ones we've actually observed in
                // the kiosk-*.log after Windows suspended the renderer
                // process on idle (ConnectionAborted) plus the closely-
                // related transport-failure family. Anything outside
                // this set falls through to the warn log only.
                var recoverable = args.WebErrorStatus is
                    CoreWebView2WebErrorStatus.ConnectionAborted or
                    CoreWebView2WebErrorStatus.ConnectionReset or
                    CoreWebView2WebErrorStatus.Disconnected or
                    CoreWebView2WebErrorStatus.HostNameNotResolved or
                    CoreWebView2WebErrorStatus.OperationCanceled or
                    CoreWebView2WebErrorStatus.Timeout or
                    CoreWebView2WebErrorStatus.Unknown;

                if (!recoverable)
                {
                    return;
                }

                // Sliding 60-second window with at most 3 retries — so a
                // genuinely-broken state (bad URL, missing web/ folder,
                // persistent network outage) doesn't spin the CPU
                // forever. After the cap is hit we log error and stop;
                // the customer / operator can recover by manually
                // restarting the kiosk app.
                var now = DateTime.UtcNow;
                int retryNumber;
                lock (_recentNavRetries)
                {
                    while (_recentNavRetries.Count > 0 &&
                           now - _recentNavRetries.Peek() > RetryWindow)
                    {
                        _recentNavRetries.Dequeue();
                    }
                    if (_recentNavRetries.Count >= MaxRetriesPerWindow)
                    {
                        Log.Error(
                            "WebView2 navigation failed {Count} times in the last {Window}. " +
                            "Giving up on auto-recovery; restart the kiosk app to retry.",
                            _recentNavRetries.Count, RetryWindow);
                        return;
                    }
                    _recentNavRetries.Enqueue(now);
                    retryNumber = _recentNavRetries.Count;
                }

                Log.Information(
                    "WebView2 auto-recovery: re-navigating to {Url} (retry {N}/{Max} in current window).",
                    HomeNavUrl, retryNumber, MaxRetriesPerWindow);
                Dispatcher.InvokeAsync(() =>
                {
                    try
                    {
                        core.Navigate(HomeNavUrl);
                    }
                    catch (Exception navEx)
                    {
                        Log.Warning(navEx, "WebView2 auto-recovery navigation threw.");
                    }
                });
            };

            core.Navigate(HomeNavUrl);
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
