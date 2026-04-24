; ============================================================================
;  Primus Client — Inno Setup installer script
; ============================================================================
;  Build with:
;      ISCC primus-client.iss
;  Or just run:
;      pwsh ..\build-installer.ps1
;
;  Publish artifacts are expected under  ..\app\
;  Installer output lands in             .\output\
;
;  Flow covered:
;   - Install   — populates C:\Program Files\Primus\ + C:\ProgramData\Primus\
;   - Upgrade   — same AppId replaces the existing install, preserves ProgramData
;   - Uninstall — removes install dir and autostart entry; optionally keeps ProgramData
;   - Silent    — `PrimusInstaller-1.0.0.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART`
; ============================================================================

#define AppName       "Primus Client"
#define AppPublisher  "Primus Technologies"
; AppVersion is overridden by build-installer.ps1 via `ISCC /DAppVersion=1.0.2 ...`.
; The default here only matters for raw `ISCC primus-client.iss` invocations.
#ifndef AppVersion
  #define AppVersion  "1.0.0"
#endif
#define AppId         "{{A1B2C3D4-5E6F-4890-A1B2-C3D4E5F67890}"
#define AppExeName    "PrimusClient.exe"
#define AppUrl        "https://primustech.in"
#define SupportUrl    "https://primustech.in/support"

