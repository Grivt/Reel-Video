# Build script for the Real Video desktop sidecar.
#
# Usage (from repo root or any directory):
#   pwsh packaging/desktop-sidecar/build.ps1
#
# What it does:
#   1. Creates an isolated build venv at `packaging/desktop-sidecar/.venv` using `uv`
#      (so PyInstaller doesn't pull in streamlit / fastmcp from the project venv).
#   2. Installs sidecar requirements (incl. PyInstaller).
#   3. Installs the Playwright Chromium browser into the venv (PyInstaller will bundle
#      it via collect_all('playwright')).
#   4. Runs `pyinstaller sidecar.spec` → `dist/reel-api/`.
#   5. Copies the bundle into `desktop/src-tauri/binaries/reel-api/`.
#
# The Tauri side picks up the bundle via tauri.conf.json `bundle.resources` (NOT
# externalBin — externalBin is for a single executable, but PyInstaller onedir
# is a whole directory). See sidecar.rs for the resolved path at runtime.

# NOTE on error handling for PowerShell 5.1:
#   Don't use `$ErrorActionPreference = "Stop"` + `2>&1` redirects on native
#   executables like uv/playwright/pyinstaller. PS5.1 wraps every native-cmd
#   stderr LINE as an ErrorRecord (`NativeCommandError`), which combined with
#   Stop mode aborts the script on harmless informational logs (e.g. uv's
#   "Using Python 3.11.x environment at: ..."). Instead: leave stderr alone,
#   and check `$LASTEXITCODE` after each native call.

$SpecDir = Split-Path -Parent $PSCommandPath
$ProjectRoot = Resolve-Path (Join-Path $SpecDir "..\..")
$VenvDir = Join-Path $SpecDir ".venv"
$DistDir = Join-Path $SpecDir "dist"
$BuildDir = Join-Path $SpecDir "build"
$TauriBinDir = Join-Path $ProjectRoot "desktop\src-tauri\binaries"

Write-Host ""
Write-Host "🛠️  Reel sidecar PyInstaller build" -ForegroundColor Cyan
Write-Host "    spec dir : $SpecDir"
Write-Host "    project  : $ProjectRoot"
Write-Host "    output   : $TauriBinDir\reel-api\"
Write-Host ""

# 1. Build venv
if (-not (Test-Path $VenvDir)) {
    Write-Host "→ Creating sidecar build venv at .venv" -ForegroundColor Yellow
    & uv venv $VenvDir --python 3.11
    if ($LASTEXITCODE -ne 0) { throw "uv venv failed (exit $LASTEXITCODE)" }
}
$pyExe = Join-Path $VenvDir "Scripts\python.exe"
if (-not (Test-Path $pyExe)) {
    throw "venv python not found at $pyExe"
}

# 2. Install deps. Two steps:
#    a) Install the project itself editable so `api` and `reel_video`
#       imports resolve (must run from project root so relative path is
#       unambiguous across uv versions).
#    b) Install the rest of the runtime libs from requirements.txt.
Write-Host "→ Installing project (editable) + sidecar requirements" -ForegroundColor Yellow
Push-Location $ProjectRoot
try {
    & uv pip install --python $pyExe -e .
    if ($LASTEXITCODE -ne 0) { throw "uv pip install -e . failed (exit $LASTEXITCODE)" }
} finally {
    Pop-Location
}
& uv pip install --python $pyExe --requirement (Join-Path $SpecDir "requirements.txt")
if ($LASTEXITCODE -ne 0) { throw "uv pip install requirements failed (exit $LASTEXITCODE)" }

# 3. Install Playwright browsers INSIDE the venv's playwright package, not in
#    the OS user cache (%LOCALAPPDATA%\ms-playwright). Without this, PyInstaller's
#    `collect_all('playwright')` only picks up the Python driver — never the
#    actual browser binaries — and the bundled app crashes with
#    "Executable doesn't exist ... chrome-headless-shell.exe".
#
#    PLAYWRIGHT_BROWSERS_PATH=0 is the magic value that says
#    "install under <package>/driver/package/.local-browsers/" so the binaries
#    sit next to the package files and get swept into the PyInstaller bundle.
#
#    We only need chromium-headless-shell (frame_html.py launches headless).
$env:PLAYWRIGHT_BROWSERS_PATH = "0"
Write-Host "→ Installing Playwright chromium-headless-shell (into package, PLAYWRIGHT_BROWSERS_PATH=0)" -ForegroundColor Yellow
& $pyExe -m playwright install chromium-headless-shell
$browsersDir = Join-Path $VenvDir "Lib\site-packages\playwright\driver\package\.local-browsers"
if (-not (Test-Path $browsersDir)) {
    throw "Playwright browsers not found at expected in-package location: $browsersDir"
}
$browsersMb = ((Get-ChildItem -Recurse $browsersDir | Measure-Object -Property Length -Sum).Sum / 1MB).ToString("0.0")
Write-Host "    .local-browsers/ ready: $browsersMb MB" -ForegroundColor Green

# 4. Run PyInstaller
Write-Host "→ Running PyInstaller" -ForegroundColor Yellow
Push-Location $SpecDir
try {
    & $pyExe -m PyInstaller `
        --noconfirm `
        --clean `
        --distpath $DistDir `
        --workpath $BuildDir `
        sidecar.spec
} finally {
    Pop-Location
}

if (-not (Test-Path (Join-Path $DistDir "reel-api\reel-api.exe"))) {
    throw "PyInstaller did not produce reel-api.exe"
}

# 5. Copy bundle into Tauri's binaries/ for inclusion by tauri.conf.json resources
Write-Host "→ Copying bundle to $TauriBinDir\reel-api\" -ForegroundColor Yellow
if (-not (Test-Path $TauriBinDir)) {
    New-Item -ItemType Directory -Path $TauriBinDir -Force | Out-Null
}
$Target = Join-Path $TauriBinDir "reel-api"
if (Test-Path $Target) { Remove-Item -Recurse -Force $Target }
Copy-Item -Recurse -Force (Join-Path $DistDir "reel-api") $Target

$ExeSize = ((Get-Item (Join-Path $Target "reel-api.exe")).Length / 1MB).ToString("0.0")
$TotalMb = ((Get-ChildItem -Recurse $Target | Measure-Object -Property Length -Sum).Sum / 1MB).ToString("0.0")
Write-Host ""
Write-Host "✅ Sidecar bundle ready" -ForegroundColor Green
Write-Host "    reel-api.exe : $ExeSize MB"
Write-Host "    total bundle    : $TotalMb MB"
Write-Host ""
Write-Host "Next: cd desktop && pnpm tauri build"
