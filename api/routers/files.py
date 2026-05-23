# Copyright (C) 2025 AIDC-AI
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#     http://www.apache.org/licenses/LICENSE-2.0
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""
File service endpoints

Provides access to generated files (videos, images, audio) and resource files.
"""

import os
import uuid
from pathlib import Path
from typing import Iterator, Literal

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from loguru import logger
from pydantic import BaseModel

from pixelle_video.utils.os_util import get_temp_path


def _candidate_roots() -> Iterator[Path]:
    """
    Roots to search for a requested file, in priority order. Resilient against
    cwd drift in the PyInstaller bundle: even if Python's getcwd() ends up
    somewhere unexpected, files written by pipelines to `output/...` are still
    locatable through PIXELLE_DATA_DIR (writable, per-user) or PIXELLE_VIDEO_ROOT
    (read-only resources).
    """
    seen: set = set()
    for env_var in ("PIXELLE_DATA_DIR", "PIXELLE_VIDEO_ROOT"):
        val = os.environ.get(env_var)
        if val:
            p = Path(val).resolve()
            if p not in seen:
                seen.add(p)
                yield p
    cwd = Path.cwd().resolve()
    if cwd not in seen:
        yield cwd

router = APIRouter(prefix="/files", tags=["Files"])

# ----------------------------------------------------------------------------
# Upload endpoint (used by the desktop client to push a local ref_audio file
# into the sidecar's temp dir so the TTS / voice-cloning pipeline can read it).
# ----------------------------------------------------------------------------

ALLOWED_KINDS = {
    "ref_audio": {".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg"},
}


class UploadResponse(BaseModel):
    success: bool = True
    path: str
    name: str
    size: int


@router.post("/upload", response_model=UploadResponse)
async def upload_file(
    file: UploadFile = File(...),
    kind: Literal["ref_audio"] = "ref_audio",
) -> UploadResponse:
    """
    Upload a small auxiliary file (currently only `ref_audio` for voice cloning).

    The file is written to `<project>/temp/{kind}_{uuid}{ext}` and the
    returned `path` can be passed back as e.g. `ref_audio` in subsequent
    video generation / TTS synthesis requests.
    """
    suffix = Path(file.filename or "").suffix.lower()
    allowed = ALLOWED_KINDS.get(kind, set())
    if allowed and suffix not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"unsupported {kind} extension {suffix!r}, allowed: {sorted(allowed)}",
        )

    try:
        target_dir = Path(get_temp_path())
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / f"{kind}_{uuid.uuid4().hex[:12]}{suffix}"
        body = await file.read()
        target.write_bytes(body)

        # Return path relative to the project root so the same value can be
        # used to feed pipelines (which resolve relative paths against cwd).
        from pixelle_video.utils.os_util import ensure_pixelle_video_root_path
        root = Path(ensure_pixelle_video_root_path())
        try:
            rel = target.relative_to(root).as_posix()
        except ValueError:
            rel = str(target)
        return UploadResponse(path=rel, name=file.filename or target.name, size=len(body))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"upload_file failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{file_path:path}")
async def get_file(file_path: str):
    """
    Get file by path
    
    Serves files from allowed directories:
    - output/ - Generated files (videos, images, audio)
    - workflows/ - ComfyUI workflow files
    - templates/ - HTML templates
    - bgm/ - Background music
    - data/bgm/ - Custom background music
    - data/templates/ - Custom templates
    - resources/ - Other resources (images, fonts, etc.)
    
    - **file_path**: File path relative to allowed directories
    
    Examples:
    - "abc123.mp4" → output/abc123.mp4
    - "workflows/runninghub/image_flux.json" → workflows/runninghub/image_flux.json
    - "templates/1080x1920/default.html" → templates/1080x1920/default.html
    - "bgm/default.mp3" → bgm/default.mp3
    - "resources/example.png" → resources/example.png
    
    Returns file for download or preview.
    """
    try:
        # Define allowed directories (in priority order)
        allowed_prefixes = [
            "output/",
            "workflows/",
            "templates/",
            "bgm/",
            "data/bgm/",
            "data/templates/",
            "resources/",
        ]

        # Check if path starts with allowed prefix, otherwise try output/
        full_path = None
        for prefix in allowed_prefixes:
            if file_path.startswith(prefix):
                full_path = file_path
                break

        # If no prefix matched, assume it's in output/ (backward compatibility)
        if full_path is None:
            full_path = f"output/{file_path}"

        # Search across candidate roots — PIXELLE_DATA_DIR (writable, where
        # pipelines emit output/) first, then PIXELLE_VIDEO_ROOT (read-only
        # resources like templates/, workflows/), finally cwd as the dev fallback.
        abs_path: Path | None = None
        tried: list[Path] = []
        for root in _candidate_roots():
            candidate = (root / full_path).resolve()
            tried.append(candidate)
            if candidate.is_file():
                abs_path = candidate
                break

        if abs_path is None:
            logger.warning(
                f"file_path={file_path!r} not found; searched: "
                + ", ".join(str(p) for p in tried)
            )
            raise HTTPException(status_code=404, detail=f"File not found: {file_path}")

        # Security: only allow access to the candidate roots' allowed subdirs.
        is_allowed = False
        for root in _candidate_roots():
            try:
                rel = abs_path.relative_to(root.resolve())
                rel_str = str(rel).replace("\\", "/")
                if any(rel_str.startswith(prefix.rstrip("/")) for prefix in allowed_prefixes):
                    is_allowed = True
                    break
            except ValueError:
                continue

        if not is_allowed:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Determine media type
        suffix = abs_path.suffix.lower()
        media_types = {
            '.mp4': 'video/mp4',
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.html': 'text/html',
            '.json': 'application/json',
        }
        media_type = media_types.get(suffix, 'application/octet-stream')
        
        # Use inline disposition for browser preview
        return FileResponse(
            path=str(abs_path),
            media_type=media_type,
            headers={
                "Content-Disposition": f'inline; filename="{abs_path.name}"'
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"File access error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

