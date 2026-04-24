using System.IO;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Web.WebView2.Core;
using Microsoft.Win32;
using PrimusKiosk.Core.Abstractions;
using PrimusKiosk.Core.Games;
using PrimusKiosk.Core.Http.ApiContracts;
using PrimusKiosk.Core.Models;
using PrimusKiosk.Core.Realtime;
using PrimusKiosk.Core.State;
using Serilog;

namespace PrimusKiosk.App.WebHost.Bridge;

/// <summary>
/// Two-way message bridge between the React UI running inside WebView2 and the C# service layer.
///
/// JS side:   window.__TAURI__.invoke(cmd, args) → Promise
///            window.__TAURI__.event.listen(name, handler) → Promise(unlisten)
///
/// C# side:   receives a JSON envelope  { id, cmd, args } from WebMessageReceived,
///            dispatches to the matching service method, responds with { id, ok, data/error }.
///            Realtime events from IPrimusRealtimeClient are forwarded as
///            { __tauri_event, payload } messages that the shim delivers to listen() callbacks.
/// </summary>
public sealed class JsBridge : IDisposable
{
    private readonly IServiceProvider _sp;
    private readonly IPrimusRealtimeClient _realtime;
    private readonly ILockOverlayController _lockOverlay;

    private CoreWebView2? _core;

