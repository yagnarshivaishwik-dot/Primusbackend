using System;
using System.Collections.ObjectModel;
using System.IO;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Tasks;
using PrimusKiosk.Infrastructure;
using PrimusKiosk.Models;

namespace PrimusKiosk.Services;

public class BackendConfig
{
    public string ApiBaseUrl { get; set; } = "https://api.primustech.in";
    public string ProvisioningTokenPath { get; set; } = "provisioning_token.txt";
}

public class BackendClient
{
    private readonly AppStateService _appState;
    private readonly HttpClient _http;
    private readonly BackendConfig _config;

    public Guid? ClientId { get; private set; }

    public BackendClient(AppStateService appState)
    {
        _appState = appState;
        _http = new HttpClient(new HttpClientHandler
        {
            ServerCertificateCustomValidationCallback = (msg, cert, chain, errors) =>
            {
                // Enforce TLS; in staging the operator can install the cert into
                // the trusted root store, in which case normal validation passes.
                return errors == System.Net.Security.SslPolicyErrors.None;
            }
        });

        _config = new BackendConfig();
    }

    public async Task LoadConfigurationAsync()
    {
        try
        {
            var path = Path.Combine(AppContext.BaseDirectory, "appsettings.json");
            if (!File.Exists(path)) return;
            var json = await File.ReadAllTextAsync(path);
            var cfg = JsonSerializer.Deserialize<BackendConfig>(json);
            if (cfg != null)
            {
                _config.ApiBaseUrl = cfg.ApiBaseUrl.TrimEnd('/');
                _config.ProvisioningTokenPath = cfg.ProvisioningTokenPath;
            }
        }
        catch (Exception ex)
        {
            Serilog.Log.Warning(ex, "Failed to load appsettings.json, using defaults");
        }
    }

    public async Task EnsureProvisionedAsync()
    {
        // Basic first-run provisioning using a one-time token written next to the EXE
        var clientIdPath = Path.Combine(AppContext.BaseDirectory, "client_id.txt");
        if (File.Exists(clientIdPath) && Guid.TryParse(await File.ReadAllTextAsync(clientIdPath), out var existing))
        {
            ClientId = existing;
            return;
        }

        var tokenFilePath = Path.IsPathRooted(_config.ProvisioningTokenPath)
            ? _config.ProvisioningTokenPath
            : Path.Combine(AppContext.BaseDirectory, _config.ProvisioningTokenPath);

        if (!File.Exists(tokenFilePath))
        {
            Serilog.Log.Warning("Provisioning token file not found at {Path}", tokenFilePath);
            return;
        }

        var token = (await File.ReadAllTextAsync(tokenFilePath)).Trim();
        if (string.IsNullOrWhiteSpace(token))
        {
            Serilog.Log.Warning("Provisioning token was empty");
            return;
        }

        var body = new { provisioning_token = token };
        var resp = await _http.PostAsJsonAsync($"{_config.ApiBaseUrl}/api/v1/clients/register", body);
        resp.EnsureSuccessStatusCode();
        using var doc = await JsonDocument.ParseAsync(await resp.Content.ReadAsStreamAsync());
        if (!doc.RootElement.TryGetProperty("client_id", out var idEl)) return;

        var idStr = idEl.GetString();
        if (!Guid.TryParse(idStr, out var id)) return;

        ClientId = id;
        Directory.CreateDirectory(Path.GetDirectoryName(clientIdPath)!);
        await File.WriteAllTextAsync(clientIdPath, id.ToString());
    }

    public async Task<bool> LoginAsync(string usernameOrEmail, string password)
    {
        var data = new FormUrlEncodedContent(new[]
        {
            new KeyValuePair<string?, string?>("username", usernameOrEmail),
            new KeyValuePair<string?, string?>("password", password),
        });

        var resp = await _http.PostAsync($"{_config.ApiBaseUrl}/api/auth/login", data);
        if (!resp.IsSuccessStatusCode)
        {
            Serilog.Log.Warning("Login failed with status {Status}", resp.StatusCode);
            return false;
        }

        using var doc = await JsonDocument.ParseAsync(await resp.Content.ReadAsStreamAsync());
        if (!doc.RootElement.TryGetProperty("access_token", out var tokenEl)) return false;

        var token = tokenEl.GetString();
        if (string.IsNullOrWhiteSpace(token)) return false;

        // Store token encrypted via DPAPI
        var protectedToken = DpapiProtector.Protect(token);
        var tokenPath = Path.Combine(AppContext.BaseDirectory, "token.dat");
        await File.WriteAllTextAsync(tokenPath, protectedToken);

        return true;
    }

    public async Task LoadInitialSessionDataAsync(ObservableCollection<GameModel> gamesTarget)
    {
        try
        {
            var gamesResp = await _http.GetAsync($"{_config.ApiBaseUrl}/api/v1/shop");
            if (gamesResp.IsSuccessStatusCode)
            {
                var json = await gamesResp.Content.ReadAsStringAsync();
                var doc = JsonDocument.Parse(json);
                gamesTarget.Clear();
                foreach (var g in doc.RootElement.EnumerateArray())
                {
                    gamesTarget.Add(new GameModel
                    {
                        Id = g.GetProperty("id").GetInt32(),
                        Name = g.GetProperty("name").GetString() ?? "Game",
                        Description = g.TryGetProperty("description", out var d) ? d.GetString() : null,
                        Category = g.TryGetProperty("category", out var c) ? c.GetString() : null
                    });
                }
            }
        }
        catch (Exception ex)
        {
            Serilog.Log.Warning(ex, "Failed loading initial games or wallet data");
        }
    }

    public async Task StartSessionAsync()
    {
        if (!ClientId.HasValue) return;
        var body = new { client_id = ClientId.Value };
        var resp = await _http.PostAsJsonAsync($"{_config.ApiBaseUrl}/api/v1/clients/{ClientId}/command",
            new { type = "start_session", args = body });
        resp.EnsureSuccessStatusCode();

        _appState.UpdateSessionStart(DateTime.UtcNow);
    }

    public async Task EndSessionAsync()
    {
        if (!ClientId.HasValue) return;
        var body = new { client_id = ClientId.Value };
        var resp = await _http.PostAsJsonAsync($"{_config.ApiBaseUrl}/api/v1/clients/{ClientId}/command",
            new { type = "end_session", args = body });
        resp.EnsureSuccessStatusCode();

        _appState.UpdateSessionStart(null);
    }
}


