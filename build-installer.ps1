param(
  [string]$ScriptPath = "$PSScriptRoot\\inno-setup-installer.iss",
  [string]$CompilerPath
)

$ErrorActionPreference = "Stop"

if (-not $CompilerPath) {
  $candidates = @()
  if ($env:ISCC_PATH) {
    $candidates += $env:ISCC_PATH
  }
  $candidates += @(
    "C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe",
    "C:\\Program Files\\Inno Setup 6\\ISCC.exe"
  )
  $CompilerPath = $candidates |
    Where-Object { $_ -and (Test-Path -LiteralPath $_) } |
    Select-Object -First 1
}

if (-not $CompilerPath) {
  throw "ISCC.exe not found. Install Inno Setup 6 or set ISCC_PATH to the compiler path."
}

$resolvedScript = (Resolve-Path -LiteralPath $ScriptPath).Path
Write-Host "Using Inno Setup compiler: $CompilerPath"
Write-Host "Compiling installer script: $resolvedScript"

& $CompilerPath $resolvedScript
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host "Build completed."
