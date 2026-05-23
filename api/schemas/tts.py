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
TTS API schemas
"""

from typing import Optional, Literal
from pydantic import BaseModel, Field


class TTSSynthesizeRequest(BaseModel):
    """TTS synthesis request"""
    text: str = Field(..., description="Text to synthesize")
    inference_mode: Optional[Literal["local", "comfyui"]] = Field(
        None,
        description="TTS inference mode: 'local' (Edge TTS) or 'comfyui'. Defaults to service config."
    )
    voice: Optional[str] = Field(
        None,
        description="Edge TTS voice id (local mode), e.g. 'zh-CN-YunjianNeural'."
    )
    speed: Optional[float] = Field(
        None, ge=0.5, le=2.0,
        description="Speech speed multiplier (1.0 = normal). Defaults to 1.2."
    )
    workflow: Optional[str] = Field(
        None,
        description="TTS workflow key (ComfyUI mode), e.g. 'runninghub/tts_edge.json'."
    )
    ref_audio: Optional[str] = Field(
        None,
        description="Reference audio for voice cloning (ComfyUI mode). Local path or URL."
    )
    voice_id: Optional[str] = Field(
        None,
        description="Voice ID (deprecated, use voice + inference_mode='local' instead)"
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "text": "Hello, welcome to Pixelle-Video!",
                "workflow": "runninghub/tts_edge.json",
                "ref_audio": None
            }
        }


class TTSSynthesizeResponse(BaseModel):
    """TTS synthesis response"""
    success: bool = True
    message: str = "Success"
    audio_path: str = Field(..., description="Path to generated audio file")
    duration: float = Field(..., description="Audio duration in seconds")

