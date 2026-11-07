; RoleBox 的 Inno Setup 打包脚本（DESIGN 14.12-1）。
;
; 用法：
;   1) pnpm tauri build          -> 产出 src-tauri\target\release\rolebox.exe
;   2) iscc installer.iss        -> 产物在 app\dist\RoleBox-Setup-<版本>.exe
;
; 只打包 exe 与图标。用户数据在 %APPDATA%\RoleBox\（数据库、设置），
; 卸载时刻意不删除，避免误删用户的会话与角色。

#define MyAppName "RoleBox"
#define MyAppVersion "0.1.0"
#define MyAppPublisher "RoleBox"
#define MyAppExeName "rolebox.exe"

[Setup]
AppId={{3C7E1A5B-9D24-4F86-9A31-5E8B2C7D4F10}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
OutputDir=dist
OutputBaseFilename=RoleBox-Setup-{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\{#MyAppExeName}
SetupIconFile=src-tauri\icons\icon.ico

[Languages]
Name: "chinesesimplified"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "src-tauri\target\release\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "src-tauri\icons\icon.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
