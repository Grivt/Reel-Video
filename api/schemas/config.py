# Copyright (C) 2025 AIDC-AI
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#     http://www.apache.org/licenses/LICENSE-2.0

"""Config endpoint schemas"""

from typing import List, Optional

from pydantic import BaseModel, Field


class LLMConfig(BaseModel):
    """LLM section of config.yaml"""

    api_key: str = ""
    base_url: str = ""
    model: str = ""


class ComfyUIConfig(BaseModel):
    """ComfyUI / RunningHub global section of config.yaml (flat fields only)"""

    comfyui_url: str = "http://127.0.0.1:8188"
    comfyui_api_key: str = ""
    runninghub_api_key: str = ""
    runninghub_concurrent_limit: int = 1


class LLMPreset(BaseModel):
    """A predefined LLM provider preset"""

    name: str
    base_url: str
    model: str
    api_key_url: Optional[str] = None
    default_api_key: Optional[str] = None


class LLMPresetsResponse(BaseModel):
    presets: List[LLMPreset]


class LLMTestRequest(BaseModel):
    """Test an LLM connection with provided credentials (does not save them)"""

    api_key: str
    base_url: str
    model: str


class ConnectionTestResponse(BaseModel):
    success: bool
    message: str = ""
    detail: Optional[str] = None
