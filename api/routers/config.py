# Copyright (C) 2025 AIDC-AI
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#     http://www.apache.org/licenses/LICENSE-2.0

"""
Config endpoints

Exposes read/write access to config.yaml (LLM + ComfyUI/RunningHub)
and a connectivity probe for the LLM provider.
"""

from fastapi import APIRouter, HTTPException
from loguru import logger

from api.schemas.config import (
    LLMConfig,
    ComfyUIConfig,
    LLMPreset,
    LLMPresetsResponse,
    LLMTestRequest,
    ConnectionTestResponse,
)
from pixelle_video.config.manager import ConfigManager
from pixelle_video.llm_presets import LLM_PRESETS


router = APIRouter(prefix="/config", tags=["Config"])


@router.get("/llm", response_model=LLMConfig)
async def get_llm_config() -> LLMConfig:
    """Get current LLM configuration."""
    mgr = ConfigManager()
    cfg = mgr.get_llm_config()
    return LLMConfig(**cfg)


@router.put("/llm", response_model=LLMConfig)
async def update_llm_config(payload: LLMConfig) -> LLMConfig:
    """Replace LLM configuration and persist to disk."""
    try:
        mgr = ConfigManager()
        mgr.set_llm_config(
            api_key=payload.api_key,
            base_url=payload.base_url,
            model=payload.model,
        )
        mgr.save()
        return payload
    except Exception as e:
        logger.error(f"update_llm_config failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/comfyui", response_model=ComfyUIConfig)
async def get_comfyui_config() -> ComfyUIConfig:
    """Get ComfyUI / RunningHub global config."""
    mgr = ConfigManager()
    cfg = mgr.get_comfyui_config()
    return ComfyUIConfig(
        comfyui_url=cfg.get("comfyui_url", "http://127.0.0.1:8188"),
        comfyui_api_key=cfg.get("comfyui_api_key", ""),
        runninghub_api_key=cfg.get("runninghub_api_key", ""),
        runninghub_concurrent_limit=cfg.get("runninghub_concurrent_limit", 1),
    )


@router.put("/comfyui", response_model=ComfyUIConfig)
async def update_comfyui_config(payload: ComfyUIConfig) -> ComfyUIConfig:
    """Replace ComfyUI / RunningHub config and persist to disk."""
    try:
        mgr = ConfigManager()
        mgr.set_comfyui_config(
            comfyui_url=payload.comfyui_url,
            comfyui_api_key=payload.comfyui_api_key,
            runninghub_api_key=payload.runninghub_api_key,
            runninghub_concurrent_limit=payload.runninghub_concurrent_limit,
        )
        mgr.save()
        return payload
    except Exception as e:
        logger.error(f"update_comfyui_config failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# --- LLM ----------------------------------------------------------------------


@router.get("/llm/presets", response_model=LLMPresetsResponse)
async def list_llm_presets() -> LLMPresetsResponse:
    """List predefined LLM provider presets (Qwen, OpenAI, DeepSeek, Ollama, ...)."""
    return LLMPresetsResponse(presets=[LLMPreset(**p) for p in LLM_PRESETS])


@router.post("/llm/test", response_model=ConnectionTestResponse)
async def test_llm_connection(payload: LLMTestRequest) -> ConnectionTestResponse:
    """
    Probe a candidate LLM configuration with a 1-token completion.
    Credentials are NOT persisted — call PUT /api/config/llm to save them.
    """
    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=payload.api_key or "x", base_url=payload.base_url)
        resp = await client.chat.completions.create(
            model=payload.model,
            messages=[{"role": "user", "content": "ping"}],
            max_tokens=1,
            temperature=0,
        )
        # If we got here, the credentials & endpoint are reachable.
        finish_reason = (
            resp.choices[0].finish_reason if resp.choices else "unknown"
        )
        return ConnectionTestResponse(
            success=True,
            message="连接成功",
            detail=f"model={payload.model}, finish={finish_reason}",
        )
    except Exception as e:
        return ConnectionTestResponse(
            success=False,
            message="连接失败",
            detail=f"{type(e).__name__}: {e}",
        )
