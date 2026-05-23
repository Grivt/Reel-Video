# -*- mode: python ; coding: utf-8 -*-
#
# PyInstaller spec for the Pixelle Video desktop sidecar.
#
# Produces an onedir bundle at `dist/pixelle-api/`:
#   pixelle-api.exe              ← launcher
#   _internal/                   ← Python runtime + deps
#
# After this builds, `build.ps1` copies the bundle into
# `desktop/src-tauri/binaries/` so Tauri's externalBin can pick it up.
#
# The two notoriously fiddly deps:
#   - moviepy   → needs `proglog`, `imageio`, `imageio_ffmpeg`, `decorator`
#   - playwright → driver script + node runtime live outside site-packages

import os
import sys
from pathlib import Path
from PyInstaller.utils.hooks import collect_all, collect_data_files, collect_submodules

block_cipher = None
SPEC_DIR = Path(os.path.dirname(os.path.abspath(SPEC)))
PROJECT_ROOT = SPEC_DIR.parents[1]

# --- Hidden imports + bundled data for each problem package --------------------
hiddenimports: list[str] = []
datas: list[tuple[str, str]] = []
binaries: list[tuple[str, str]] = []

for pkg in (
    "moviepy",
    "imageio",
    "imageio_ffmpeg",
    "proglog",
    "decorator",
    "edge_tts",
    "openai",
    "comfykit",
    "fastapi",
    "pydantic",
    "pydantic_core",
    "uvicorn",
    "uvicorn.lifespan",
    "uvicorn.protocols",
    "uvicorn.loops",
    "loguru",
    "httpx",
    "pillow",
    "PIL",
    "ffmpeg",
    "bs4",
    "playwright",
):
    try:
        pkg_datas, pkg_binaries, pkg_hidden = collect_all(pkg)
        datas += pkg_datas
        binaries += pkg_binaries
        hiddenimports += pkg_hidden
    except Exception as e:
        print(f"[spec] WARN: collect_all({pkg!r}) failed: {e}", file=sys.stderr)

# Explicitly ship Playwright's `.local-browsers/` directory. `collect_data_files`
# is unreliable for hidden directories, and Playwright's actual browser binaries
# only live here when the install was done with PLAYWRIGHT_BROWSERS_PATH=0 (see
# build.ps1). Skipping this is what made the v1 packaged build crash at runtime
# with "Executable doesn't exist ... chrome-headless-shell.exe".
try:
    import playwright as _pw_mod  # noqa: WPS433
    _pw_dir = Path(_pw_mod.__file__).parent
    _browsers_dir = _pw_dir / "driver" / "package" / ".local-browsers"
    if _browsers_dir.exists():
        datas.append((
            str(_browsers_dir),
            "playwright/driver/package/.local-browsers",
        ))
        print(f"[spec] bundling Playwright browsers from {_browsers_dir}")
    else:
        print(f"[spec] WARN: .local-browsers/ not found at {_browsers_dir}", file=sys.stderr)
except Exception as _e:
    print(f"[spec] WARN: could not resolve Playwright package dir: {_e}", file=sys.stderr)

# uvicorn[standard] picks these at runtime via importlib — make them explicit.
hiddenimports += [
    "uvicorn.protocols.http.httptools_impl",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.websockets.websockets_impl",
    "uvicorn.protocols.websockets.wsproto_impl",
    "uvicorn.loops.asyncio",
    "uvicorn.loops.uvloop",
    "anyio._backends._asyncio",
    "asyncio.windows_events",  # win32 only; ignored on other platforms
]

# api/ and pixelle_video/ are imported via the bootstrap in sidecar_entry.py;
# also list them explicitly so PyInstaller follows transitive imports.
hiddenimports += collect_submodules("api")
hiddenimports += collect_submodules("pixelle_video")

# ------------------------------------------------------------------------------
a = Analysis(
    [str(SPEC_DIR / "sidecar_entry.py")],
    pathex=[str(PROJECT_ROOT)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    # Keep the bundle lean — strip out modules the sidecar doesn't touch.
    excludes=[
        "streamlit",
        "altair",
        "pyarrow",
        "tornado",
        "fastmcp",
        "mcp",
        "tkinter",
        "matplotlib",
        "scipy",
        "sklearn",
        "pandas.tests",
        "IPython",
        "jupyter",
        "notebook",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="pixelle-api",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,            # UPX can corrupt some native deps
    console=True,         # keep a console for first-run diagnostics; Tauri spawns with CREATE_NO_WINDOW
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="pixelle-api",
)
