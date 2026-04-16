; Primus Client Installer Script for Inno Setup 6
; Creates a professional GUI installer

#define MyAppName "Primus Client"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Primus Tech"
#define MyAppURL "https://primustech.in"
#define MyAppExeName "Primus Client.exe"

[Setup]
; Installer identity
AppId={{E8F4D521-7A3B-4C5E-9F2D-8B1C6A4E3D0F}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}

; Installation settings
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
DisableProgramGroupPage=yes
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog

; Output settings
OutputDir=installer-output
OutputBaseFilename=PrimusClient-Setup
SetupIconFile=src-tauri\icons\icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}

; Compression (single file)
Compression=lzma2/ultra64
SolidCompression=yes
LZMAUseSeparateProcess=yes

; Visual settings
WizardStyle=modern
WizardSizePercent=120,120

; Single file requirement - everything embedded
; No external files needed

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: checkedonce
Name: "autostart"; Description: "Start Primus Client when Windows boots"; GroupDescription: "Startup:"; Flags: checkedonce

[Files]
; Copy all application files
Source: "electron-dist\Primus Client-win32-x64\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
; Start Menu shortcut
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
; Desktop shortcut (if selected)
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Registry]
; Auto-start on Windows boot (if selected)
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "PrimusClient"; ValueData: """{app}\{#MyAppExeName}"""; Flags: uninsdeletevalue; Tasks: autostart

[Run]
; Option to launch after installation
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Clean up app data on uninstall (optional)
Type: filesandordirs; Name: "{localappdata}\primus-client"

[Code]
// Custom code for additional validation
function InitializeSetup(): Boolean;
begin
  Result := True;
  // Additional checks can go here
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    // Post-installation tasks
    Log('Primus Client installation completed successfully.');
  end;
end;
