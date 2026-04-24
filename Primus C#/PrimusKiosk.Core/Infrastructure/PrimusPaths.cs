using System.IO;

namespace PrimusKiosk.Core.Infrastructure;

/// <summary>
/// Canonical filesystem paths used by the kiosk. Two trees are in play in a standard install:
///
///   %ProgramFiles%\Primus\                (read-only, installer-managed)
///     ├─ PrimusClient.exe
///     ├─ config\                           (shipped appsettings.*.json defaults)
///     ├─ assets\                           (marker — assets are embedded in the exe)
///     ├─ logs\                             (symlink/marker — runtime logs live in ProgramData)
///     ├─ runtime\                          (runtime extras if any)
///     └─ data\                             (marker — runtime data lives in ProgramData)
///
///   %ProgramData%\Primus\                 (runtime, writable, survives re-installs)
///     ├─ logs\                             (Serilog rolling files)
///     ├─ crashes\                          (CrashReporter dumps)
///     ├─ recovery\                         (unkiosk.reg + restore-shell.ps1)
///     ├─ data\                             (kiosk.sqlite offline queue, analytics state)
///     ├─ cache\                            (transient fetches)
///     ├─ sessions\                         (per-session artefacts)
///     ├─ device.bin                        (DPAPI-wrapped license + HMAC secret)
///     ├─ token.bin                         (DPAPI-wrapped access + refresh token)
///     ├─ machine-id.txt                    (stable GUID generated on first run)
///     └─ overrides.json                    (DPAPI-wrapped ApiBaseUrl override)
///
/// Tests set <see cref="RootOverride"/> to point at a temp directory.
/// </summary>
public static class PrimusPaths
{
    private const string ProductFolderName = "Primus";

    /// <summary>When set (tests only), overrides the default %ProgramData%\Primus root.</summary>
    public static string? RootOverride { get; set; }

    /// <summary>%ProgramData%\Primus — writable runtime tree.</summary>
    public static string DataRoot =>
        RootOverride ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            ProductFolderName);

    /// <summary>%ProgramFiles%\Primus — installer-managed read-only tree.</summary>
    public static string InstallRoot =>
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            ProductFolderName);

    /// <summary>Directory the exe actually runs from (works even when installed under a custom root).</summary>
    public static string ExeDirectory => AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);

    /// <summary>Default config directory beside the exe (installer copies appsettings*.json here).</summary>
    public static string ExeConfigDirectory => Path.Combine(ExeDirectory, "config");

    // --- Writable runtime subdirectories (under ProgramData) -------------

    public static string LogsDirectory     => Path.Combine(DataRoot, "logs");
    public static string CrashDirectory    => Path.Combine(DataRoot, "crashes");
    public static string RecoveryDirectory => Path.Combine(DataRoot, "recovery");
    public static string DataDirectory     => Path.Combine(DataRoot, "data");
    public static string CacheDirectory    => Path.Combine(DataRoot, "cache");
    public static string SessionsDirectory => Path.Combine(DataRoot, "sessions");

    public static string QueueDatabasePath      => Path.Combine(DataDirectory, "kiosk.sqlite");
    public static string OverridesFilePath      => Path.Combine(DataRoot, "overrides.json");
    public static string DeviceCredentialsPath  => Path.Combine(DataRoot, "device.bin");
    public static string TokenStoragePath       => Path.Combine(DataRoot, "token.bin");
    public static string MachineIdPath          => Path.Combine(DataRoot, "machine-id.txt");
    public static string UnkioskRegistryPath    => Path.Combine(RecoveryDirectory, "unkiosk.reg");

    /// <summary>Idempotent. Creates the ProgramData tree used by the running app.</summary>
    public static void EnsureDirectories()
    {
        Directory.CreateDirectory(DataRoot);
        Directory.CreateDirectory(LogsDirectory);
        Directory.CreateDirectory(CrashDirectory);
        Directory.CreateDirectory(RecoveryDirectory);
        Directory.CreateDirectory(DataDirectory);
        Directory.CreateDirectory(CacheDirectory);
        Directory.CreateDirectory(SessionsDirectory);
    }

    /// <summary>Locate an appsettings file by probing each known config location.</summary>
    /// <returns>Absolute path, or null if not found.</returns>
    public static string? FindConfigFile(string fileName)
    {
        // 1. Side-by-side with the exe (single-file publish puts them here)
        var sameDir = Path.Combine(ExeDirectory, fileName);
        if (File.Exists(sameDir)) return sameDir;

        // 2. config/ subfolder next to the exe (matches the Program Files\Primus\config layout)
        var exeConfig = Path.Combine(ExeConfigDirectory, fileName);
        if (File.Exists(exeConfig)) return exeConfig;

        // 3. Program Files\Primus\config (when exe is elsewhere — e.g. development run)
        var installConfig = Path.Combine(InstallRoot, "config", fileName);
        if (File.Exists(installConfig)) return installConfig;

        return null;
    }
}
