using PrimusKiosk.Core.Http.ApiContracts;
using PrimusKiosk.Core.Models;

namespace PrimusKiosk.Core.Abstractions;

/// <summary>
/// Thin, typed wrapper around the FastAPI surface. Implementations MUST be thread-safe
/// and handle transient failures via the HTTP pipeline (Polly + AuthHandler + HmacSigningHandler).
/// </summary>
public interface IPrimusApiClient
{
    // --- Auth -----------------------------------------------------------
    Task<TokenBundle> LoginAsync(string email, string password, CancellationToken cancellationToken);
    Task<TokenBundle> RefreshAsync(string refreshToken, CancellationToken cancellationToken);
    Task LogoutAsync(CancellationToken cancellationToken);
    Task<UserDto> GetMeAsync(CancellationToken cancellationToken);

    // --- Device ---------------------------------------------------------
    Task<DeviceCredentials> RegisterPcAsync(DeviceRegistrationRequest request, CancellationToken cancellationToken);
    Task<HeartbeatResponse> HeartbeatAsync(HeartbeatRequest request, CancellationToken cancellationToken);

    // --- Session --------------------------------------------------------
    Task<SessionDto> StartSessionAsync(long gameId, CancellationToken cancellationToken);
    Task StopSessionAsync(long sessionId, CancellationToken cancellationToken);
    Task<SessionDto?> GetCurrentSessionAsync(CancellationToken cancellationToken);

    // --- Wallet ---------------------------------------------------------
    Task<WalletDto> GetWalletBalanceAsync(CancellationToken cancellationToken);

    /// <summary>
    /// Phase 1 paywall gate. Returns true when the signed-in customer holds an
    /// active (non-zero) time package. The kiosk host calls this before
    /// spawning any external process (game / app) to refuse the launch when
    /// the customer is paywalled. The React UI uses the same endpoint via
    /// the JS fetch path. Fails OPEN on any error (returning true) so a
    /// backend hiccup doesn't lock customers out of games they paid for.
    /// </summary>
    Task<bool> HasActivePackageAsync(CancellationToken cancellationToken);

    // --- Games ----------------------------------------------------------
    Task<IReadOnlyList<GameDto>> ListGamesAsync(CancellationToken cancellationToken);

    // --- Chat -----------------------------------------------------------
    Task<IReadOnlyList<ChatMessageDto>> GetChatHistoryAsync(int limit, CancellationToken cancellationToken);
    Task SendChatMessageAsync(string body, CancellationToken cancellationToken);

    // --- Announcements --------------------------------------------------
    Task<IReadOnlyList<AnnouncementDto>> ListAnnouncementsAsync(CancellationToken cancellationToken);

    // --- Commands (long-poll fallback) ----------------------------------
    Task<IReadOnlyList<PrimusCommand>> PullCommandsAsync(int timeoutSeconds, CancellationToken cancellationToken);
    Task AckCommandAsync(CommandAck ack, CancellationToken cancellationToken);

    // --- Screenshots ----------------------------------------------------
    Task<string> UploadScreenshotAsync(Stream pngContent, string fileName, CancellationToken cancellationToken);

    // --- Health ---------------------------------------------------------
    Task<bool> PingAsync(CancellationToken cancellationToken);
}
