using Microsoft.Win32;
using PrimusKiosk.Core.Models;
using Serilog;

namespace PrimusKiosk.Core.Games;

/// <summary>
/// Local-disk scan for installed launchers and games. Mirrors the Tauri
/// <c>detect_installed_games</c> command: walks Steam's <c>appmanifest_*.acf</c>
/// files, Epic's <c>InstallationList.json</c>, and common Uninstall registry keys.
/// </summary>
public sealed class GameRegistryScanner
{
    public async Task<IReadOnlyList<GameDto>> ScanAsync(CancellationToken cancellationToken)
    {
        var results = new List<GameDto>();

        await Task.WhenAll(
            Task.Run(() => results.AddRange(ScanSteam()), cancellationToken),
            Task.Run(() => results.AddRange(ScanEpic()), cancellationToken),
            Task.Run(() => results.AddRange(ScanUninstallKeys()), cancellationToken)
        ).ConfigureAwait(false);

        // De-dup by name (case-insensitive) keeping the first launcher-specific path.
        return results
            .GroupBy(g => g.Name, StringComparer.OrdinalIgnoreCase)
            .Select(g => g.First())
            .OrderBy(g => g.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    // ---------------- Steam --------------------------------------------

    private IEnumerable<GameDto> ScanSteam()
    {
        var roots = new List<string>();
        try
        {
            using var key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Wow6432Node\Valve\Steam")
                           ?? Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Valve\Steam");
            var installPath = key?.GetValue("InstallPath") as string;
            if (!string.IsNullOrWhiteSpace(installPath))
            {
                roots.Add(Path.Combine(installPath, "steamapps"));
                foreach (var extra in EnumerateSteamLibraryFolders(Path.Combine(installPath, "steamapps", "libraryfolders.vdf")))
                {
                    roots.Add(Path.Combine(extra, "steamapps"));
                }
            }
        }
        catch (Exception ex)
        {
            Log.Debug(ex, "Steam registry probe failed.");
        }

        foreach (var root in roots.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (!Directory.Exists(root)) continue;

            foreach (var acf in SafeEnumerateFiles(root, "appmanifest_*.acf"))
            {
                GameDto? dto = TryParseSteamManifest(acf, root);
                if (dto is not null)
                {
                    yield return dto;
                }
            }
        }
    }

    private static IEnumerable<string> EnumerateSteamLibraryFolders(string vdfPath)
    {
        if (!File.Exists(vdfPath)) yield break;

        string[] lines;
        try { lines = File.ReadAllLines(vdfPath); } catch { yield break; }

        foreach (var line in lines)
        {
            var trimmed = line.Trim();
            // Lines look like:   "path"   "C:\\SteamLibrary"
            if (!trimmed.StartsWith("\"path\"", StringComparison.OrdinalIgnoreCase)) continue;

            var firstQuote = trimmed.IndexOf('"', 6);
            if (firstQuote < 0) continue;
            var secondQuote = trimmed.IndexOf('"', firstQuote + 1);
            if (secondQuote < 0) continue;

            yield return trimmed.Substring(firstQuote + 1, secondQuote - firstQuote - 1).Replace(@"\\", @"\");
        }
    }

    private static GameDto? TryParseSteamManifest(string acfPath, string steamAppsRoot)
    {
        try
        {
            string[] lines = File.ReadAllLines(acfPath);
            string? name = null;
            string? installDir = null;

            foreach (var line in lines)
            {
                var t = line.Trim();
                if (t.StartsWith("\"name\"", StringComparison.OrdinalIgnoreCase)) name = Extract(t);
                else if (t.StartsWith("\"installdir\"", StringComparison.OrdinalIgnoreCase)) installDir = Extract(t);
            }

            if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(installDir))
            {
                return null;
            }

            var commonPath = Path.Combine(steamAppsRoot, "common", installDir!);
            var exe = Directory.Exists(commonPath)
                ? Directory.EnumerateFiles(commonPath, "*.exe", SearchOption.TopDirectoryOnly).FirstOrDefault()
                : null;

            return new GameDto
            {
                Name = name!,
                Category = "Steam",
                ExecutablePath = exe,
                Enabled = exe is not null,
            };
        }
        catch (Exception ex)
        {
            Log.Debug(ex, "Failed to parse Steam manifest {Path}", acfPath);
            return null;
        }

        static string? Extract(string line)
        {
            var firstQuote = line.IndexOf('"');
            if (firstQuote < 0) return null;
            var secondQuote = line.IndexOf('"', firstQuote + 1);
            if (secondQuote < 0) return null;
            var thirdQuote = line.IndexOf('"', secondQuote + 1);
            if (thirdQuote < 0) return null;
            var fourthQuote = line.IndexOf('"', thirdQuote + 1);
            if (fourthQuote < 0) return null;
            return line.Substring(thirdQuote + 1, fourthQuote - thirdQuote - 1);
        }
    }

    // ---------------- Epic ---------------------------------------------

    private IEnumerable<GameDto> ScanEpic()
    {
        var programData = Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData);
        var manifests = Path.Combine(programData, "Epic", "EpicGamesLauncher", "Data", "Manifests");

        if (!Directory.Exists(manifests))
        {
            yield break;
        }

        foreach (var file in SafeEnumerateFiles(manifests, "*.item"))
        {
            GameDto? dto = null;
            try
            {
                var json = File.ReadAllText(file);
                using var doc = System.Text.Json.JsonDocument.Parse(json);
                var root = doc.RootElement;
                var name = root.TryGetProperty("DisplayName", out var n) ? n.GetString() : null;
                var install = root.TryGetProperty("InstallLocation", out var il) ? il.GetString() : null;
                var launch = root.TryGetProperty("LaunchExecutable", out var le) ? le.GetString() : null;

                if (!string.IsNullOrWhiteSpace(name))
                {
                    var exe = (!string.IsNullOrWhiteSpace(install) && !string.IsNullOrWhiteSpace(launch))
                        ? Path.Combine(install!, launch!)
                        : null;

                    dto = new GameDto
                    {
                        Name = name!,
                        Category = "Epic",
                        ExecutablePath = exe,
                        Enabled = exe is not null && File.Exists(exe),
                    };
                }
            }
            catch (Exception ex)
            {
                Log.Debug(ex, "Failed to parse Epic manifest {Path}", file);
            }

            if (dto is not null) yield return dto;
        }
    }

    // ---------------- Uninstall registry keys --------------------------

    private IEnumerable<GameDto> ScanUninstallKeys()
    {
        var paths = new[]
        {
            (RegistryHive.LocalMachine, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
            (RegistryHive.LocalMachine, @"SOFTWARE\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
            (RegistryHive.CurrentUser,  @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        };

        var interesting = new[] { "riot", "origin", "ea games", "ubisoft", "battle.net", "blizzard", "gog", "xbox", "minecraft", "rockstar" };

        foreach (var (hive, path) in paths)
        {
            RegistryKey? root = null;
            try
            {
                root = RegistryKey.OpenBaseKey(hive, RegistryView.Default).OpenSubKey(path);
                if (root is null) continue;

                foreach (var subName in root.GetSubKeyNames())
                {
                    using var sub = root.OpenSubKey(subName);
                    if (sub is null) continue;

                    var display = sub.GetValue("DisplayName") as string;
                    var installLoc = sub.GetValue("InstallLocation") as string;
                    var displayIcon = sub.GetValue("DisplayIcon") as string;

                    if (string.IsNullOrWhiteSpace(display)) continue;
                    if (!interesting.Any(k => display.Contains(k, StringComparison.OrdinalIgnoreCase))) continue;

                    string? exe = null;
                    if (!string.IsNullOrWhiteSpace(displayIcon) && File.Exists(displayIcon.Trim('"')))
                    {
                        exe = displayIcon.Trim('"');
                    }
                    else if (!string.IsNullOrWhiteSpace(installLoc) && Directory.Exists(installLoc))
                    {
                        exe = Directory.EnumerateFiles(installLoc, "*.exe", SearchOption.TopDirectoryOnly).FirstOrDefault();
                    }

                    yield return new GameDto
                    {
                        Name = display!,
                        Category = "Local",
                        ExecutablePath = exe,
                        Enabled = exe is not null && File.Exists(exe),
                    };
                }
            }
            finally
            {
                root?.Dispose();
            }
        }
    }

    private static IEnumerable<string> SafeEnumerateFiles(string path, string pattern)
    {
        try { return Directory.EnumerateFiles(path, pattern, SearchOption.TopDirectoryOnly); }
        catch { return Array.Empty<string>(); }
    }
}
