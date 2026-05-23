#!/usr/bin/env bash
# macOS / Linux equivalent of build.ps1.
#
# Usage (from repo root or any directory):
#   bash packaging/desktop-sidecar/build.sh
#
# Mirrors the Windows pipeline:
#   1. Creates an isolated venv at packaging/desktop-sidecar/.venv via uv
#   2. Installs sidecar requirements (no streamlit / fastmcp)
#   3. Installs Playwright Chromium headless shell INSIDE the venv's package
#      via PLAYWRIGHT_BROWSERS_PATH=0 (so PyInstaller's collect_all sweeps it in)
#   4. Runs pyinstaller sidecar.spec → dist/pixelle-api/
#   5. Copies the bundle into desktop/src-tauri/binaries/pixelle-api/
#
# After this, run `cd desktop && pnpm tauri build` to produce the .dmg on macOS
# (or .deb / .AppImage on Linux).

set -euo pipefail

SPEC_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SPEC_DIR/../.." && pwd )"
VENV_DIR="$SPEC_DIR/.venv"
DIST_DIR="$SPEC_DIR/dist"
BUILD_DIR="$SPEC_DIR/build"
TAURI_BIN_DIR="$PROJECT_ROOT/desktop/src-tauri/binaries"

echo ""
echo "🛠️  Pixelle sidecar PyInstaller build"
echo "    spec dir : $SPEC_DIR"
echo "    project  : $PROJECT_ROOT"
echo "    output   : $TAURI_BIN_DIR/pixelle-api/"
echo ""

# 1. Build venv (uv handles Python download automatically)
if [ ! -d "$VENV_DIR" ]; then
    echo "→ Creating sidecar build venv at .venv"
    uv venv "$VENV_DIR" --python 3.11
fi

if [[ "$OSTYPE" == "darwin"* || "$OSTYPE" == "linux-gnu"* ]]; then
    PY_EXE="$VENV_DIR/bin/python"
else
    PY_EXE="$VENV_DIR/Scripts/python.exe"
fi

if [ ! -f "$PY_EXE" ]; then
    echo "venv python not found at $PY_EXE" >&2
    exit 1
fi

# 2. Install deps. Two steps:
#    a) Install the project itself editable so `api` and `pixelle_video`
#       imports resolve (must run from project root so relative path is
#       unambiguous across uv versions).
#    b) Install the rest of the runtime libs from requirements.txt.
echo "→ Installing project (editable) + sidecar requirements"
(cd "$PROJECT_ROOT" && uv pip install --python "$PY_EXE" -e .)
uv pip install --python "$PY_EXE" --requirement "$SPEC_DIR/requirements.txt"

# 3. Install Playwright chromium-headless-shell INSIDE the venv's package.
#    (PLAYWRIGHT_BROWSERS_PATH=0 → driver/package/.local-browsers/)
export PLAYWRIGHT_BROWSERS_PATH=0
echo "→ Installing Playwright chromium-headless-shell (PLAYWRIGHT_BROWSERS_PATH=0)"
"$PY_EXE" -m playwright install chromium-headless-shell

if [[ "$OSTYPE" == "darwin"* || "$OSTYPE" == "linux-gnu"* ]]; then
    BROWSERS_DIR="$VENV_DIR/lib/python3.11/site-packages/playwright/driver/package/.local-browsers"
else
    BROWSERS_DIR="$VENV_DIR/Lib/site-packages/playwright/driver/package/.local-browsers"
fi
if [ ! -d "$BROWSERS_DIR" ]; then
    echo "Playwright browsers not found at expected in-package location: $BROWSERS_DIR" >&2
    exit 1
fi
BROWSERS_MB=$(du -sm "$BROWSERS_DIR" | cut -f1)
echo "    .local-browsers/ ready: ${BROWSERS_MB} MB"

# 4. PyInstaller
echo "→ Running PyInstaller"
(
    cd "$SPEC_DIR"
    "$PY_EXE" -m PyInstaller \
        --noconfirm \
        --clean \
        --distpath "$DIST_DIR" \
        --workpath "$BUILD_DIR" \
        sidecar.spec
)

# Determine exe name per platform
if [[ "$OSTYPE" == "darwin"* ]] || [[ "$OSTYPE" == "linux-gnu"* ]]; then
    EXE_NAME="pixelle-api"
else
    EXE_NAME="pixelle-api.exe"
fi

if [ ! -f "$DIST_DIR/pixelle-api/$EXE_NAME" ]; then
    echo "PyInstaller did not produce $EXE_NAME" >&2
    exit 1
fi

# 5. Copy bundle into Tauri's binaries/
echo "→ Copying bundle to $TAURI_BIN_DIR/pixelle-api/"
mkdir -p "$TAURI_BIN_DIR"
TARGET="$TAURI_BIN_DIR/pixelle-api"
if [ -d "$TARGET" ]; then rm -rf "$TARGET"; fi
cp -R "$DIST_DIR/pixelle-api" "$TARGET"


EXE_MB=$(du -sm "$TARGET/$EXE_NAME" | cut -f1)
TOTAL_MB=$(du -sm "$TARGET" | cut -f1)
echo ""
echo "✅ Sidecar bundle ready"
echo "    $EXE_NAME : ${EXE_MB} MB"
echo "    total bundle    : ${TOTAL_MB} MB"
echo ""
echo "Next: cd desktop && pnpm tauri build"