[Setup]
AppId={#AppId}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppUrl}
AppSupportURL={#SupportUrl}
AppUpdatesURL={#AppUrl}
VersionInfoVersion={#AppVersion}
VersionInfoProductVersion={#AppVersion}
VersionInfoProductName={#AppName}

DefaultDirName={autopf}\Primus
DefaultGroupName={#AppName}
DisableDirPage=auto
DisableProgramGroupPage=yes

; Per-machine install (required for Program Files + HKLM + cyber-cafe deployment)
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=commandline

UninstallDisplayIcon={app}\{#AppExeName}
UninstallDisplayName={#AppName}
UninstallFilesDir={app}\uninstall

OutputDir=output
OutputBaseFilename=PrimusInstaller-{#AppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
LZMAUseSeparateProcess=yes
WizardStyle=modern
AllowNoIcons=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UsedUserAreasWarning=no
MinVersion=10.0

; Upgrade support: same AppId + ClosingApplications closes any running instance cleanly.
CloseApplications=force
RestartApplications=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon";   Description: "Create a &Desktop shortcut";            GroupDescription: "Additional shortcuts:"
Name: "autostart";     Description: "Launch &Primus Client automatically at logon"; GroupDescription: "Startup options:"
Name: "kiosklockdown"; Description: "Enable &full kiosk lockdown (replace Windows shell)"; GroupDescription: "Cyber-cafe / kiosk mode (advanced):"; Flags: unchecked

[Dirs]
; Install-tree (Program Files\Primus)
Name: "{app}";                     Permissions: users-readexec
Name: "{app}\config";              Permissions: users-readexec
Name: "{app}\assets";               Permissions: users-readexec
Name: "{app}\runtime";              Permissions: users-readexec
Name: "{app}\web";                  Permissions: users-readexec
Name: "{app}\web\assets";           Permissions: users-readexec
; Seed-only — real runtime logs + data live under %ProgramData%\Primus.
Name: "{app}\logs";                  Permissions: users-readexec
Name: "{app}\data";                  Permissions: users-readexec

; Writable runtime tree (ProgramData\Primus) — all kiosks read/write here.
Name: "{commonappdata}\Primus";             Permissions: users-modify
Name: "{commonappdata}\Primus\logs";        Permissions: users-modify
Name: "{commonappdata}\Primus\data";        Permissions: users-modify
Name: "{commonappdata}\Primus\crashes";     Permissions: users-modify
Name: "{commonappdata}\Primus\cache";       Permissions: users-modify
Name: "{commonappdata}\Primus\sessions";    Permissions: users-modify
Name: "{commonappdata}\Primus\recovery";    Permissions: users-readexec

[Files]
; --- Main executable ---------------------------------------------------------
Source: "..\app\PrimusClient.exe";        DestDir: "{app}";         Flags: ignoreversion

; --- Default config shipped under {app}\config ------------------------------
Source: "..\app\appsettings.json";              DestDir: "{app}\config"; Flags: ignoreversion
Source: "..\app\appsettings.Production.json";   DestDir: "{app}\config"; Flags: ignoreversion
Source: "..\app\appsettings.Development.json";  DestDir: "{app}\config"; Flags: ignoreversion

; --- React UI (WebView2 virtual host serves this as https://primus.local/) ----
; build-installer.ps1 stages PrimusClient/dist/ → Primus C#/web/ before calling ISCC.
Source: "..\web\index.html";            DestDir: "{app}\web";        Flags: ignoreversion
Source: "..\web\assets\*";              DestDir: "{app}\web\assets"; Flags: ignoreversion recursesubdirs createallsubdirs

; --- Assets folder marker ---------------------------------------------------
Source: "assets\README.txt";  DestDir: "{app}\assets"; Flags: ignoreversion

; --- Recovery scripts (for shell-replacement rollback) ----------------------
Source: "recovery\unkiosk.reg";       DestDir: "{commonappdata}\Primus\recovery"; Flags: ignoreversion
Source: "recovery\restore-shell.ps1"; DestDir: "{commonappdata}\Primus\recovery"; Flags: ignoreversion

[Icons]
; Start Menu
Name: "{group}\{#AppName}";                 Filename: "{app}\{#AppExeName}"; WorkingDir: "{app}"
Name: "{group}\{#AppName} (Kiosk mode)";    Filename: "{app}\{#AppExeName}"; Parameters: "--kiosk"; WorkingDir: "{app}"; Comment: "Launch with kiosk hardening enabled"
Name: "{group}\Restore Windows shell";      Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{commonappdata}\Primus\recovery\restore-shell.ps1"""; Comment: "Undo kiosk shell replacement"
Name: "{group}\Uninstall {#AppName}";       Filename: "{uninstallexe}"

; Desktop (conditional)
Name: "{autodesktop}\{#AppName}";           Filename: "{app}\{#AppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon

[Registry]
; Auto-boot at user logon (HKCU\Run — no elevation needed to run).
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "PrimusClient"; ValueData: """{app}\{#AppExeName}"""; Flags: uninsdeletevalue; Tasks: autostart

; Optional shell replacement (replaces explorer.exe until unkiosk.reg runs).
Root: HKLM; Subkey: "SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"; ValueType: string; ValueName: "Shell"; ValueData: """{app}\{#AppExeName}"""; Flags: uninsdeletevalue; Tasks: kiosklockdown

; Install metadata used by our app (exposes install dir for logging / auto-update).
Root: HKLM; Subkey: "SOFTWARE\PrimusTech\PrimusClient"; ValueType: string; ValueName: "InstallPath";    ValueData: "{app}"; Flags: uninsdeletekeyifempty uninsdeletevalue
Root: HKLM; Subkey: "SOFTWARE\PrimusTech\PrimusClient"; ValueType: string; ValueName: "Version";        ValueData: "{#AppVersion}"; Flags: uninsdeletekeyifempty uninsdeletevalue
Root: HKLM; Subkey: "SOFTWARE\PrimusTech\PrimusClient"; ValueType: string; ValueName: "ConfigPath";     ValueData: "{app}\config"; Flags: uninsdeletekeyifempty uninsdeletevalue
Root: HKLM; Subkey: "SOFTWARE\PrimusTech\PrimusClient"; ValueType: string; ValueName: "DataPath";       ValueData: "{commonappdata}\Primus"; Flags: uninsdeletekeyifempty uninsdeletevalue

[Run]
; Post-install: launch the app immediately unless running silent.
Filename: "{app}\{#AppExeName}"; Description: "Launch {#AppName} now"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; Best-effort: import the recovery registry file so uninstalling a kiosk-mode install
; doesn't leave the user locked out of Explorer.
Filename: "reg.exe"; Parameters: "import ""{commonappdata}\Primus\recovery\unkiosk.reg"""; Flags: runhidden; RunOnceId: "PrimusRestoreShell"

[UninstallDelete]
; Keep ProgramData\Primus (logs, data, device.bin, etc.) by default so a re-install
; retains the device registration. Only the install-tree logs scratch dir is removed.
Type: filesandordirs; Name: "{app}\logs"
Type: filesandordirs; Name: "{app}\uninstall"

[Code]
// ---- WebView2 Evergreen runtime detection ----------------------------------
// WebView2 is pre-installed on Windows 11 and Windows 10 with Edge.
// We warn (not block) if neither the system-wide nor per-user runtime is found.
function WebView2IsInstalled(): Boolean;
var
  ver: string;
begin
  // System-wide (Edge / Windows Update path)
  if RegQueryStringValue(HKLM,
      'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
      'pv', ver) then
  begin
    Result := (ver <> '') and (ver <> '0.0.0.0');
    Exit;
  end;
  // Per-user installation
  if RegQueryStringValue(HKCU,
      'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
      'pv', ver) then
  begin
    Result := (ver <> '') and (ver <> '0.0.0.0');
    Exit;
  end;
  Result := False;
end;

function InitializeSetup(): Boolean;
begin
  Result := True;
  if not WebView2IsInstalled() then
  begin
    if MsgBox(
        'Microsoft Edge WebView2 Runtime is not detected on this computer.' + #13#10 +
        'Primus Client requires it to display its interface.' + #13#10 + #13#10 +
        'You can download it from:' + #13#10 +
        'https://developer.microsoft.com/en-us/microsoft-edge/webview2/' + #13#10 + #13#10 +
        'Continue installing anyway?',
        mbConfirmation, MB_YESNO) = IDNO then
      Result := False;
  end;
end;

// ---- Version detection for clean upgrade over old folder layouts -----------
function GetInstalledVersion(): string;
var
  v: string;
begin
  Result := '';
  if RegQueryStringValue(HKLM, 'SOFTWARE\PrimusTech\PrimusClient', 'Version', v) then
    Result := v;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  installedVersion: string;
begin
  if CurStep = ssInstall then
  begin
    installedVersion := GetInstalledVersion();
    if installedVersion <> '' then
      Log('Upgrading Primus Client from ' + installedVersion + ' to ' + '{#AppVersion}');
  end;
end;
