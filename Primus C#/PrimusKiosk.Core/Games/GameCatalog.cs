using PrimusKiosk.Core.Abstractions;
using PrimusKiosk.Core.Models;
using Serilog;

namespace PrimusKiosk.Core.Games;

/// <summary>
/// Union of the backend's authoritative game list and locally-detected games
/// (Steam / Epic / Uninstall-registry entries). The backend entry wins when the same
/// game name is present in both — so admins can override executable paths remotely.
/// </summary>
public sealed class GameCatalog : IGameCatalog
{
    private readonly IPrimusApiClient _api;
    private readonly GameRegistryScanner _scanner;

    public GameCatalog(IPrimusApiClient api, GameRegistryScanner scanner)
    {
        _api = api;
        _scanner = scanner;
    }

    public async Task<IReadOnlyList<GameDto>> GetGamesAsync(CancellationToken cancellationToken)
    {
        var backendTask = SafeAsync(() => _api.ListGamesAsync(cancellationToken), "backend game list");
        var localTask = SafeAsync(() => _scanner.ScanAsync(cancellationToken), "local game scan");

        await Task.WhenAll(backendTask, localTask).ConfigureAwait(false);

        var backend = await backendTask.ConfigureAwait(false) ?? Array.Empty<GameDto>();
        var local = await localTask.ConfigureAwait(false) ?? Array.Empty<GameDto>();

        var byName = new Dictionary<string, GameDto>(StringComparer.OrdinalIgnoreCase);

        foreach (var g in local)
        {
            byName[g.Name] = g;
        }

        // Backend entries overwrite matching local entries but inherit the local exe path when absent.
        foreach (var g in backend)
        {
            if (byName.TryGetValue(g.Name, out var localMatch) && string.IsNullOrWhiteSpace(g.ExecutablePath))
            {
                byName[g.Name] = g with { ExecutablePath = localMatch.ExecutablePath };
            }
            else
            {
                byName[g.Name] = g;
            }
        }

        return byName.Values
            .OrderBy(g => g.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static async Task<IReadOnlyList<GameDto>?> SafeAsync(Func<Task<IReadOnlyList<GameDto>>> fn, string label)
    {
        try
        {
            return await fn().ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            Log.Debug(ex, "GameCatalog source '{Label}' failed.", label);
            return null;
        }
    }
}