    // Shared JSON options — camelCase on the wire to match React expectations.
    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = false,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
    };

    // -----------------------------------------------------------------------
    // Construction / DI
    // -----------------------------------------------------------------------

    public JsBridge(
        IServiceProvider sp,
        IPrimusRealtimeClient realtime,
        ILockOverlayController lockOverlay)
    {
        _sp = sp;
        _realtime = realtime;
        _lockOverlay = lockOverlay;

        _realtime.ChatMessageReceived    += OnChatMessage;
        _realtime.NotificationReceived   += OnNotification;
        _realtime.WalletUpdated          += OnWalletUpdated;
        _realtime.RemainingTimeUpdated   += OnRemainingTimeUpdated;
        _realtime.ConnectionStateChanged += OnConnectionStateChanged;
        _lockOverlay.StateChanged        += OnLockStateChanged;
    }

    // -----------------------------------------------------------------------
    // Attach / Detach
    // -----------------------------------------------------------------------

    public void Attach(CoreWebView2 core)
    {
        _core = core;
        _core.WebMessageReceived += OnWebMessageReceived;
        Log.Debug("JsBridge attached to CoreWebView2.");
    }

    public void Detach()
    {
        if (_core is not null)
        {
            _core.WebMessageReceived -= OnWebMessageReceived;
            _core = null;
        }
    }

    // -----------------------------------------------------------------------
    // JS shim — injected before ANY page script via AddScriptToExecuteOnDocumentCreatedAsync.
    // Installs window.__TAURI__ with invoke + event.listen + event.emit + event.once.
    // -----------------------------------------------------------------------

    public static readonly string InvokeShim = """
        (function () {
            'use strict';

            // pending invoke promises keyed by correlation id
            var _pending = {};
            // event listener map:  eventName → [handler, ...]
            var _listeners = {};

            function _uuid() {
                return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                    var r = Math.random() * 16 | 0;
                    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
                });
            }

            // Central listener for all messages from C#
            window.chrome.webview.addEventListener('message', function (ev) {
                var msg;
                try { msg = JSON.parse(ev.data); } catch (_) { return; }

                // ---- Response to an invoke call ----
                if (msg && msg.id && _pending[msg.id]) {
                    var handlers = _pending[msg.id];
                    delete _pending[msg.id];
                    if (msg.ok) {
                        handlers.resolve(msg.data !== undefined ? msg.data : null);
                    } else {
                        handlers.reject(new Error(msg.error || 'Command failed'));
                    }
                    return;
                }

                // ---- Realtime event pushed from C# ----
                if (msg && msg.__tauri_event) {
                    var name = msg.__tauri_event;
                    var handlers = _listeners[name];
                    if (handlers) {
                        handlers.slice().forEach(function (fn) {
                            try { fn({ event: name, payload: msg.payload }); } catch (_) {}
                        });
                    }
                }
            });

            // ---- window.__TAURI__ surface ----
            window.__TAURI__ = {

                invoke: function (cmd, args) {
                    return new Promise(function (resolve, reject) {
                        var id = _uuid();
                        _pending[id] = { resolve: resolve, reject: reject };

                        // Safety timeout: clean up if C# never responds
                        setTimeout(function () {
                            if (_pending[id]) {
                                delete _pending[id];
                                reject(new Error('Invoke timed out: ' + cmd));
                            }
                        }, 30000);

                        window.chrome.webview.postMessage(
                            JSON.stringify({ id: id, cmd: cmd, args: args || {} })
                        );
                    });
                },

                event: {
                    listen: function (eventName, handler) {
                        if (!_listeners[eventName]) { _listeners[eventName] = []; }
                        _listeners[eventName].push(handler);
                        return Promise.resolve(function () {
                            var list = _listeners[eventName];
                            if (list) {
                                var idx = list.indexOf(handler);
                                if (idx >= 0) { list.splice(idx, 1); }
                            }
                        });
                    },

                    once: function (eventName, handler) {
                        var unlisten;
                        var wrapped = function (ev) {
                            handler(ev);
                            if (typeof unlisten === 'function') { unlisten(); }
                        };
                        return window.__TAURI__.event.listen(eventName, wrapped).then(function (fn) {
                            unlisten = fn;
                            return fn;
                        });
                    },

                    emit: function (eventName, payload) {
                        window.chrome.webview.postMessage(
                            JSON.stringify({ id: '__emit_' + _uuid(), cmd: '__emit', args: { event: eventName, payload: payload } })
                        );
                        return Promise.resolve();
                    }
                },

                app: {
                    getVersion: function () { return Promise.resolve('1.0.0'); },
                    getName:    function () { return Promise.resolve('Primus Kiosk'); }
                },

                window: {
                    getCurrent: function () {
                        return {
                            setFullscreen: function (v) { return Promise.resolve(); },
                            maximize:      function ()  { return Promise.resolve(); }
                        };
                    }
                }
            };

            // -----------------------------------------------------------------------
            // Tauri v1 compatibility layer
            //
            // @tauri-apps/api v1.5.x uses two mechanisms that the real Tauri runtime
            // provides but our WebView2 host does not:
            //
            //   1. window.__TAURI__.transformCallback(fn, once)
            //      Registers a one-shot callback as window['_<id>'] and returns the
            //      numeric id. Tauri's invoke() uses this to create resolve/reject
            //      handlers, then passes the ids to the native side which calls them.
            //
            //   2. window.__TAURI_IPC__({ cmd, callback, error, ...args })
            //      The entry point that Tauri's invoke() uses to actually send the
            //      command. The native side is expected to call window['_<callback>']
            //      (or window['_<error>']) when the result is ready.
            //
            // We implement both by routing IPC through window.__TAURI__.invoke (our
            // own bridge) and firing the registered callbacks on completion.
            // -----------------------------------------------------------------------

            // 1. transformCallback — mirrors the real Tauri implementation.
            window.__TAURI__.transformCallback = function (callback, once) {
                var id = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
                var prop = '_' + id;
                Object.defineProperty(window, prop, {
                    value: function (result) {
                        if (once) { Reflect.deleteProperty(window, prop); }
                        return callback && callback(result);
                    },
                    writable: false,
                    configurable: true
                });
                return id;
            };

            // 2. __TAURI_IPC__ — routes to our invoke bridge and fires the callbacks.
            window.__TAURI_IPC__ = function (msg) {
                if (!msg || !msg.cmd) return;
                var callbackId = msg.callback;
                var errorId    = msg.error;
                // Build a clean args object — strip Tauri meta-fields.
                var args = {};
                for (var key in msg) {
                    if (Object.prototype.hasOwnProperty.call(msg, key)
                            && key !== 'cmd' && key !== 'callback' && key !== 'error') {
                        args[key] = msg[key];
                    }
                }
                window.__TAURI__.invoke(msg.cmd, args).then(
                    function (result) {
                        var cb = window['_' + callbackId];
                        if (typeof cb === 'function') { cb(result); }
                    },
                    function (err) {
                        var ecb = window['_' + errorId];
                        if (typeof ecb === 'function') {
                            ecb(err instanceof Error ? err.message : String(err));
                        }
                    }
                );
            };

            console.log('[PrimusKiosk] Tauri compat shim installed (transformCallback + IPC bridge active).');
        })();
        """;

    // -----------------------------------------------------------------------
    // Incoming message handler (WebMessageReceived)
    // -----------------------------------------------------------------------

    private async void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        string raw;
        try
        {
            raw = e.TryGetWebMessageAsString();
        }
        catch
        {
            return;
        }

        if (string.IsNullOrEmpty(raw))
        {
            return;
        }

        string id = string.Empty;
        try
        {
            var node = JsonNode.Parse(raw);
            if (node is not JsonObject obj) return;

            id  = obj["id"]?.GetValue<string>()  ?? string.Empty;
            var cmd  = obj["cmd"]?.GetValue<string>() ?? string.Empty;
            var args = (obj["args"] as JsonObject) ?? [];

            if (string.IsNullOrEmpty(id) || string.IsNullOrEmpty(cmd))
            {
                return;
            }

            Log.Debug("JsBridge ← {Cmd}", cmd);
            await DispatchAsync(id, cmd, args).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "JsBridge failed processing message from WebView.");
            if (!string.IsNullOrEmpty(id))
            {
                Respond(id, ok: false, data: null, error: ex.Message);
            }
        }
    }

    // -----------------------------------------------------------------------
    // Command dispatcher
    // -----------------------------------------------------------------------

    private async Task DispatchAsync(string id, string cmd, JsonObject args)
    {
        try
        {
            object? result = cmd switch
            {
                // Device credentials
                "get_device_credentials"      => await GetDeviceCredentials(args).ConfigureAwait(false),
                "save_device_credentials"     => await SaveDeviceCredentials(args).ConfigureAwait(false),
                "reset_device_credentials"    => await ResetDeviceCredentials(args).ConfigureAwait(false),
                "register_pc_with_backend"    => await RegisterPcWithBackend(args).ConfigureAwait(false),

                // Hardware fingerprint — used by the React handshake flow
                "generate_hardware_fingerprint" => await GenerateHardwareFingerprint(args).ConfigureAwait(false),

                // HMAC request signing — used by commandService.signedPost via @tauri-apps/api invoke
                "sign_request"                  => await SignRequest(args).ConfigureAwait(false),

                // Heartbeat
                "send_heartbeat"            => await SendHeartbeat(args).ConfigureAwait(false),

                // Notifications
                "show_notification"         => ShowNotification(args),

                // System control
                "system_lock"               => await SystemLock(args).ConfigureAwait(false),
                "system_logoff"             => await SystemLogoff(args).ConfigureAwait(false),
                "system_restart"            => await SystemRestart(args).ConfigureAwait(false),
                "system_shutdown"           => await SystemShutdown(args).ConfigureAwait(false),
                "system_cancel_shutdown"    => await SystemCancelShutdown(args).ConfigureAwait(false),

                // System info
                "get_system_info"           => await GetSystemInfo(args).ConfigureAwait(false),

                // Games / apps
                "detect_installed_games"    => await DetectInstalledGames(args).ConfigureAwait(false),
                "detect_installed_apps"     => await DetectInstalledApps(args).ConfigureAwait(false),
                "launch_game"               => await LaunchGame(args).ConfigureAwait(false),
                "add_manual_game"           => AddManualGame(args),
                "browse_for_game"           => await BrowseForGame(args).ConfigureAwait(false),
                "check_installed_paths"     => CheckInstalledPaths(args),

                // Kiosk management
                "enable_kiosk_shortcuts"    => await EnableKioskShortcuts(args).ConfigureAwait(false),
                "setup_complete_kiosk"      => await SetupCompleteKiosk(args).ConfigureAwait(false),
                "temporarily_allow_dialogs" => await TemporarilyAllowDialogs(args).ConfigureAwait(false),

                // Remote-command pump control — the WS + long-poll pipeline that
                // receives lock/unlock/message/shutdown/restart/screenshot/login/logout
                // from the backend. Must be (re)started after device credentials exist.
                "start_command_service"     => await StartCommandService(args).ConfigureAwait(false),
                "stop_command_service"      => await StopCommandService(args).ConfigureAwait(false),

                // Shell replacement — rewrites HKLM\Winlogon\Shell so Windows
                // launches PrimusClient.exe instead of explorer.exe at login.
                "get_shell_replacement_status" => GetShellReplacementStatus(),
                "enable_shell_replacement"  => EnableShellReplacement(),
                "disable_shell_replacement" => DisableShellReplacement(),

                // Graceful kiosk exit (Ctrl+Shift+L). Temporarily un-hooks the
                // keyboard + un-hides the taskbar + (optionally) minimises the
                // WebView so an admin can reach the desktop. Auto re-locks.
                "kiosk_exit_temp"           => await KioskExitTemp(args).ConfigureAwait(false),

                // Internal (emit from React) — no-op on C# side; browser handles it
                "__emit"                    => null,

                _ => throw new NotSupportedException($"Unknown command: {cmd}")
            };

            Respond(id, ok: true, data: result);
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "JsBridge command '{Cmd}' failed.", cmd);
            Respond(id, ok: false, data: null, error: ex.Message);
        }
    }

    // -----------------------------------------------------------------------
    // Response / event push helpers
    // -----------------------------------------------------------------------

    private void Respond(string id, bool ok, object? data, string? error = null)
    {
        if (_core is null) return;
        try
        {
            var envelope = new { id, ok, data, error };
            var json = JsonSerializer.Serialize(envelope, JsonOpts);
            // WebView2 PostWebMessageAsString must be called on the thread that created the control.
            var dispatcher = Application.Current?.Dispatcher;
            if (dispatcher is not null && !dispatcher.CheckAccess())
            {
                dispatcher.Invoke(() => _core?.PostWebMessageAsString(json));
            }
            else
            {
                _core.PostWebMessageAsString(json);
            }
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "JsBridge: failed to post response for id={Id}.", id);
        }
    }

    /// <summary>Posts a realtime event envelope to the React app.</summary>
    public void PostEvent(string eventName, object? payload)
    {
        if (_core is null) return;
        try
        {
            var envelope = new { __tauri_event = eventName, payload };
            var json = JsonSerializer.Serialize(envelope, JsonOpts);
            var dispatcher = Application.Current?.Dispatcher;
            if (dispatcher is not null && !dispatcher.CheckAccess())
            {
                dispatcher.BeginInvoke(() => _core?.PostWebMessageAsString(json));
            }
            else
            {
                _core.PostWebMessageAsString(json);
            }
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "JsBridge: failed to push event '{Event}'.", eventName);
        }
    }

    // -----------------------------------------------------------------------
    // Realtime event forwarders → React
    // -----------------------------------------------------------------------

    private void OnChatMessage(object? sender, ChatMessageDto msg) =>
        PostEvent("chat_message", msg);

    private void OnNotification(object? sender, AnnouncementDto announcement) =>
        PostEvent("announcement", announcement);

    private void OnWalletUpdated(object? sender, WalletDto wallet) =>
        PostEvent("wallet_updated", wallet);

    private void OnRemainingTimeUpdated(object? sender, int remainingSeconds) =>
        PostEvent("time_updated", new { remaining_seconds = Math.Max(0, remainingSeconds) });

    private void OnConnectionStateChanged(object? sender, RealtimeConnectionState state) =>
        PostEvent("connection_state_changed", new { state = state.ToString().ToLowerInvariant() });

    private void OnLockStateChanged(object? sender, LockStateEventArgs e) =>
        PostEvent("pc_lock_state", new { locked = e.Locked, message = e.Message });

    // -----------------------------------------------------------------------
    // Command implementations
    // -----------------------------------------------------------------------

    #region Device credentials

    private async Task<object?> GetDeviceCredentials(JsonObject _)
    {
        var store = _sp.GetRequiredService<IDeviceCredentialStore>();
        var creds = await store.LoadAsync(CancellationToken.None).ConfigureAwait(false);
        if (creds is null) return null;
        // Never expose DeviceSecret to the web UI.
        return new
        {
            pc_id                = creds.PcId,
            license_key          = creds.LicenseKey,
            hardware_fingerprint = creds.HardwareFingerprint,
            registered_at_utc    = creds.RegisteredAtUtc,
        };
    }

    private async Task<object?> SaveDeviceCredentials(JsonObject args)
    {
        var store = _sp.GetRequiredService<IDeviceCredentialStore>();
        // Load existing so we don't clobber fields not sent by the caller.
        var existing = await store.LoadAsync(CancellationToken.None).ConfigureAwait(false);

        // React sends camelCase (pcId, licenseKey, deviceSecret); the backend may also
        // send snake_case (pc_id, license_key, device_secret).  Accept both.
        // pcId arrives as a JSON Number (not a string), so use TryGetValue<> to avoid
        // "An element of type 'Number' cannot be converted to a 'System.String'" exceptions.
        static string? Pick(JsonObject a, string camel, string snake)
        {
            var node = a[camel] ?? a[snake];
            if (node is not JsonValue jv) return null;
            if (jv.TryGetValue<string>(out var s)) return s;
            if (jv.TryGetValue<long>(out var l)) return l.ToString(System.Globalization.CultureInfo.InvariantCulture);
            if (jv.TryGetValue<double>(out var d)) return ((long)d).ToString(System.Globalization.CultureInfo.InvariantCulture);
            return jv.ToJsonString();
        }

        var updated = new DeviceCredentials
        {
            PcId                = Pick(args, "pcId",         "pc_id")         ?? existing?.PcId                ?? string.Empty,
            LicenseKey          = Pick(args, "licenseKey",   "license_key")   ?? existing?.LicenseKey          ?? string.Empty,
            DeviceSecret        = Pick(args, "deviceSecret", "device_secret") ?? existing?.DeviceSecret        ?? string.Empty,
            HardwareFingerprint = Pick(args, "fingerprint",  "hardware_fingerprint") ?? existing?.HardwareFingerprint ?? string.Empty,
            RegisteredAtUtc     = existing?.RegisteredAtUtc ?? DateTime.UtcNow,
        };

        await store.SaveAsync(updated, CancellationToken.None).ConfigureAwait(false);
        return null;
    }

    private async Task<object?> ResetDeviceCredentials(JsonObject _)
    {
        var store = _sp.GetRequiredService<IDeviceCredentialStore>();
        await store.ClearAsync(CancellationToken.None).ConfigureAwait(false);
        return null;
    }

    /// <summary>
    /// Called by the React handshake flow (handshake.ts step 2) to obtain the hardware
    /// fingerprint that uniquely identifies this PC with the backend.
    /// </summary>
    private async Task<object?> GenerateHardwareFingerprint(JsonObject _)
    {
        var fp = _sp.GetRequiredService<IHardwareFingerprintProvider>();
        var fingerprint = await fp.GetFingerprintAsync(CancellationToken.None).ConfigureAwait(false);
        // Return as plain string — React stores it and passes it to the register call.
        return fingerprint;
    }

    /// <summary>
    /// Computes an HMAC-SHA256 request signature for the commandService heartbeat / command-pull.
    ///
    /// Backend verification (security.py):
    ///   message = (method + path + timestamp + nonce).encode() + body_bytes
    ///   expected = hmac.new(device_secret.encode(), message, sha256).hexdigest()
    ///
    /// React calls: invoke("sign_request", { method, path, payload })
    ///   where payload = JSON.stringify(requestBody)  (matches the actual wire bytes)
    /// </summary>
    private async Task<object?> SignRequest(JsonObject args)
    {
        var store  = _sp.GetRequiredService<IDeviceCredentialStore>();
        var creds  = await store.LoadAsync(CancellationToken.None).ConfigureAwait(false);

        var method  = args["method"]?.GetValue<string>()?.ToUpperInvariant() ?? "POST";
        var path    = args["path"]?.GetValue<string>()    ?? string.Empty;
        var payload = args["payload"]?.GetValue<string>()  ?? string.Empty;

        var deviceSecret = creds?.DeviceSecret ?? string.Empty;
        var pcId         = creds?.PcId         ?? string.Empty;

        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString(
            System.Globalization.CultureInfo.InvariantCulture);
        var nonce = Guid.NewGuid().ToString("N"); // 32-char lowercase hex

        // message = (method + path + timestamp + nonce) encoded to UTF-8 + payload UTF-8 bytes
        var prefix  = System.Text.Encoding.UTF8.GetBytes(method + path + timestamp + nonce);
        var body    = System.Text.Encoding.UTF8.GetBytes(payload);
        var message = new byte[prefix.Length + body.Length];
        Buffer.BlockCopy(prefix, 0, message, 0, prefix.Length);
        Buffer.BlockCopy(body,   0, message, prefix.Length, body.Length);

        string signature;
        if (!string.IsNullOrEmpty(deviceSecret))
        {
            using var hmac = new System.Security.Cryptography.HMACSHA256(
                System.Text.Encoding.UTF8.GetBytes(deviceSecret));
            var hash = hmac.ComputeHash(message);
            signature = Convert.ToHexString(hash).ToLowerInvariant();
        }
        else
        {
            // Device secret not yet set — return empty; backend will reject with 401
            Log.Warning("SignRequest: device_secret is empty — heartbeat will be rejected by backend.");
            signature = string.Empty;
        }

        return new { signature, timestamp, nonce, pc_id = pcId };
    }

    private async Task<object?> RegisterPcWithBackend(JsonObject args)
    {
        var api         = _sp.GetRequiredService<IPrimusApiClient>();
        var fpProvider  = _sp.GetRequiredService<IHardwareFingerprintProvider>();
        var store       = _sp.GetRequiredService<IDeviceCredentialStore>();

        var pcName     = args["pc_name"]?.GetValue<string>()
                         ?? args["name"]?.GetValue<string>()
                         ?? Environment.MachineName;
        var licenseKey = args["license_key"]?.GetValue<string>() ?? string.Empty;

        var fingerprint = await fpProvider.GetFingerprintAsync(CancellationToken.None).ConfigureAwait(false);

        var request = new DeviceRegistrationRequest
        {
            Name                = pcName,
            LicenseKey          = licenseKey,
            HardwareFingerprint = fingerprint,
            Capabilities        = new[] { "screenshot", "heartbeat", "command" },
        };

        var creds = await api.RegisterPcAsync(request, CancellationToken.None).ConfigureAwait(false);
        await store.SaveAsync(creds, CancellationToken.None).ConfigureAwait(false);

        return new { pc_id = creds.PcId, success = true };
    }

    #endregion

    #region Heartbeat

    private async Task<object?> SendHeartbeat(JsonObject args)
    {
        var api      = _sp.GetRequiredService<IPrimusApiClient>();
        var hw       = _sp.GetRequiredService<IHardwareMonitor>();
        var idle     = _sp.GetRequiredService<IIdleMonitor>();
        var store    = _sp.GetRequiredService<IDeviceCredentialStore>();

        var creds = await store.LoadAsync(CancellationToken.None).ConfigureAwait(false);
        if (creds is null || !creds.IsValid())
        {
            return new { success = false, reason = "no_credentials" };
        }

        HardwareSnapshot snapshot;
        try
        {
            snapshot = await hw.SampleAsync(CancellationToken.None).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Hardware sample failed during heartbeat; using zeros.");
            snapshot = new HardwareSnapshot();
        }

        var idleSecs = idle.GetIdleDuration().TotalSeconds;

        var req = new HeartbeatRequest
        {
            PcId                  = creds.PcId,
            CpuPercent            = snapshot.CpuPercent,
            RamPercent            = snapshot.RamPercent,
            GpuPercent            = snapshot.GpuPercent,
            CpuTemperatureCelsius = snapshot.CpuTemperatureCelsius,
            TotalRamBytes         = snapshot.TotalRamBytes,
            AvailableRamBytes     = snapshot.AvailableRamBytes,
            IdleSeconds           = idleSecs,
            IsIdle                = idle.IsIdle(TimeSpan.FromMinutes(5)),
            Status                = idleSecs > 300 ? "idle" : "online",
        };

        var response = await api.HeartbeatAsync(req, CancellationToken.None).ConfigureAwait(false);
        return new
        {
            success               = true,
            remaining_time_seconds = response.RemainingTimeSeconds,
            session_active        = response.SessionActive,
            pending_commands      = response.PendingCommandCount,
        };
    }

    #endregion

    #region Notifications

    private object? ShowNotification(JsonObject args)
    {
        var svc     = _sp.GetRequiredService<INotificationService>();
        var title   = args["title"]?.GetValue<string>()   ?? "Primus";
        var message = args["message"]?.GetValue<string>() ?? string.Empty;
        var type    = args["type"]?.GetValue<string>()    ?? "info";

        switch (type.ToLowerInvariant())
        {
            case "error":
                svc.Error(title, message);
                break;
            case "warn":
            case "warning":
                svc.Warn(title, message);
                break;
            default:
                svc.Info(title, message);
                break;
        }

        return null;
    }

    #endregion

    #region System control

    private async Task<object?> SystemLock(JsonObject _)
    {
        await _sp.GetRequiredService<ISystemControl>().LockWorkstationAsync().ConfigureAwait(false);
        return null;
    }

    private async Task<object?> SystemLogoff(JsonObject _)
    {
        await _sp.GetRequiredService<ISystemControl>().LogoffAsync().ConfigureAwait(false);
        return null;
    }

    private async Task<object?> SystemRestart(JsonObject args)
    {
        var delay = TimeSpan.FromSeconds(args["delay_secs"]?.GetValue<double?>() ?? 0);
        await _sp.GetRequiredService<ISystemControl>().RestartAsync(delay).ConfigureAwait(false);
        return null;
    }

    private async Task<object?> SystemShutdown(JsonObject args)
    {
        var delay = TimeSpan.FromSeconds(args["delay_secs"]?.GetValue<double?>() ?? 0);
        await _sp.GetRequiredService<ISystemControl>().ShutdownAsync(delay).ConfigureAwait(false);
        return null;
    }

    private async Task<object?> SystemCancelShutdown(JsonObject _)
    {
        await _sp.GetRequiredService<ISystemControl>().CancelShutdownAsync().ConfigureAwait(false);
        return null;
    }

    #endregion

    #region System info

    private async Task<object?> GetSystemInfo(JsonObject _)
    {
        var info = await _sp.GetRequiredService<ISystemInfoProvider>()
                             .GetAsync(CancellationToken.None)
                             .ConfigureAwait(false);
        return new
        {
            hostname        = info.Hostname,
            os_version      = info.OsVersion,
            architecture    = info.Architecture,
            processor_count = info.ProcessorCount,
            total_memory_bytes = info.TotalMemoryBytes,
            username        = info.UserName,
            dotnet_version  = info.DotNetVersion,
        };
    }

    #endregion

    #region Games & apps

    private async Task<object?> DetectInstalledGames(JsonObject _)
    {
        var scanner = _sp.GetRequiredService<GameRegistryScanner>();
        var games   = await scanner.ScanAsync(CancellationToken.None).ConfigureAwait(false);
        return games.Select(g => new
        {
            id              = g.Id,
            name            = g.Name,
            category        = g.Category,
            executable_path = g.ExecutablePath,
            enabled         = g.Enabled,
        }).ToArray();
    }

    private async Task<object?> DetectInstalledApps(JsonObject _)
    {
        var catalog = _sp.GetRequiredService<IGameCatalog>();
        var games   = await catalog.GetGamesAsync(CancellationToken.None).ConfigureAwait(false);
        return games.Select(g => new
        {
            id              = g.Id,
            name            = g.Name,
            category        = g.Category,
            executable_path = g.ExecutablePath,
            enabled         = g.Enabled,
        }).ToArray();
    }

    private async Task<object?> LaunchGame(JsonObject args)
    {
        var launcher = _sp.GetRequiredService<IGameLauncher>();
        var catalog  = _sp.GetRequiredService<IGameCatalog>();

        var gameId  = args["game_id"]?.GetValue<long?>();
        var exePath = args["executable_path"]?.GetValue<string>();
        var name    = args["game_name"]?.GetValue<string>() ?? args["name"]?.GetValue<string>() ?? "Game";

        GameDto? game = null;
        if (gameId.HasValue)
        {
            var list = await catalog.GetGamesAsync(CancellationToken.None).ConfigureAwait(false);
            game = list.FirstOrDefault(g => g.Id == gameId.Value);
        }

        game ??= new GameDto { ExecutablePath = exePath, Name = name, Enabled = true };

        var pid = await launcher.LaunchAsync(game, CancellationToken.None).ConfigureAwait(false);
        return new { pid, success = pid > 0 };
    }

    private static object? AddManualGame(JsonObject args)
    {
        // Stored only in-session (the game catalog API is the persistent source).
        // The React side stores it in its own Zustand/local state after this returns.
        var name    = args["name"]?.GetValue<string>()            ?? "Unknown";
        var exePath = args["executable_path"]?.GetValue<string>() ?? string.Empty;
        var category = args["category"]?.GetValue<string>()       ?? "Manual";

        return new { success = true, name, executable_path = exePath, category };
    }

    private static Task<object?> BrowseForGame(JsonObject _)
    {
        var tcs = new TaskCompletionSource<object?>();

        // OpenFileDialog must be shown on the WPF UI thread.
        Application.Current.Dispatcher.Invoke(() =>
        {
            try
            {
                var dlg = new OpenFileDialog
                {
                    Title            = "Select Game Executable",
                    Filter           = "Executable files (*.exe)|*.exe|All files (*.*)|*.*",
                    InitialDirectory = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                    CheckFileExists  = true,
                };

                if (dlg.ShowDialog() == true)
                {
                    tcs.SetResult(new
                    {
                        path      = dlg.FileName,
                        file_name = Path.GetFileNameWithoutExtension(dlg.FileName),
                    });
                }
                else
                {
                    tcs.SetResult(null);
                }
            }
            catch (Exception ex)
            {
                tcs.SetException(ex);
            }
        });

        return tcs.Task;
    }

    private static object? CheckInstalledPaths(JsonObject args)
    {
        var pathsNode = args["paths"] as JsonArray;
        if (pathsNode is null)
        {
            return new { results = Array.Empty<object>() };
        }

        var results = pathsNode
            .OfType<JsonValue>()
            .Select(n => n.GetValue<string>())
            .Select(p => (object)new { path = p, exists = File.Exists(p) || Directory.Exists(p) })
            .ToArray();

        return new { results };
    }

    #endregion

    #region Kiosk management

    private async Task<object?> EnableKioskShortcuts(JsonObject _)
    {
        var kiosk = _sp.GetRequiredService<IKioskOrchestrator>();
        if (!kiosk.IsActive)
        {
            await kiosk.EnableAsync(CancellationToken.None).ConfigureAwait(false);
        }
        return new { active = kiosk.IsActive };
    }

    private async Task<object?> SetupCompleteKiosk(JsonObject _)
    {
        var kiosk    = _sp.GetRequiredService<IKioskOrchestrator>();
        var autoboot = _sp.GetRequiredService<IAutoBootService>();
        var shell    = _sp.GetRequiredService<IShellReplacementService>();

        if (!kiosk.IsActive)
        {
            await kiosk.EnableAsync(CancellationToken.None).ConfigureAwait(false);
        }
        await autoboot.EnableAsync(CancellationToken.None).ConfigureAwait(false);

        // Shell replacement is best-effort — failures (e.g. missing admin
        // rights) are logged and reported but must not break kiosk setup.
        var shellStatus = shell.Enable();

        return new
        {
            success           = true,
            kiosk_active      = kiosk.IsActive,
            shell_replaced    = shellStatus.IsReplaced,
            shell_error       = shellStatus.LastError,
            has_admin_rights  = shellStatus.HasAdminRights,
        };
    }

    private async Task<object?> TemporarilyAllowDialogs(JsonObject args)
    {
        var kiosk    = _sp.GetRequiredService<IKioskOrchestrator>();
        var durationSecs = args["duration_secs"]?.GetValue<int?>() ?? 30;
        var duration = TimeSpan.FromSeconds(Math.Max(5, durationSecs));

        if (kiosk.IsActive)
        {
            await kiosk.DisableAsync(CancellationToken.None).ConfigureAwait(false);

            // Re-enable after the grace period (fire-and-forget; errors logged inside).
            _ = Task.Delay(duration).ContinueWith(async _ =>
            {
                try { await kiosk.EnableAsync(CancellationToken.None).ConfigureAwait(false); }
                catch (Exception ex) { Log.Warning(ex, "Failed to re-enable kiosk after allow-dialogs grace period."); }
            }, TaskScheduler.Default);
        }

        return new { allowed_for_seconds = duration.TotalSeconds };
    }

    #endregion

    #region Remote-command pump

    private int _commandServiceStarted;

    private async Task<object?> StartCommandService(JsonObject _)
    {
        // Idempotent: first call wires WS + long-poll; subsequent calls are no-ops.
        if (Interlocked.Exchange(ref _commandServiceStarted, 1) == 1)
        {
            return new { started = true, already_running = true };
        }

        try
        {
            var cmd = _sp.GetRequiredService<ICommandService>();
            await cmd.StartAsync(CancellationToken.None).ConfigureAwait(false);
            Log.Information("CommandService started via JsBridge.");
            return new { started = true };
        }
        catch (Exception ex)
        {
            // Allow a retry on failure.
            Interlocked.Exchange(ref _commandServiceStarted, 0);
            Log.Warning(ex, "Failed to start CommandService.");
            return new { started = false, error = ex.Message };
        }
    }

    private async Task<object?> StopCommandService(JsonObject _)
    {
        if (Interlocked.Exchange(ref _commandServiceStarted, 0) == 0)
        {
            return new { stopped = true, already_stopped = true };
        }
        var cmd = _sp.GetRequiredService<ICommandService>();
        await cmd.StopAsync(CancellationToken.None).ConfigureAwait(false);
        Log.Information("CommandService stopped via JsBridge.");
        return new { stopped = true };
    }

    #endregion

    #region Shell replacement

    private object? GetShellReplacementStatus()
    {
        var s = _sp.GetRequiredService<IShellReplacementService>().GetStatus();
        return new
        {
            is_replaced        = s.IsReplaced,
            current_shell_path = s.CurrentShellPath,
            this_app_path      = s.ThisAppPath,
            has_admin_rights   = s.HasAdminRights,
            last_error         = s.LastError,
        };
    }

    private object? EnableShellReplacement()
    {
        var s = _sp.GetRequiredService<IShellReplacementService>().Enable();
        return new
        {
            is_replaced        = s.IsReplaced,
            current_shell_path = s.CurrentShellPath,
            this_app_path      = s.ThisAppPath,
            has_admin_rights   = s.HasAdminRights,
            last_error         = s.LastError,
        };
    }

    private object? DisableShellReplacement()
    {
        var s = _sp.GetRequiredService<IShellReplacementService>().Disable();
        return new
        {
            is_replaced        = s.IsReplaced,
            current_shell_path = s.CurrentShellPath,
            this_app_path      = s.ThisAppPath,
            has_admin_rights   = s.HasAdminRights,
            last_error         = s.LastError,
        };
    }

    #endregion

    #region Kiosk exit (Ctrl+Shift+L)

    private async Task<object?> KioskExitTemp(JsonObject args)
    {
        // Temporary un-lock so an admin can reach the desktop. The kiosk
        // orchestrator re-enables itself after the grace period (same
        // mechanism as temporarily_allow_dialogs).
        var kiosk = _sp.GetRequiredService<IKioskOrchestrator>();
        var durationSecs = args["duration_secs"]?.GetValue<int?>() ?? 60;
        var duration = TimeSpan.FromSeconds(Math.Max(10, Math.Min(600, durationSecs)));

        if (kiosk.IsActive)
        {
            await kiosk.DisableAsync(CancellationToken.None).ConfigureAwait(false);

            _ = Task.Delay(duration).ContinueWith(async _ =>
            {
                try { await kiosk.EnableAsync(CancellationToken.None).ConfigureAwait(false); }
                catch (Exception ex) { Log.Warning(ex, "Failed to re-enable kiosk after Ctrl+Shift+L grace."); }
            }, TaskScheduler.Default);
        }

        // Minimise the WebView so the desktop is reachable.
        try
        {
            var dispatcher = Application.Current?.Dispatcher;
            if (dispatcher is not null)
            {
                dispatcher.Invoke(() =>
                {
                    if (Application.Current?.MainWindow is { } w)
                    {
                        w.WindowState = WindowState.Minimized;
                    }
                });
            }
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Failed to minimise kiosk window on Ctrl+Shift+L.");
        }

        Log.Information("Kiosk temporarily exited for {Seconds}s via Ctrl+Shift+L.", duration.TotalSeconds);
        return new { allowed_for_seconds = duration.TotalSeconds };
    }

    #endregion

    // -----------------------------------------------------------------------
    // IDisposable
    // -----------------------------------------------------------------------

    public void Dispose()
    {
        Detach();

        _realtime.ChatMessageReceived    -= OnChatMessage;
        _realtime.NotificationReceived   -= OnNotification;
        _realtime.WalletUpdated          -= OnWalletUpdated;
        _realtime.RemainingTimeUpdated   -= OnRemainingTimeUpdated;
        _realtime.ConnectionStateChanged -= OnConnectionStateChanged;
        _lockOverlay.StateChanged        -= OnLockStateChanged;
    }
}
