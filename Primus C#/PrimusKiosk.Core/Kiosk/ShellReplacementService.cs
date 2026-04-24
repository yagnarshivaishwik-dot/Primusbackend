using System.Diagnostics;
using System.Security.Principal;
using Microsoft.Win32;
using PrimusKiosk.Core.Abstractions;
using Serilog;

namespace PrimusKiosk.Core.Kiosk;

/// <summary>
/// Registry-backed shell-replacement implementation for Windows kiosks.
///
/// Reads/writes <c>HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon\Shell</c>.
/// The machine-wide (HKLM) key overrides the per-user default, so it applies
/// to every interactive logon — the right behaviour for a dedicated kiosk PC.
///
/// Falls back cleanly (no throw) when admin rights are missing so UI callers
/// can detect and surface the situation.
/// </summary>
public sealed class ShellReplacementService : IShellReplacementService
{
    private const string WinlogonPath =
        @"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon";
    private const string ShellValueName = "Shell";
    private const string DefaultShell = "explorer.exe";

    public ShellReplacementStatus GetStatus()
    {
        var thisAppPath = ResolveThisAppPath();
        var hasAdmin    = CurrentProcessIsAdmin();
        string? current = null;
        string? error   = null;

        try
        {
            using var key = Registry.LocalMachine.OpenSubKey(WinlogonPath, writable: false);
            current = key?.GetValue(ShellValueName) as string;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            Log.Warning(ex, "Shell-replacement: failed to read Winlogon\\Shell.");
        }

        var isReplaced =
            !string.IsNullOrEmpty(current) &&
            !string.Equals(Path.GetFileName(current), DefaultShell,
                StringComparison.OrdinalIgnoreCase);

        return new ShellReplacementStatus(isReplaced, current, thisAppPath, hasAdmin, error);
    }

    public ShellReplacementStatus Enable()
    {
        var thisAppPath = ResolveThisAppPath();
        if (!CurrentProcessIsAdmin())
        {
            Log.Warning(
                "Shell-replacement Enable requested without admin rights; install the .reg file from an elevated shell or relaunch as admin.");
            return GetStatus() with { LastError = "Administrator rights required." };
        }

        try
        {
            using var key = Registry.LocalMachine.OpenSubKey(WinlogonPath, writable: true)
                           ?? Registry.LocalMachine.CreateSubKey(WinlogonPath, writable: true);

            if (key is null)
            {
                return GetStatus() with { LastError = "Could not open Winlogon registry key." };
            }

            key.SetValue(ShellValueName, thisAppPath, RegistryValueKind.String);
            Log.Information("Shell replacement enabled: Winlogon\\Shell -> {Path}", thisAppPath);
            return GetStatus();
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Shell-replacement Enable failed.");
            return GetStatus() with { LastError = ex.Message };
        }
    }

    public ShellReplacementStatus Disable()
    {
        if (!CurrentProcessIsAdmin())
        {
            Log.Warning(
                "Shell-replacement Disable requested without admin rights; apply restore-explorer-shell.reg from an elevated shell instead.");
            return GetStatus() with { LastError = "Administrator rights required." };
        }

        try
        {
            using var key = Registry.LocalMachine.OpenSubKey(WinlogonPath, writable: true);
            if (key is null)
            {
                return GetStatus() with { LastError = "Could not open Winlogon registry key." };
            }

            key.SetValue(ShellValueName, DefaultShell, RegistryValueKind.String);
            Log.Information("Shell replacement disabled: Winlogon\\Shell -> {Path}", DefaultShell);
            return GetStatus();
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Shell-replacement Disable failed.");
            return GetStatus() with { LastError = ex.Message };
        }
    }

    private static bool CurrentProcessIsAdmin()
    {
        try
        {
            using var identity = WindowsIdentity.GetCurrent();
            var principal = new WindowsPrincipal(identity);
            return principal.IsInRole(WindowsBuiltInRole.Administrator);
        }
        catch
        {
            return false;
        }
    }

    private static string ResolveThisAppPath()
    {
        // Prefer the main module's filename (resolves to the .exe even for
        // single-file published apps); fall back to MainModule path reflection.
        try
        {
            var proc = Process.GetCurrentProcess();
            var file = proc.MainModule?.FileName;
            if (!string.IsNullOrEmpty(file)) return file;
        }
        catch { /* ignored */ }

        return Environment.ProcessPath
               ?? Path.Combine(AppContext.BaseDirectory, "PrimusClient.exe");
    }
}
