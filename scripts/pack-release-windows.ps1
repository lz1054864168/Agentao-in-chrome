<#
.SYNOPSIS
  Pack a Windows release for Agentao in Chrome.

.DESCRIPTION
  Produces two zips under Releases/ for distribution to Windows users:
    - agentao-chrome-host-windows.zip   (the PyInstaller-frozen native host)
    - agentao-in-chrome-extension.zip   (the Chrome extension, loadable unpacked)

  By default this also refreshes the Releases/extension/ snapshot from the
  root extension/ source folder so the distributed extension stays in sync.

.PARAMETER NoRefresh
  Skip refreshing Releases/extension/ from the root extension/ source.

.EXAMPLE
  pwsh scripts/pack-release-windows.ps1
#>
param(
    [switch]$NoRefresh
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$rel  = Join-Path $root 'Releases'
$hostDir = Join-Path $rel 'dist\agentao-chrome-host'
$extSrc  = Join-Path $root 'extension'
$extSnap = Join-Path $rel 'extension'

# --- sanity checks ---
if (-not (Test-Path $hostDir)) {
    throw "Native host build not found: $hostDir`nRun: python scripts/build_native_host.py --clean"
}
if (-not (Test-Path $extSrc)) {
    throw "Extension source not found: $extSrc"
}

New-Item -ItemType Directory -Path $rel -Force | Out-Null

# --- (optional) refresh the extension distribution snapshot from source ---
if (-not $NoRefresh) {
    Write-Host "Refreshing Releases/extension/ from source..." -ForegroundColor Cyan
    if (Test-Path $extSnap) { Remove-Item $extSnap -Recurse -Force }
    Copy-Item $extSrc $extSnap -Recurse
    Write-Host "  refreshed." -ForegroundColor Green
}

# --- output zips ---
$hostZip  = Join-Path $rel 'agentao-chrome-host-windows.zip'
$extZip   = Join-Path $rel 'agentao-in-chrome-extension.zip'
Remove-Item $hostZip -ErrorAction SilentlyContinue
Remove-Item $extZip  -ErrorAction SilentlyContinue

Write-Host "Zipping native host (Windows)..." -ForegroundColor Cyan
Compress-Archive -Path $hostDir -DestinationPath $hostZip -Force
Write-Host ("  {0}  ({1:N1} MB)" -f $hostZip, ((Get-Item $hostZip).Length/1MB)) -ForegroundColor Green

Write-Host "Zipping extension..." -ForegroundColor Cyan
Compress-Archive -Path (Join-Path $extSnap '*') -DestinationPath $extZip -Force
Write-Host ("  {0}  ({1:N1} MB)" -f $extZip, ((Get-Item $extZip).Length/1MB)) -ForegroundColor Green

Write-Host "`nDone. Distribute these two files:" -ForegroundColor Yellow
Write-Host "  $hostZip"
Write-Host "  $extZip"
