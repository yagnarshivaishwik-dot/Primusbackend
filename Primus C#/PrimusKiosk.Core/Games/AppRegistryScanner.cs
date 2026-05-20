using Microsoft.Win32;
using PrimusKiosk.Core.Models;
using Serilog;
using System.Text.RegularExpressions;

namespace PrimusKiosk.Core.Games;

/// <summary>
/// Scans Windows Uninstall registry keys for general-purpose applications
/// (Office, browsers, productivity tools, etc.) — the things that go in
/// the kiosk's "Apps" tab rather than the Games tab.
///
/// Distinct from <see cref="GameRegistryScanner"/> which targets game
/// launchers (Steam, Epic, Riot, Battle.net…). This scanner explicitly
/// EXCLUDES those launchers so they aren't double-listed.
///
/// We aggressively filter out registry entries that look like updates,
/// runtimes, drivers, system components, etc. — without that filter, a
/// fresh Windows install yields ~200+ rows, most of which can't be
/// launched anyway.
/// </summary>
public sealed class AppRegistryScanner
{
    public Task<IReadOnlyList<GameDto>> ScanAsync(CancellationToken cancellationToken)
    {
        return Task.Run<IReadOnlyList<GameDto>>(() =>
        {
            var results = new List<GameDto>();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var (hive, view, path) in EnumerateUninstallRoots())
            {
                cancellationToken.ThrowIfCancellationRequested();
                RegistryKey? root = null;
                try
                {
                    root = RegistryKey.OpenBaseKey(hive, view).OpenSubKey(path);
                    if (root is null) continue;

                    foreach (var subName in root.GetSubKeyNames())
                    {
                        if (cancellationToken.IsCancellationRequested) break;

                        using var sub = root.OpenSubKey(subName);
                        if (sub is null) continue;

                        var dto = TryBuildAppDto(sub);
                        if (dto is null) continue;
                        if (!seen.Add(dto.Name)) continue;
                        results.Add(dto);
                    }
                }
                catch (Exception ex)
                {
                    Log.Debug(ex, "AppRegistryScanner failed for {Hive}\\{Path}", hive, path);
                }
                finally
                {
                    root?.Dispose();
                }
            }

            return results
                .OrderBy(g => g.Name, StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }, cancellationToken);
    }

    private static IEnumerable<(RegistryHive, RegistryView, string)> EnumerateUninstallRoots()
    {
        const string path = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall";
        const string wowPath = @"SOFTWARE\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall";
        // Both 64-bit and 32-bit registry views on LocalMachine, plus the
        // per-user hive. The Wow6432Node path is for 32-bit installers
        // running on 64-bit Windows.
        yield return (RegistryHive.LocalMachine, RegistryView.Registry64, path);
        yield return (RegistryHive.LocalMachine, RegistryView.Registry32, path);
        yield return (RegistryHive.LocalMachine, RegistryView.Registry64, wowPath);
        yield return (RegistryHive.CurrentUser,  RegistryView.Default,    path);
    }

    private static GameDto? TryBuildAppDto(RegistryKey sub)
    {
        var name = (sub.GetValue("DisplayName") as string)?.Trim();
        if (string.IsNullOrWhiteSpace(name)) return null;
        if (IsExcluded(name, sub)) return null;

        var exe = ResolveExecutable(sub);
        if (string.IsNullOrWhiteSpace(exe)) return null;

        return new GameDto
        {
            Name = name!,
            Category = "App",
            ExecutablePath = exe,
            Enabled = true,
        };
    }

