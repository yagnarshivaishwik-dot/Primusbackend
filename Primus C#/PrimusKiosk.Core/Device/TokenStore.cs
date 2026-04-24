using System.Text.Json;
using PrimusKiosk.Core.Abstractions;
using PrimusKiosk.Core.Infrastructure;
using PrimusKiosk.Core.Models;

namespace PrimusKiosk.Core.Device;

public sealed class TokenStore : ITokenStore
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    public Task<TokenBundle?> LoadAsync(CancellationToken cancellationToken)
    {
        var path = PrimusPaths.TokenStoragePath;
        if (!File.Exists(path))
        {
            return Task.FromResult<TokenBundle?>(null);
        }

        try
        {
            var ciphertext = File.ReadAllText(path);
            var plaintext = DpapiProtector.Unprotect(ciphertext);
            if (string.IsNullOrWhiteSpace(plaintext))
            {
                return Task.FromResult<TokenBundle?>(null);
            }

            return Task.FromResult(JsonSerializer.Deserialize<TokenBundle>(plaintext, JsonOptions));
        }
        catch (JsonException)
        {
            return Task.FromResult<TokenBundle?>(null);
        }
    }

    public Task SaveAsync(TokenBundle tokens, CancellationToken cancellationToken)
    {
        PrimusPaths.EnsureDirectories();
        var json = JsonSerializer.Serialize(tokens, JsonOptions);
        var ciphertext = DpapiProtector.Protect(json);
        File.WriteAllText(PrimusPaths.TokenStoragePath, ciphertext);
        return Task.CompletedTask;
    }

    public Task ClearAsync(CancellationToken cancellationToken)
    {
        var path = PrimusPaths.TokenStoragePath;
        if (File.Exists(path))
        {
            File.Delete(path);
        }
        return Task.CompletedTask;
    }
}
