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
