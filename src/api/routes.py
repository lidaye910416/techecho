"""
TechEcho Pro - API 路由

注册所有 API 子路由：
- 资讯 API (news_api) - 新闻 CRUD + 收集
- 收藏分析 API (favorites_api)
- 微信认证 API (auth_api)
- 通用 API (voices, languages, status)
"""

from fastapi import APIRouter, Body
from typing import Optional
import os

from src.api.news_api import router as news_api_router
from src.api.favorites_api import router as favorites_api_router
from src.api.auth_api import router as auth_api_router

router = APIRouter(prefix="/api", tags=["api"])

# 注册资讯路由 (新闻 CRUD + 收集)
router.include_router(news_api_router)

# 注册收藏分析路由
router.include_router(favorites_api_router)

# 注册微信认证路由
router.include_router(auth_api_router)

BASE_URL = os.environ.get("BASE_URL", "http://localhost:8001")

# ============ Voice Endpoints ============
@router.get("/voices")
async def get_voices():
    from src.services.tts import VoiceConfigService
    service = VoiceConfigService()
    return {"voices": service.get_all_voices()}

@router.get("/voices/available")
async def get_available_voices():
    """获取可用的声音列表"""
    from src.services.tts import VoiceConfigService
    service = VoiceConfigService()
    return {"voices": service.get_available_voices()}

@router.get("/voices/presets")
async def get_voice_presets():
    from src.services.tts import VoiceConfigService
    service = VoiceConfigService()
    return {
        "presets": [
            {"name": "professional_female", **service.apply_preset("professional_female")},
            {"name": "professional_male", **service.apply_preset("professional_male")},
            {"name": "friendly_female", **service.apply_preset("friendly_female")},
            {"name": "friendly_male", **service.apply_preset("friendly_male")},
        ]
    }

# ============ Language Endpoints ============
@router.get("/languages")
async def get_languages():
    from src.services.language_service import LanguageService
    service = LanguageService()
    return {"languages": service.get_languages()}

# ============ TTS Test Endpoint ============
@router.post("/voices/test")
async def test_tts(
    text: str = Body("测试文字转语音功能"),
    voice_id: str = Body("female-tianmei")
):
    """测试语音合成功能"""
    from src.services.minimax_client import get_minimax_client
    client = get_minimax_client()

    try:
        result = await client.text_to_speech(text, voice_id)
        return {
            "success": True,
            "voice_id": voice_id,
            "audio_url": result.get("data", {}).get("audio_url"),
            "available_voices": client.get_available_voices()
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "available_voices": client.get_available_voices()
        }

# ============ Health Check ============
@router.get("/status")
async def api_status():
    from src.config import MINIMAX_API_KEY
    from src.services.minimax_client import get_minimax_client
    import os

    # 简化的状态检查
    status = {
        "status": "ok",
        "minimax_api_key_set": bool(MINIMAX_API_KEY),
        "azure_tts_configured": bool(os.environ.get("AZURE_SPEECH_KEY") or os.environ.get("AZURE_TTS_KEY")),
        "errors": [],
        "minimax_api": {
            "available": False,
            "tts": {"available": False, "models": [], "error": None}
        },
        "tts_provider": "none",
        "recommendation": None
    }

    if MINIMAX_API_KEY:
        try:
            client = get_minimax_client()
            api_status = await client.check_api_status()
            status["minimax_api"] = api_status
        except Exception as e:
            status["minimax_api"]["error"] = str(e)

    if status["azure_tts_configured"]:
        status["tts_provider"] = "azure"
    elif status["minimax_api"].get("tts", {}).get("available"):
        status["tts_provider"] = "minimax"
    else:
        status["tts_provider"] = "mock"
        status["recommendation"] = (
            "TTS 不可用！请选择以下方案之一：\n"
            "1. 在 MiniMax 平台启用 Text-to-Speech 模型\n"
            "2. 配置 Azure TTS"
        )

    return status
