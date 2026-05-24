"""
PyInstaller entry point for the Reel Video desktop sidecar.

The Tauri shell spawns this binary with `--host 127.0.0.1 --port <auto>` and waits
for the FastAPI server to bind. After PyInstaller freezes, the executable is
placed under `desktop/src-tauri/binaries/reel-api-<target>.exe` and registered
as a Tauri `externalBin`.

The actual FastAPI app lives in `api/app.py` — this file only:
  1. Ensures the project root is on sys.path when running from a single-file bundle
  2. Re-exports the `app` so uvicorn can find it (also covers `--reload` dev usage)
  3. Provides a CLI identical to `api/app.py`'s `__main__` block
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path


def _resolve_resource_root() -> Path:
    """
    When frozen by PyInstaller (onedir), runtime data lives next to the binary
    under `_internal/` and project resources (templates/, bgm/, workflows/) are
    bundled alongside the exe at install time. We set `REEL_VIDEO_ROOT` to
    the install dir so the project's `get_root_path()` resolves correctly.
    """
    if getattr(sys, "frozen", False):
        # PyInstaller: exe sits at <install>/binaries/<exe>; resources are siblings.
        exe_dir = Path(sys.executable).resolve().parent
        # When run via Tauri's externalBin layout, the project resources are
        # exposed under the app's resource_dir. Fall back to walking up if
        # REEL_VIDEO_ROOT isn't set yet.
        return exe_dir
    # Source mode (dev / build host): three levels up = project root.
    return Path(__file__).resolve().parents[2]


def _bootstrap_paths() -> None:
    root = _resolve_resource_root()
    if not os.environ.get("REEL_VIDEO_ROOT"):
        os.environ["REEL_VIDEO_ROOT"] = str(root)
    # Make sure project packages (api, reel_video) are importable.
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))

    # Force cwd to REEL_DATA_DIR. Tauri's Command::current_dir() doesn't
    # reliably propagate to a PyInstaller frozen exe on Windows (bootloader
    # appears to chdir during unpacking), so we re-anchor here. Without this,
    # `Path("output/...")` writes land somewhere different from what
    # api/routers/files.py reads back via `Path.cwd()/output/...`, and
    # frame_html.py's `Path.cwd() / image` resolves missing AI-generated
    # frames into broken file:// URLs that render as empty rectangles.
    data_dir = os.environ.get("REEL_DATA_DIR")
    if data_dir:
        try:
            os.makedirs(data_dir, exist_ok=True)
            os.chdir(data_dir)
        except OSError as e:
            print(f"warn: could not chdir to REEL_DATA_DIR={data_dir}: {e}",
                  file=sys.stderr)



_bootstrap_paths()

from api.app import app  # noqa: E402  (after sys.path tweak)


def main() -> None:
    parser = argparse.ArgumentParser(description="Reel Video desktop sidecar")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=0)
    args = parser.parse_args()

    import uvicorn

    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        log_level="info",
        access_log=False,
    )


if __name__ == "__main__":
    main()
