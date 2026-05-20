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

        var exe = ResolveExecutable(sub, name!);
        if (string.IsNullOrWhiteSpace(exe)) return null;

        return new GameDto
        {
            Name = name!,
            Category = "App",
            ExecutablePath = exe,
            Enabled = true,
            LogoDataUri = IconExtractor.TryExtractDataUri(exe),
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

    private static string? ResolveExecutable(RegistryKey sub, string displayName)
    {
        // 1. DisplayIcon — but reject if it looks like an installer.
        //    OneDrive's DisplayIcon, for example, is OneDriveSetup.exe;
        //    launching that would re-run the installer. We catch any
        //    .exe whose filename contains "setup" / "installer" / "unins"
        //    here and fall through to InstallLocation below.
        var icon = sub.GetValue("DisplayIcon") as string;
        if (!string.IsNullOrWhiteSpace(icon))
        {
            var trimmed = icon.Trim().Trim('"');
            // Strip ",iconIndex" suffix if present (e.g. `foo.exe,0`).
            var commaIdx = trimmed.LastIndexOf(',');
            if (commaIdx > 0 && int.TryParse(trimmed[(commaIdx + 1)..].Trim(), out _))
            {
                trimmed = trimmed[..commaIdx].Trim();
            }
            if (trimmed.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)
                && !LooksLikeInstaller(Path.GetFileName(trimmed))
                && File.Exists(trimmed))
            {
                return trimmed;
            }
        }

        // 2. InstallLocation — pick the .exe whose name best matches
        //    the DisplayName. Falling back to "first .exe" is what we
        //    used to do, but on apps like OneDrive that ships a half
        //    dozen utility .exes alongside the real launcher, that
        //    picked the wrong one. Scoring by name overlap is robust
        //    enough for the common cases without being clever.
        var installLoc = (sub.GetValue("InstallLocation") as string)?.Trim().Trim('"');
        var fromInstall = PickFromDirectory(installLoc, displayName);
        if (fromInstall is not null) return fromInstall;

        // 3. InstallLocation parent — some apps (OneDrive again) put
        //    the real .exe one level above InstallLocation, which
        //    points at a versioned subdir. Walking up once usually
        //    finds the canonical launcher.
        if (!string.IsNullOrWhiteSpace(installLoc))
        {
            var parent = Path.GetDirectoryName(installLoc.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
            var fromParent = PickFromDirectory(parent, displayName);
            if (fromParent is not null) return fromParent;
        }

        return null;
    }

    private static string? PickFromDirectory(string? dir, string displayName)
    {
        if (string.IsNullOrWhiteSpace(dir) || !Directory.Exists(dir)) return null;
        try
        {
            var exes = Directory.EnumerateFiles(dir, "*.exe", SearchOption.TopDirectoryOnly)
                .Where(f => !LooksLikeInstaller(Path.GetFileName(f)))
                .ToList();
            if (exes.Count == 0) return null;

            // Score each candidate by how well its file name matches the
            // DisplayName. A .exe whose basename appears as a substring
            // of DisplayName (or vice versa) is far more likely to be the
            // real launcher than a random co-installed utility.
            var displayLower = displayName.ToLowerInvariant();
            var scored = exes.Select(f =>
            {
                var stem = Path.GetFileNameWithoutExtension(f).ToLowerInvariant();
                int score = 0;
                if (displayLower.Contains(stem) || stem.Contains(displayLower.Split(' ')[0])) score += 10;
                if (displayLower.Split(new[] { ' ', '-', '_' }, StringSplitOptions.RemoveEmptyEntries)
                                .Any(w => w.Length >= 3 && stem.Contains(w))) score += 5;
                return (Path: f, Score: score);
            }).OrderByDescending(x => x.Score).ToList();

            return scored[0].Path;
        }
        catch (Exception ex)
        {
            Log.Debug(ex, "Directory enumeration failed for {Path}", dir);
            return null;
        }
    }

    private static bool LooksLikeInstaller(string fileName)
    {
        var lower = fileName.ToLowerInvariant();
        // Strict to "starts with" was too narrow — OneDriveSetup.exe
        // slipped through. Switch to "contains" but keep the list
        // focused on installer/uninstaller-shaped names so we don't
        // accidentally exclude legitimate apps.
        return lower.Contains("uninstall")
            || lower.StartsWith("unins")     // Inno Setup-style: unins000.exe, unins001.exe
            || lower.Contains("setup")
            || lower.Contains("installer")
            || lower.Contains("updater");
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
