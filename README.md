# PrinterService

Local Node.js receipt print service for the web POS.  
It exposes local HTTP endpoints, renders receipts, and prints through thermal printers.

## Runtime

- Bundled Node runtime: `node.exe` version `18.20.8`
- Service bind address: `127.0.0.1` (localhost only)
- Default port: `3001` (configurable via `.env`)

## Prerequisites

- Windows machine
- Thermal printer installed and working in Windows
- Node.js `18.20.8` recommended for local development
- Inno Setup (for building installer EXE)

## Setup For Local Development

1. Open terminal in `PrinterService`.
2. Install dependencies:

```powershell
npm install
```

3. Configure environment in `.env`:

```dotenv
PRINT_SERVER_PORT=3001
PRINTER_INTERFACE=printer:Black Copper 80
PRINTER_TYPE=EPSON
PRINT_MODE=image
LOG_LEVEL=info
```

## Run Locally (Foreground)

Start service:

```powershell
npm start
```

Expected log:

```text
Local Print Server running on http://127.0.0.1:3001
```

Health check:

```powershell
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:3001/healthz"
```

Test print request:

```powershell
$body = @{
  type = "basic"
  customerName = "Test Customer"
  employeeName = "Test Employee"
  products = @(
    @{
      name = "Test Item"
      quantity = 1
      price = 100
    }
  )
  totalAmount = 100
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Method Post `
  -Uri "http://127.0.0.1:3001/print" `
  -ContentType "application/json" `
  -Body $body
```

## Run As Windows Service

Install and start service:

```powershell
npm run install-service
```

Uninstall service:

```powershell
npm run uninstall-service
```

## Build Installer EXE (Inno Setup, CLI)

This project already includes:

- Inno script: `inno-setup-installer.iss`
- Build script: `build-installer.ps1`
- npm command: `npm run build-installer`

### 1) Install Inno Setup

Official page:

- https://jrsoftware.org/isdl.php

Optional install via winget:

```powershell
winget install --id JRSoftware.InnoSetup -e -s winget -i
```

Command-line compiler reference:

- https://jrsoftware.org/ishelp/topic_compilercmdline.htm

### 2) Compile From Terminal

From `PrinterService`:

```powershell
npm run build-installer
```

Or directly:

```powershell
powershell -ExecutionPolicy Bypass -File .\build-installer.ps1
```

If `ISCC.exe` is not in default location, set custom path:

```powershell
$env:ISCC_PATH = "C:\Path\To\ISCC.exe"
npm run build-installer
```

### 3) Output

Installer output file:

```text
.\MyPrinterServiceInstaller.exe
```

(`OutputBaseFilename=MyPrinterServiceInstaller` in `inno-setup-installer.iss`)

## Install Built EXE

Run `MyPrinterServiceInstaller.exe`.  
During install, it runs `service-install.js` and registers the Windows service.

On uninstall, it runs `service-uninstall.js` and removes the service.

## Notes

- `node.exe` is packaged with the installer, so end-users do not need to install Node separately.
- `.env` is included in the installer. Set production printer values before building.
- Queue persistence files are in the app directory (`queue.json`, `dead-letter.json`).

## Troubleshooting

- `ISCC.exe not found`: Install Inno Setup or set `ISCC_PATH`.
- Service not printing: verify `PRINTER_INTERFACE` matches exact Windows printer name.
- API unreachable from another machine: expected behavior; service listens on `127.0.0.1` only.
