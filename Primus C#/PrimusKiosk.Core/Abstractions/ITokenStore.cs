using PrimusKiosk.Core.Models;

namespace PrimusKiosk.Core.Abstractions;

public interface ITokenStore
{
    Task<TokenBundle?> LoadAsync(CancellationToken cancellationToken);
    Task SaveAsync(TokenBundle tokens, CancellationToken cancellationToken);
    Task ClearAsync(CancellationToken cancellationToken);
}
