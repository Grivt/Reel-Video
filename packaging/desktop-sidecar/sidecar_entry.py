"""
PyInstaller entry point for the Pixelle Video desktop sidecar.

The Tauri shell spawns this binary with `--host 127.0.0.1 --port <auto>` and waits
for the FastAPI server to bind. After PyInstaller freezes, the executable is
placed under `desktop/src-tauri/binaries/pixelle-api-<target>.exe` and registered
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
    bundled alongside the exe at install time. We set `PIXELLE_VIDEO_ROOT` to
    the install dir so the project's `get_root_path()` resolves correctly.
    """
    if getattr(sys, "frozen", False):
        # PyInstaller: exe sits at <install>/binaries/<exe>; resources are siblings.
        exe_dir = Path(sys.executable).resolve().parent
        # When run via Tauri's externalBin layout, the project resources are
        # exposed under the app's resource_dir. Fall back to walking up if
        # PIXELLE_VIDEO_ROOT isn't set yet.
        return exe_dir
    # Source mode (dev / build host): three levels up = project root.
    return Path(__file__).resolve().parents[2]


def _bootstrap_paths() -> None:
    root = _resolve_resource_root()
    if not os.environ.get("PIXELLE_VIDEO_ROOT"):
        os.environ["PIXELLE_VIDEO_ROOT"] = str(root)
    # Make sure project packages (api, pixelle_video) are importable.
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))

    # Force cwd to PIXELLE_DATA_DIR. Tauri's Command::current_dir() doesn't
    # reliably propagate to a PyInstaller frozen exe on Windows (bootloader
    # appears to chdir during unpacking), so we re-anchor here. Without this,
    # `Path("output/...")` writes land somewhere different from what
    # api/routers/files.py reads back via `Path.cwd()/output/...`, and
    # frame_html.py's `Path.cwd() / image` resolves missing AI-generated
    # frames into broken file:// URLs that render as empty rectangles.
    data_dir = os.environ.get("PIXELLE_DATA_DIR")
    if data_dir:
        try:
            os.makedirs(data_dir, exist_ok=True)
            os.chdir(data_dir)
        except OSError as e:
            print(f"warn: could not chdir to PIXELLE_DATA_DIR={data_dir}: {e}",
                  file=sys.stderr)

    # --- ffmpeg / ffprobe discovery -----------------------------------------
    # ffmpeg is shipped as part of `imageio_ffmpeg` (PyInstaller collects its
    # static binary, ~80MB, into _internal/imageio_ffmpeg/binaries/). Surface it
    # to subprocess clients like `ffmpeg-python` by prepending its dir to PATH
    # and setting IMAGEIO_FFMPEG_EXE for moviepy.
    try:
        import imageio_ffmpeg  # type: ignore
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        if ffmpeg_exe and os.path.exists(ffmpeg_exe):
            ffmpeg_dir = os.path.dirname(ffmpeg_exe)
            os.environ["PATH"] = ffmpeg_dir + os.pathsep + os.environ.get("PATH", "")
            os.environ.setdefault("IMAGEIO_FFMPEG_EXE", ffmpeg_exe)
    except Exception as e:
        print(f"warn: could not resolve imageio_ffmpeg's ffmpeg: {e}", file=sys.stderr)

    # ffprobe is bundled separately under `<resource_root>/binaries/` by the
    # Tauri shell (build.ps1 / build.sh downloads a static binary at build time).
    # Prepend its dir to PATH so ffmpeg-python's `subprocess.run("ffprobe")`
    # finds it, and also set FFPROBE_BINARY for libraries that honour it.
    video_root = os.environ.get("PIXELLE_VIDEO_ROOT")
    if video_root:
        ext = ".exe" if sys.platform.startswith("win") else ""
        # Try Tauri resource_dir/binaries/ffprobe(.exe) first, then a fallback
        # location for dev mode where ffprobe might sit alongside the project.
        for ffprobe_candidate in (
            os.path.join(video_root, "binaries", f"ffprobe{ext}"),
            os.path.join(video_root, "ffprobe{ext}".format(ext=ext)),
        ):
            if os.path.isfile(ffprobe_candidate):
                ffprobe_dir = os.path.dirname(ffprobe_candidate)
                os.environ["PATH"] = ffprobe_dir + os.pathsep + os.environ.get("PATH", "")
                os.environ.setdefault("FFPROBE_BINARY", ffprobe_candidate)
                break


_bootstrap_paths()

from api.app import app  # noqa: E402  (after sys.path tweak)


def main() -> None:
    parser = argparse.ArgumentParser(description="Pixelle Video desktop sidecar")
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
