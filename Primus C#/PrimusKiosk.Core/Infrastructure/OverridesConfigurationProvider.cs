using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Configuration.Json;

namespace PrimusKiosk.Core.Infrastructure;

/// <summary>
/// Loads runtime-writable overrides from <c>%ProgramData%\PrimusKiosk\overrides.json</c>.
/// The file is DPAPI-wrapped on disk; this provider transparently unwraps it before
/// exposing keys to <see cref="IConfiguration"/>.
/// </summary>
public sealed class OverridesJsonConfigurationSource : IConfigurationSource
{
    public string FilePath { get; init; } = PrimusPaths.OverridesFilePath;

    public IConfigurationProvider Build(IConfigurationBuilder builder) =>
        new OverridesJsonConfigurationProvider(this);
}

internal sealed class OverridesJsonConfigurationProvider : JsonConfigurationProvider
{
    private readonly OverridesJsonConfigurationSource _customSource;

    public OverridesJsonConfigurationProvider(OverridesJsonConfigurationSource source)
        : base(new JsonConfigurationSource { Path = source.FilePath, Optional = true, ReloadOnChange = false })
    {
        _customSource = source;
    }

    public override void Load()
    {
        if (!File.Exists(_customSource.FilePath))
        {
            Data = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
            return;
        }

        try
        {
            var raw = File.ReadAllText(_customSource.FilePath);
            var json = raw.StartsWith('{') ? raw : DpapiProtector.Unprotect(raw);

            if (string.IsNullOrWhiteSpace(json))
            {
                Data = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
                return;
            }

            using var stream = new MemoryStream(System.Text.Encoding.UTF8.GetBytes(json));
            Load(stream);
        }
        catch (JsonException)
        {
            Data = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        }
    }

    public static void Write(IDictionary<string, object?> overrides)
    {
        PrimusPaths.EnsureDirectories();
        var json = JsonSerializer.Serialize(overrides, new JsonSerializerOptions { WriteIndented = true });
        var ciphertext = DpapiProtector.Protect(json);
        File.WriteAllText(PrimusPaths.OverridesFilePath, ciphertext);
    }
}

public static class OverridesWriter
{
    /// <summary>
    /// Persists override key/value pairs to <c>%ProgramData%\PrimusKiosk\overrides.json</c>,
    /// DPAPI-encrypted. Keys should be in IConfiguration colon notation, e.g. "Primus:ApiBaseUrl".
    /// </summary>
    public static void Save(IDictionary<string, object?> overrides)
        => OverridesJsonConfigurationProvider.Write(overrides);
}
