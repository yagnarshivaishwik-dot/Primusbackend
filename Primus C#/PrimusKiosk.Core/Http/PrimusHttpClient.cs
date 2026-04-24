using System.Globalization;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using PrimusKiosk.Core.Abstractions;
using PrimusKiosk.Core.Http.ApiContracts;
using PrimusKiosk.Core.Infrastructure;
using PrimusKiosk.Core.Models;
using Serilog;

namespace PrimusKiosk.Core.Http;

/// <summary>
/// <see cref="IPrimusApiClient"/> implementation backed by a typed <see cref="HttpClient"/>.
/// HTTP pipeline (registered in DI): HmacSigningHandler → AuthHandler → Polly retry → Polly timeout.
/// </summary>
public sealed class PrimusHttpClient : IPrimusApiClient
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DictionaryKeyPolicy = JsonNamingPolicy.SnakeCaseLower,
    };

    private readonly HttpClient _http;
    private readonly PrimusSettings _settings;

    public PrimusHttpClient(HttpClient http, IOptionsMonitor<PrimusSettings> settings)
    {
        _http = http;
        _settings = settings.CurrentValue;

        if (_http.BaseAddress is null && !string.IsNullOrWhiteSpace(_settings.ApiBaseUrl))
        {
            _http.BaseAddress = new Uri(_settings.ApiBaseUrl.TrimEnd('/') + "/");
        }

        if (_http.Timeout == System.Threading.Timeout.InfiniteTimeSpan || _http.Timeout.TotalSeconds < 1)
        {
            _http.Timeout = TimeSpan.FromSeconds(Math.Max(5, _settings.HttpTimeoutSeconds));
        }
    }

    // ---------------------- Auth -----------------------------------------

    public async Task<TokenBundle> LoginAsync(string email, string password, CancellationToken cancellationToken)
    {
        var form = new FormUrlEncodedContent(new[]
        {
            new KeyValuePair<string, string>("username", email),
            new KeyValuePair<string, string>("password", password),
        });

        using var resp = await _http.PostAsync("api/auth/login", form, cancellationToken).ConfigureAwait(false);
        await EnsureSuccessAsync(resp, "login", cancellationToken).ConfigureAwait(false);

        using var stream = await resp.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken).ConfigureAwait(false);
        var root = doc.RootElement;

        return new TokenBundle
        {
            AccessToken = root.GetProperty("access_token").GetString() ?? string.Empty,
            RefreshToken = root.TryGetProperty("refresh_token", out var rt) ? rt.GetString() : null,
            TokenType = root.TryGetProperty("token_type", out var tt) ? tt.GetString() ?? "Bearer" : "Bearer",
            AccessTokenExpiresAtUtc = root.TryGetProperty("expires_in", out var exp)
                ? DateTime.UtcNow.AddSeconds(exp.GetInt32())
                : DateTime.UtcNow.AddMinutes(20),
        };
    }

    public async Task<TokenBundle> RefreshAsync(string refreshToken, CancellationToken cancellationToken)
    {
        using var resp = await _http.PostAsJsonAsync("api/auth/refresh", new { refresh_token = refreshToken }, JsonOptions, cancellationToken).ConfigureAwait(false);
        await EnsureSuccessAsync(resp, "refresh", cancellationToken).ConfigureAwait(false);

        using var stream = await resp.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken).ConfigureAwait(false);
        var root = doc.RootElement;

        return new TokenBundle
        {
            AccessToken = root.GetProperty("access_token").GetString() ?? string.Empty,
            RefreshToken = root.TryGetProperty("refresh_token", out var rt) ? rt.GetString() : refreshToken,
            TokenType = root.TryGetProperty("token_type", out var tt) ? tt.GetString() ?? "Bearer" : "Bearer",
            AccessTokenExpiresAtUtc = root.TryGetProperty("expires_in", out var exp)
                ? DateTime.UtcNow.AddSeconds(exp.GetInt32())
                : DateTime.UtcNow.AddMinutes(20),
        };
    }

    public async Task LogoutAsync(CancellationToken cancellationToken)
    {
        using var resp = await _http.PostAsync("api/auth/logout", content: null, cancellationToken).ConfigureAwait(false);
        // Best-effort logout — never throw.
        if (!resp.IsSuccessStatusCode)
        {
            Log.Warning("Logout returned {Status}", resp.StatusCode);
        }
    }

    public async Task<UserDto> GetMeAsync(CancellationToken cancellationToken)
    {
        using var resp = await _http.GetAsync("api/auth/me", cancellationToken).ConfigureAwait(false);
        await EnsureSuccessAsync(resp, "auth/me", cancellationToken).ConfigureAwait(false);
        return await resp.Content.ReadFromJsonAsync<UserDto>(JsonOptions, cancellationToken).ConfigureAwait(false)
               ?? throw new InvalidOperationException("Auth/me returned empty payload.");
    }

    // ---------------------- Device ---------------------------------------

    public async Task<DeviceCredentials> RegisterPcAsync(DeviceRegistrationRequest request, CancellationToken cancellationToken)
    {
        using var resp = await _http.PostAsJsonAsync("api/clientpc/register", request, JsonOptions, cancellationToken).ConfigureAwait(false);
        await EnsureSuccessAsync(resp, "clientpc/register", cancellationToken).ConfigureAwait(false);

        using var stream = await resp.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken).ConfigureAwait(false);
        var root = doc.RootElement;

        return new DeviceCredentials
        {
            PcId = root.GetProperty("pc_id").ToString(),
            DeviceSecret = root.TryGetProperty("device_secret", out var ds) ? ds.GetString() ?? string.Empty : string.Empty,
            LicenseKey = request.LicenseKey,
            HardwareFingerprint = request.HardwareFingerprint,
        };
    }

    public async Task<HeartbeatResponse> HeartbeatAsync(HeartbeatRequest request, CancellationToken cancellationToken)
    {
        using var resp = await _http.PostAsJsonAsync("api/clientpc/heartbeat", request, JsonOptions, cancellationToken).ConfigureAwait(false);
        await EnsureSuccessAsync(resp, "clientpc/heartbeat", cancellationToken).ConfigureAwait(false);
        return await resp.Content.ReadFromJsonAsync<HeartbeatResponse>(JsonOptions, cancellationToken).ConfigureAwait(false)
               ?? new HeartbeatResponse();
    }

    // ---------------------- Session --------------------------------------

    public async Task<SessionDto> StartSessionAsync(long gameId, CancellationToken cancellationToken)
    {
        using var resp = await _http.PostAsJsonAsync("api/session/start", new { game_id = gameId }, JsonOptions, cancellationToken).ConfigureAwait(false);
        await EnsureSuccessAsync(resp, "session/start", cancellationToken).ConfigureAwait(false);
        return await resp.Content.ReadFromJsonAsync<SessionDto>(JsonOptions, cancellationToken).ConfigureAwait(false)
               ?? throw new InvalidOperationException("Empty session payload.");
    }

    public async Task StopSessionAsync(long sessionId, CancellationToken cancellationToken)
    {
        using var resp = await _http.PostAsync($"api/session/stop/{sessionId}", content: null, cancellationToken).ConfigureAwait(false);
        await EnsureSuccessAsync(resp, "session/stop", cancellationToken).ConfigureAwait(false);
    }

    public async Task<SessionDto?> GetCurrentSessionAsync(CancellationToken cancellationToken)
    {
        using var resp = await _http.GetAsync("api/session/current", cancellationToken).ConfigureAwait(false);
        if (resp.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }
        await EnsureSuccessAsync(resp, "session/current", cancellationToken).ConfigureAwait(false);
        return await resp.Content.ReadFromJsonAsync<SessionDto>(JsonOptions, cancellationToken).ConfigureAwait(false);
    }

    // ---------------------- Wallet ---------------------------------------

    public async Task<WalletDto> GetWalletBalanceAsync(CancellationToken cancellationToken)
    {
        using var resp = await _http.GetAsync("api/wallet/balance", cancellationToken).ConfigureAwait(false);
        await EnsureSuccessAsync(resp, "wallet/balance", cancellationToken).ConfigureAwait(false);
        return await resp.Content.ReadFromJsonAsync<WalletDto>(JsonOptions, cancellationToken).ConfigureAwait(false)
               ?? new WalletDto();
    }

    // ---------------------- Games ----------------------------------------

    public async Task<IReadOnlyList<GameDto>> ListGamesAsync(CancellationToken cancellationToken)
    {
        using var resp = await _http.GetAsync("api/game/", cancellationToken).ConfigureAwait(false);
        await EnsureSuccessAsync(resp, "game/list", cancellationToken).ConfigureAwait(false);
        return await resp.Content.ReadFromJsonAsync<List<GameDto>>(JsonOptions, cancellationToken).ConfigureAwait(false)
               ?? new List<GameDto>();
    }

    // ---------------------- Chat -----------------------------------------

    public async Task<IReadOnlyList<ChatMessageDto>> GetChatHistoryAsync(int limit, CancellationToken cancellationToken)
    {
        var url = $"api/chat/?limit={limit.ToString(CultureInfo.InvariantCulture)}";
        using var resp = await _http.GetAsync(url, cancellationToken).ConfigureAwait(false);
        await EnsureSuccessAsync(resp, "chat/history", cancellationToken).ConfigureAwait(false);
        return await resp.Content.ReadFromJsonAsync<List<ChatMessageDto>>(JsonOptions, cancellationToken).ConfigureAwait(false)
               ?? new List<ChatMessageDto>();
    }

    public async Task SendChatMessageAsync(string body, CancellationToken cancellationToken)
    {
        using var resp = await _http.PostAsJsonAsync("api/chat/", new { body }, JsonOptions, cancellationToken).ConfigureAwait(false);
        await EnsureSuccessAsync(resp, "chat/send", cancellationToken).ConfigureAwait(false);
    }

    // ---------------------- Announcements --------------------------------

    public async Task<IReadOnlyList<AnnouncementDto>> ListAnnouncementsAsync(CancellationToken cancellationToken)
    {
        using var resp = await _http.GetAsync("api/announcement/", cancellationToken).ConfigureAwait(false);
        await EnsureSuccessAsync(resp, "announcement/list", cancellationToken).ConfigureAwait(false);
        return await resp.Content.ReadFromJsonAsync<List<AnnouncementDto>>(JsonOptions, cancellationToken).ConfigureAwait(false)
               ?? new List<AnnouncementDto>();
    }

    // ---------------------- Commands -------------------------------------

    public async Task<IReadOnlyList<PrimusCommand>> PullCommandsAsync(int timeoutSeconds, CancellationToken cancellationToken)
    {
        // The backend accepts ?timeout=<seconds> as a query parameter; there is no JSON body.
        var url = $"api/command/pull?timeout={timeoutSeconds}";
        using var req = new HttpRequestMessage(HttpMethod.Post, url);

        // Long-poll requests need a longer timeout than the default.
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        cts.CancelAfter(TimeSpan.FromSeconds(timeoutSeconds + 5));

        using var resp = await _http.SendAsync(req, cts.Token).ConfigureAwait(false);
        if (resp.StatusCode == HttpStatusCode.NoContent)
        {
            return Array.Empty<PrimusCommand>();
        }
        await EnsureSuccessAsync(resp, "command/pull", cancellationToken).ConfigureAwait(false);

        using var stream = await resp.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken).ConfigureAwait(false);

        var list = new List<PrimusCommand>();
        foreach (var element in doc.RootElement.EnumerateArray())
        {
            list.Add(ParseCommand(element));
        }
        return list;
    }

    public async Task AckCommandAsync(CommandAck ack, CancellationToken cancellationToken)
    {
        // Backend expects the exact wire shape: {command_id, state, result}.
        var wireAck = new
        {
            command_id = ack.CommandId,
            state = ack.State.ToWireString(),
            result = ack.Result,
        };
        using var resp = await _http.PostAsJsonAsync("api/command/ack", wireAck, JsonOptions, cancellationToken).ConfigureAwait(false);
        await EnsureSuccessAsync(resp, "command/ack", cancellationToken).ConfigureAwait(false);
    }

    // ---------------------- Screenshots ----------------------------------

    public async Task<string> UploadScreenshotAsync(Stream pngContent, string fileName, CancellationToken cancellationToken)
    {
        using var content = new MultipartFormDataContent();
        var streamContent = new StreamContent(pngContent);
        streamContent.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        content.Add(streamContent, "file", fileName);

        using var resp = await _http.PostAsync("api/screenshot/upload", content, cancellationToken).ConfigureAwait(false);
        await EnsureSuccessAsync(resp, "screenshot/upload", cancellationToken).ConfigureAwait(false);

        using var stream = await resp.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken).ConfigureAwait(false);
        return doc.RootElement.TryGetProperty("id", out var idEl) ? idEl.ToString() : string.Empty;
    }

    // ---------------------- Health ---------------------------------------

    public async Task<bool> PingAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var resp = await _http.GetAsync("health", cancellationToken).ConfigureAwait(false);
            return resp.IsSuccessStatusCode;
        }
        catch (Exception ex)
        {
            Log.Debug(ex, "Backend ping failed");
            return false;
        }
    }

    // ---------------------- Helpers --------------------------------------

    private static PrimusCommand ParseCommand(JsonElement element)
    {
        return new PrimusCommand
        {
            Id = element.TryGetProperty("id", out var id) && id.ValueKind == JsonValueKind.Number ? id.GetInt64() : 0,
            Command = element.TryGetProperty("command", out var c) ? c.GetString() ?? string.Empty : string.Empty,
            Params = element.TryGetProperty("params", out var p) && p.ValueKind != JsonValueKind.Null ? p.GetString() : null,
            IssuedAtUtc = element.TryGetProperty("issued_at", out var ia) && ia.TryGetDateTime(out var dt) ? dt : DateTime.UtcNow,
            ExpiresAtUtc = element.TryGetProperty("expires_at", out var ea) && ea.ValueKind != JsonValueKind.Null && ea.TryGetDateTime(out var exp) ? exp : null,
        };
    }

    private static async Task EnsureSuccessAsync(HttpResponseMessage resp, string label, CancellationToken cancellationToken)
    {
        if (resp.IsSuccessStatusCode)
        {
            return;
        }

        string body;
        try
        {
            body = await resp.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        }
        catch
        {
            body = "<unreadable>";
        }

        var truncated = body.Length > 512 ? body[..512] : body;
        Log.Warning("{Label} returned {Status}: {Body}", label, resp.StatusCode, truncated);
        throw new HttpRequestException($"{label} failed with {(int)resp.StatusCode} {resp.StatusCode}");
    }
}