    /// <summary>True if this registry entry is noise we shouldn't surface
    /// to the admin (drivers, runtimes, updates, system components,
    /// game launchers we already cover elsewhere, etc.).</summary>
    private static bool IsExcluded(string name, RegistryKey sub)
    {
        // System components: explicitly hidden in Add/Remove Programs.
        var systemComponent = sub.GetValue("SystemComponent") as int?;
        if (systemComponent == 1) return true;

        // Sub-updates of another product (parent key set).
        var parentKey = sub.GetValue("ParentKeyName") as string;
        if (!string.IsNullOrWhiteSpace(parentKey)) return true;

        // Windows Update / hotfix entries.
        if (UpdateRegex.IsMatch(name)) return true;

        // Runtimes, redistributables, drivers, SDKs — most users
        // shouldn't see these as launchable apps.
        if (NoisePrefixes.Any(p => name.StartsWith(p, StringComparison.OrdinalIgnoreCase))) return true;
        if (NoiseSubstrings.Any(s => name.IndexOf(s, StringComparison.OrdinalIgnoreCase) >= 0)) return true;

        // Game launchers covered by GameRegistryScanner — don't double-list.
        if (LauncherSubstrings.Any(s => name.IndexOf(s, StringComparison.OrdinalIgnoreCase) >= 0)) return true;

        return false;
    }

    private static string? ResolveExecutable(RegistryKey sub)
    {
        // DisplayIcon usually points at the app's primary .exe (and
        // optionally a `,iconIndex` suffix). It's the most reliable
        // source when present.
        var icon = sub.GetValue("DisplayIcon") as string;
        if (!string.IsNullOrWhiteSpace(icon))
        {
            var trimmed = icon.Trim().Trim('"');
            // Strip ",iconIndex" suffix if present.
            var commaIdx = trimmed.LastIndexOf(',');
            if (commaIdx > 0 && int.TryParse(trimmed[(commaIdx + 1)..].Trim(), out _))
            {
                trimmed = trimmed[..commaIdx].Trim();
            }
            if (trimmed.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) && File.Exists(trimmed))
            {
                return trimmed;
            }
        }

        // Fall back to InstallLocation + first launchable .exe (skipping
        // installer/uninstaller binaries).
        var installLoc = (sub.GetValue("InstallLocation") as string)?.Trim().Trim('"');
        if (!string.IsNullOrWhiteSpace(installLoc) && Directory.Exists(installLoc))
        {
            try
            {
                var candidates = Directory.EnumerateFiles(installLoc, "*.exe", SearchOption.TopDirectoryOnly)
                    .Where(f => !LooksLikeInstaller(Path.GetFileName(f)))
                    .ToList();
                if (candidates.Count > 0) return candidates[0];
            }
            catch (Exception ex)
            {
                Log.Debug(ex, "InstallLocation enumeration failed for {Path}", installLoc);
            }
        }

        return null;
    }

    private static bool LooksLikeInstaller(string fileName)
    {
        var lower = fileName.ToLowerInvariant();
        return lower.StartsWith("uninstall")
            || lower.StartsWith("unins000")
            || lower.StartsWith("setup")
            || lower.Contains("installer");
    }

    // Tuned heuristics — biased toward hiding noise. Easier to relax
    // later than to apologise for a 200-row list of MSI fragments.
    private static readonly Regex UpdateRegex = new(
        @"^(Update for|Security Update|Hotfix|KB\d{6,})",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly string[] NoisePrefixes =
    {
        "Microsoft Visual C++",
        "Microsoft .NET",
        "Microsoft Windows SDK",
        "Microsoft Visual Studio",   // installer/redistributables; the real Visual Studio still ends up via DisplayIcon if you really want it
        "Windows SDK",
        "Windows Driver",
        "NVIDIA Graphics Driver",
        "NVIDIA PhysX",
        "NVIDIA HD Audio",
        "Intel(R)",
        "AMD ",
        "Realtek ",
        "Synaptics",
        "PRIMUS",                    // don't list ourselves
    };

    private static readonly string[] NoiseSubstrings =
    {
        "Redistributable",
        "Runtime",
        "Driver",
        "Drivers",
        "SDK",
        "Visual C++",
        ".NET Framework",
        ".NET Runtime",
        "Help Viewer",
        "Language Pack",
        "Update Health",
    };

    // Game launchers and store fronts — surfaced by GameRegistryScanner,
    // don't show them again in the Apps list.
    private static readonly string[] LauncherSubstrings =
    {
        "Steam",
        "Epic Games",
        "Riot Client",
        "Riot Vanguard",
        "Battle.net",
        "Origin",
        "EA app",
        "EA Desktop",
        "Ubisoft Connect",
        "GOG Galaxy",
        "Rockstar Games Launcher",
        "Xbox",
    };
}
