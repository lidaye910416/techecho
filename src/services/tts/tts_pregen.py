"""
TTS 预生成服务

新闻采集后，使用系统默认音色(voice3)为每条新闻预生成 TTS 音频，
上传到微信云存储持久化，并保存 MiniMax OSS URL 作为备份。

注意：TTS 失败时不使用替代服务，直接返回失败状态。
前端会处理 TTS 请求（携带用户登录态）。
"""

import logging
import tempfile
from pathlib import Path
from typing import List, Dict

import httpx

from src.config.settings import WECHAT_CLOUD_ENV
from src.services.minimax_client import get_minimax_client
from src.services.news import save_news_audio_urls
from src.services.tts.voice_config import VOICE_STYLES
from src.services.wechat_token import get_access_token

logger = logging.getLogger(__name__)

DEFAULT_VOICE = "voice3"


def _get_tts_text(news: Dict) -> str:
    """获取新闻的 TTS 文本"""
    title = news.get('title_zh') or news.get('title_en', '')
    content = news.get('content_zh') or news.get('content_en', '')
    text = f"{title}。{content}" if title else content
    return text[:300]


async def _upload_to_wechat_cloud(
    local_file: Path,
    cloud_path: str,
    access_token: str
) -> str | None:
    """
    上传文件到微信云存储

    Args:
        local_file: 本地文件路径
        cloud_path: 云存储路径 (如 audio/xxx.mp3)
        access_token: 微信 access_token

    Returns:
        cloud_file_id: 格式 cloud://{env}/{cloud_path}
        None: 上传失败
    """
    if not local_file.exists():
        logger.error(f"[TTS] File not found: {local_file}")
        return None

    if not WECHAT_CLOUD_ENV:
        logger.warning("[TTS] WECHAT_CLOUD_ENV not configured, skipping cloud upload")
        return None

    try:
        with open(local_file, 'rb') as f:
            file_content = f.read()

        url = f"https://api.weixin.qq.com/tcb/uploadfile?access_token={access_token}"
        data = {
            "env": WECHAT_CLOUD_ENV,
            "path": cloud_path,
        }
        files = {
            "file": (cloud_path.split("/")[-1], file_content, "audio/mpeg")
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, data=data, files=files)
            result = response.json()

        if result.get("errcode") == 0:
            cloud_file_id = f"cloud://{WECHAT_CLOUD_ENV}/{cloud_path}"
            logger.info(f"[TTS] Uploaded to cloud: {cloud_path} -> {cloud_file_id}")
            return cloud_file_id
        else:
            logger.error(f"[TTS] Cloud upload failed: {result}")
            return None

    except Exception as e:
        logger.error(f"[TTS] Cloud upload error: {e}")
        return None


async def pre_generate_tts_for_news(
    news_list: List[Dict],
    voice: str = DEFAULT_VOICE
) -> Dict[str, int]:
    """
    预生成 TTS 音频

    流程：
    1. 调用 MiniMax TTS API 生成音频
    2. 获取 MiniMax OSS URL（备份）
    3. 下载音频到临时文件
    4. 上传到微信云存储
    5. 保存 cloud_file_id + backup OSS URL 到数据库
    6. 删除本地临时文件

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

    # 获取 access_token（提前获取，避免重复调用）
    access_token = await get_access_token()
    if not access_token:
        logger.warning("[TTS] Cannot get access_token, will skip cloud upload but save backup URL")

    for i, news in enumerate(news_list):
        news_id = news.get('id', '')
        if not news_id:
            stats["skipped"] += 1
            continue

        try:
            text = _get_tts_text(news)
            if not text or len(text) < 10:
                stats["skipped"] += 1
                continue

            # 1. 调用 MiniMax TTS API
            result = await client.text_to_speech(
                text=text, voice_id=voice_id, speed=speed
            )

            # 2. 获取 MiniMax OSS URL（备份）
            # MiniMax client 返回 {"data": {"audio_url": ..., "extra_info": ...}}
            minimax_url = result.get("data", {}).get("audio_url", "")
            logger.info(f"[TTS] MiniMax result keys: {result.keys() if result else 'None'}")
            logger.info(f"[TTS] MiniMax audio_url: {minimax_url[:80] if minimax_url else 'EMPTY'}")
            if not minimax_url:
                raise Exception("empty audio_url from MiniMax")

            # 3. 下载音频到临时文件
            async with httpx.AsyncClient(timeout=60.0) as http_client:
                response = await http_client.get(minimax_url, timeout=60.0)
                if response.status_code != 200:
                    raise Exception(f"download fail: HTTP {response.status_code}")
                audio_content = response.content

            # 4. 上传到微信云存储
            cloud_path = f"audio/{news_id}.mp3"
            cloud_file_id = None

            if access_token:
                with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as tmp:
                    tmp.write(audio_content)
                    tmp_path = Path(tmp.name)

                try:
                    cloud_file_id = await _upload_to_wechat_cloud(tmp_path, cloud_path, access_token)
                finally:
                    # 删除本地临时文件
                    try:
                        tmp_path.unlink()
                    except Exception:
                        pass
            else:
                logger.warning(f"[TTS] No access_token, skipping cloud upload for {news_id[:24]}")

            # 5. 保存到数据库
            # cloud_file_id: 微信云存储 fileID（仅上传成功时有值）
            # audio_url: 主音频 URL（优先用云存储，失败时用 MiniMax OSS）
            # backup_audio_url: MiniMax OSS URL（始终保存）
            if cloud_file_id:
                db_audio_url = cloud_file_id
            else:
                # 如果云存储上传失败，用 MiniMax URL 作为 audio_url（降级）
                db_audio_url = minimax_url

            logger.info(f"[TTS] Saving to DB: news_id={news_id[:24]}, audio_url={db_audio_url[:80] if db_audio_url else 'None'}, backup={minimax_url[:80] if minimax_url else 'None'}, cloud={cloud_file_id}")
            await save_news_audio_urls(news_id, db_audio_url, minimax_url, cloud_file_id)

            stats["success"] += 1
            logger.info(f"TTS pregen [{i+1}/{len(news_list)}] ok {news_id[:24]}... ({len(audio_content)}B)")

        except Exception as e:
            stats["failed"] += 1
            logger.warning(f"TTS pregen [{i+1}/{len(news_list)}] fail {news_id[:24]}: {str(e)[:80]}")
            continue

    logger.info(f"TTS pregen done: ok={stats['success']} skip={stats['skipped']} fail={stats['failed']}")
    return stats
