"""
TTS 预生成服务

新闻采集后，使用系统默认音色(voice3)为每条新闻预生成 TTS 音频，
存储到 data/audio/ 目录，写入数据库 audio_url 字段。
用户点击「朗读」时直接播放缓存，避免重复消耗 MiniMax API 配额。

注意：TTS 失败时不使用替代服务，直接返回失败状态。
前端会处理 TTS 请求（携带用户登录态）。
"""

import os
import logging
import httpx
from pathlib import Path
from typing import List, Dict

from src.services.tts.voice_config import VOICE_STYLES
from src.services.minimax_client import get_minimax_client
from src.services.news import _save_news_audio

logger = logging.getLogger(__name__)

DEFAULT_VOICE = "voice3"
# 修复：使用正确的项目根目录路径
AUDIO_DIR = Path(__file__).parent.parent.parent.parent / "data" / "audio"


def _get_audio_path(news_id: str) -> Path:
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    return AUDIO_DIR / f"{news_id}_v3.mp3"


def _get_tts_text(news: Dict) -> str:
    title = news.get('title_zh') or news.get('title_en', '')
    content = news.get('content_zh') or news.get('content_en', '')
    text = f"{title}。{content}" if title else content
    return text[:300]


async def pre_generate_tts_for_news(
    news_list: List[Dict],
    voice: str = DEFAULT_VOICE
) -> Dict[str, int]:
    """
    预生成 TTS 音频（仅使用 MiniMax，不降级）

    注意：
    - 只使用 MiniMax API
    - 失败时不使用 edge-tts 等替代服务
    - 前端会处理用户请求时的 TTS 生成（携带登录态）

    Returns:
        stats: {"success": int, "skipped": int, "failed": int}
    """
    style = VOICE_STYLES.get(voice, VOICE_STYLES[DEFAULT_VOICE])
    voice_id = style["minimax"]
    speed = style["speed"]

    stats = {"success": 0, "skipped": 0, "failed": 0}

    if not news_list:
        return stats

    logger.info(f"TTS pregen start: {len(news_list)} news, voice={voice}({style['name']}), id={voice_id}, speed={speed}x")

    client = get_minimax_client()
    http_client = httpx.AsyncClient(timeout=60.0)

    try:
        for i, news in enumerate(news_list):
            news_id = news.get('id', '')
            if not news_id:
                stats["skipped"] += 1
                continue

            audio_path = _get_audio_path(news_id)
            if audio_path.exists():
                stats["skipped"] += 1
                continue

            try:
                text = _get_tts_text(news)
                if not text or len(text) < 10:
                    stats["skipped"] += 1
                    continue

                result = await client.text_to_speech(
                    text=text, voice_id=voice_id, speed=speed
                )

                audio_url = result.get("data", {}).get("audio_url", "")
                if not audio_url:
                    raise Exception("empty audio_url")

                response = await http_client.get(audio_url, timeout=60.0)
                if response.status_code != 200:
                    raise Exception(f"download fail: HTTP {response.status_code}")

                with open(audio_path, 'wb') as f:
                    f.write(response.content)

                db_audio_url = f"/data/audio/{news_id}_v3.mp3"
                await _save_news_audio(news_id, db_audio_url)

                stats["success"] += 1
                logger.info(f"TTS pregen [{i+1}/{len(news_list)}] ok {news_id[:24]}... ({len(response.content)}B)")

            except Exception as e:
                stats["failed"] += 1
                logger.warning(f"TTS pregen [{i+1}/{len(news_list)}] fail {news_id[:24]}: {str(e)[:80]}")
                # 注意：失败时不使用替代 TTS，直接跳过
                # 前端会在用户点击时发起新的 TTS 请求
                continue

    finally:
        await http_client.aclose()

    logger.info(f"TTS pregen done: ok={stats['success']} skip={stats['skipped']} fail={stats['failed']}")
    return stats
