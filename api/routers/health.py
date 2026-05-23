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
Health check and system info endpoints
"""

import shutil
import sys
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["Health"])


class HealthResponse(BaseModel):
    """Health check response"""
    status: str = "healthy"
    version: str = "0.1.0"
    service: str = "Pixelle-Video API"


class CapabilitiesResponse(BaseModel):
    """Capabilities response"""
    success: bool = True
    capabilities: dict


class DependencyStatus(BaseModel):
    """Whether a single external CLI dependency is available on the system."""
    name: str
    available: bool
    path: Optional[str] = None


class DependenciesResponse(BaseModel):
    """
    Aggregated dependency probe so the desktop client can pre-flight before
    starting a video generation pipeline (which would otherwise fail mid-stream
    with a stack trace several minutes in).
    """
    success: bool = True
    platform: str
    all_ok: bool
    missing: list[str]
    dependencies: list[DependencyStatus]


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint

    Returns service status and version information.
    """
    return HealthResponse()


@router.get("/version", response_model=HealthResponse)
async def get_version():
    """
    Get API version

    Returns version information.
    """
    return HealthResponse()


@router.get("/health/dependencies", response_model=DependenciesResponse)
async def check_dependencies():
    """
    Probe required external CLI dependencies (ffmpeg / ffprobe).

    Used by the desktop client to fail fast at "Generate" click time rather
    than letting the user wait through TTS + image gen only to crash at the
    final compose step.
    """
    required = ("ffmpeg", "ffprobe")
    statuses: list[DependencyStatus] = []
    missing: list[str] = []
    for name in required:
        path = shutil.which(name)
        ok = path is not None
        statuses.append(DependencyStatus(name=name, available=ok, path=path))
        if not ok:
            missing.append(name)

    if sys.platform.startswith("win"):
        plat = "windows"
    elif sys.platform == "darwin":
        plat = "macos"
    else:
        plat = "linux"

    return DependenciesResponse(
        platform=plat,
        all_ok=not missing,
        missing=missing,
        dependencies=statuses,
    )

