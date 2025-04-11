; inno-setup-installer.iss
[Setup]
AppName=MyPrinterService
AppVersion=1.0
DefaultDirName={pf}\MyPrinterService
DefaultGroupName=MyPrinterService
UninstallDisplayIcon={app}\icon.ico
OutputDir=.
OutputBaseFilename=MyPrinterServiceInstaller
Compression=lzma
SolidCompression=yes

[Files]
Source: "node.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "index.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "package.json"; DestDir: "{app}"; Flags: ignoreversion
Source: ".env"; DestDir: "{app}"; Flags: ignoreversion
Source: "config.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "service-install.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "service-uninstall.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "validator.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "printerService.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "printQueue.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "icon.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "node_modules\*"; DestDir: "{app}\node_modules"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{group}\MyPrinterService"; Filename: "{app}\node.exe"; Parameters: "index.js"

[Run]
Filename: "{app}\node.exe"; Parameters: "service-install.js"; WorkingDir: "{app}"; Flags: runhidden
