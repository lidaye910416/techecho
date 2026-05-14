"""
统一 TTS 服务

功能:
1. 统一的 TTS 接口
2. 多引擎支持 (MiniMax, edge-tts, Azure)
3. 自动降级策略
4. 音频缓存管理
"""

import asyncio
import hashlib
import logging
import os
from pathlib import Path
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from enum import Enum

import edge_tts
import httpx

from src.services.minimax_client import get_minimax_client
from src.services.azure_tts_client import get_azure_tts_client
from src.services.voice_config import VOICE_STYLES, MINIMAX_VOICES, EDGE_VOICES

logger = logging.getLogger(__name__)


class TTSProvider(Enum):
    """TTS 提供商枚举"""
    MINIMAX = "minimax"
    EDGE_TTS = "edge-tts"
    AZURE = "azure"
    MOCK = "mock"


@dataclass
class TTSResult:
    """TTS 结果"""
    success: bool
    audio_url: str  # 相对于 /data/audio/ 的路径
    cached: bool
    engine: str
    message: str = ""


@dataclass
class TTSStats:
    """TTS 统计"""
    minimax: int = 0
    edge_tts: int = 0
    azure: int = 0
    cached: int = 0
    failed: int = 0


class TTSService:
    """
    统一 TTS 服务

    使用策略:
    1. 优先 MiniMax (高质量)
    2. MiniMax 失败/配额用尽 → edge-tts (兜底)
    3. edge-tts 失败 → Azure TTS
    4. 都失败 → Mock
    """

    MAX_TEXT_LENGTH = 500  # 单次 TTS 最大字符数
    CACHE_DIR = "app/data/audio"

    def __init__(self, audio_dir: Optional[Path] = None):
        # MiniMax 客户端
        self.minimax = get_minimax_client()
        self.minimax_api_key = os.getenv("MINIMAX_API_KEY", "")
        self.minimax_available = True  # 标记 MiniMax 是否可用

        # Azure 客户端
        self.azure = get_azure_tts_client()

        # 音频目录
        if audio_dir:
            self.audio_dir = Path(audio_dir)
        else:
            self.audio_dir = Path(__file__).parent.parent.parent / "app" / "data" / "audio"
        self.audio_dir.mkdir(parents=True, exist_ok=True)

        # HTTP 客户端 (用于下载 MiniMax 音频)
        self.client = httpx.AsyncClient(timeout=60.0)

    async def close(self):
        """关闭资源"""
        await self.client.aclose()

    def _get_cache_key(self, news_id: str, voice_id: str) -> str:
        """生成缓存 key"""
        return hashlib.md5((news_id + voice_id).encode()).hexdigest()

    def _get_cache_path(self, news_id: str, voice_id: str) -> Path:
        """获取缓存文件路径"""
        cache_key = self._get_cache_key(news_id, voice_id)
        return self.audio_dir / f"{cache_key}.mp3"

    def _is_cached(self, news_id: str, voice_id: str) -> bool:
        """检查是否已缓存"""
        return self._get_cache_path(news_id, voice_id).exists()

    def _get_text_for_tts(self, news_dict: Dict) -> str:
        """从新闻字典获取 TTS 文本"""
        lang = news_dict.get('lang', 'zh')
        if lang == 'zh':
            text = news_dict.get('content_zh') or news_dict.get('summary_zh') or news_dict.get('title_zh', '')
        else:
            text = news_dict.get('content_en') or news_dict.get('summary_en') or news_dict.get('title_en', '')
        return text[:self.MAX_TEXT_LENGTH]

    async def _synthesize_minimax(
        self,
        news_id: str,
        text: str,
        voice_id: str,
        audio_file: Path
    ) -> TTSResult:
        """使用 MiniMax API 生成语音"""
        if not self.minimax_api_key:
            return TTSResult(False, "", False, "minimax", "API密钥未配置")

        voice_style = VOICE_STYLES.get(voice_id, {})
        minimax_voice = voice_style.get("minimax", "female-tianmei")
        speed = voice_style.get("speed", 1.0)

        try:
            # 调用 MiniMax TTS API
            result = await self.minimax.text_to_speech(
                text=text,
                voice_id=minimax_voice,
                speed=speed
            )

            audio_url = result.get("data", {}).get("audio_url", "")
            if not audio_url:
                return TTSResult(False, "", False, "minimax", "未获取到音频URL")

            # 下载音频文件
            response = await self.client.get(audio_url, timeout=60.0)
            if response.status_code == 200:
                with open(audio_file, 'wb') as f:
                    f.write(response.content)
                return TTSResult(
                    success=True,
                    audio_url=f"/data/audio/{audio_file.name}",
                    cached=False,
                    engine="minimax"
                )

            return TTSResult(False, "", False, "minimax", f"下载失败: {response.status_code}")

        except Exception as e:
            error_msg = str(e)
            # 检查是否是配额问题
            if "quota" in error_msg.lower() or "limit" in error_msg.lower():
                self.minimax_available = False
                return TTSResult(False, "", False, "minimax", "配额用尽")
            return TTSResult(False, "", False, "minimax", error_msg)

    async def _synthesize_edge_tts(
        self,
        news_id: str,
        text: str,
        voice_id: str,
        audio_file: Path
    ) -> TTSResult:
        """使用 edge-tts 生成语音"""
        voice_style = VOICE_STYLES.get(voice_id, {})
        edge_voice = voice_style.get("edge", "zh-CN-XiaoxiaoNeural")
        speed = voice_style.get("speed", 1.0)
        # 将 speed 转换为 edge-tts rate 格式: speed=1.0 → '+0%', speed=1.15 → '+15%'
        # 注意：使用 round() 避免浮点精度问题
        rate_percent = round((speed - 1.0) * 100)
        rate = f"+{rate_percent}%"

        try:
            communicate = edge_tts.Communicate(text, edge_voice, rate=rate)
            await communicate.save(str(audio_file))

            return TTSResult(
                success=True,
                audio_url=f"/data/audio/{audio_file.name}",
                cached=False,
                engine="edge-tts"
            )
        except Exception as e:
            return TTSResult(False, "", False, "edge-tts", str(e))

    async def synthesize_for_voice(
        self,
        news_id: str,
        text: str,
        voice_id: str
    ) -> TTSResult:
        """
        为指定语音生成 TTS

        策略:
        1. 检查缓存
        2. 优先 MiniMax
        3. 降级 edge-tts
        """
        # 检查缓存
        if self._is_cached(news_id, voice_id):
            cache_path = self._get_cache_path(news_id, voice_id)
            logger.info(f"TTS cache hit: {news_id}/{voice_id}")
            return TTSResult(
                success=True,
                audio_url=f"/data/audio/{cache_path.name}",
                cached=True,
                engine="cached"
            )

        audio_file = self._get_cache_path(news_id, voice_id)

        # 优先 MiniMax
        if self.minimax_available:
            result = await self._synthesize_minimax(news_id, text, voice_id, audio_file)
            if result.success:
                logger.info(f"TTS MiniMax success: {voice_id}")
                return result
            logger.warning(f"TTS MiniMax failed: {result.message}, falling back to edge-tts")

        # 降级到 edge-tts
        result = await self._synthesize_edge_tts(news_id, text, voice_id, audio_file)
        if result.success:
            logger.info(f"TTS edge-tts success: {voice_id}")
        else:
            logger.error(f"TTS all providers failed: {result.message}")

        return result

    async def synthesize_for_news(
        self,
        news_dict: Dict,
        voice_ids: Optional[List[str]] = None
    ) -> tuple[List[TTSResult], TTSStats]:
        """
        为单条新闻生成多种语音

        Args:
            news_dict: 新闻字典，包含 id, lang, content_zh/content_en 等
            voice_ids: 语音 ID 列表，默认使用所有 VOICE_STYLES

        Returns:
            (结果列表, 统计信息)
        """
        news_id = news_dict.get('id', '')
        text = self._get_text_for_tts(news_dict)

        if not text:
            return [], TTSStats()

        voice_ids = voice_ids or list(VOICE_STYLES.keys())
        results = []
        stats = TTSStats()

        for voice_id in voice_ids:
            result = await self.synthesize_for_voice(news_id, text, voice_id)
            results.append(result)

            # 统计
            if result.cached:
                stats.cached += 1
            elif result.engine == "minimax":
                stats.minimax += 1
            elif result.engine == "edge-tts":
                stats.edge_tts += 1
            elif result.engine == "azure":
                stats.azure += 1
            elif not result.success:
                stats.failed += 1

        return results, stats

    def synthesize_for_news_sync(
        self,
        news_dict: Dict,
        voice_ids: Optional[List[str]] = None
    ) -> tuple[List[Dict], TTSStats]:
        """
        同步版本: 为单条新闻生成多种语音

        Returns:
            (字典列表, 统计信息)
            字典格式: {news_id, voice_id, audio_url, cached, engine}
        """
        results, stats = asyncio.run(self.synthesize_for_news(news_dict, voice_ids))

        output = [{
            'news_id': news_dict.get('id', ''),
            'voice_id': r.audio_url.split('/')[-1].replace('.mp3', ''),
            'audio_url': r.audio_url,
            'cached': r.cached,
            'engine': r.engine
        } for r in results if r.success]

        return output, stats

    def calculate_credits(self, text: str) -> int:
        """计算消耗的配额"""
        return max(1, len(text) // 60)

    def get_available_voices(self) -> List[Dict]:
        """返回所有可用的声音"""
        voices = []

        # MiniMax 声音
        for v in MINIMAX_VOICES:
            if v.get("available"):
                voices.append({
                    "id": v["id"],
                    "name": v["name"],
                    "gender": v["gender"],
                    "provider": "minimax"
                })

        # Azure 声音
        for v in self.azure.get_available_voices():
            voices.append({
                "id": v["id"],
                "name": v["name"],
                "gender": v["gender"],
                "language": v["language"],
                "provider": "azure"
            })

        return voices

    async def check_status(self) -> Dict[str, Any]:
        """检查 TTS 服务状态"""
        return {
            "minimax": {
                "configured": bool(self.minimax_api_key),
                "available": self.minimax_available,
            },
            "azure": {
                "configured": bool(os.getenv("AZURE_SPEECH_KEY")),
            },
            "cache_dir": str(self.audio_dir),
            "cache_count": len(list(self.audio_dir.glob("*.mp3"))) if self.audio_dir.exists() else 0,
        }


# ===== 便捷函数 =====

_tts_service: Optional[TTSService] = None


def get_tts_service(audio_dir: Optional[Path] = None) -> TTSService:
    """获取 TTS 服务单例"""
    global _tts_service
    if _tts_service is None:
        _tts_service = TTSService(audio_dir)
    return _tts_service


async def synthesize_text(
    text: str,
    voice_id: str = "voice1",
    news_id: str = ""
) -> TTSResult:
    """便捷函数: 将文本转换为语音"""
    service = get_tts_service()
    news_id = news_id or hashlib.md5(text.encode()).hexdigest()[:8]
    return await service.synthesize_for_voice(news_id, text, voice_id)


async def batch_synthesize(
    news_list: List[Dict],
    voice_ids: Optional[List[str]] = None
) -> tuple[List[Dict], TTSStats]:
    """便捷函数: 批量生成 TTS"""
    service = get_tts_service()
    all_results = []
    total_stats = TTSStats()

    for news in news_list:
        results, stats = await service.synthesize_for_news(news, voice_ids)
        all_results.extend(results)

        # 累加统计
        total_stats.minimax += stats.minimax
        total_stats.edge_tts += stats.edge_tts
        total_stats.azure += stats.azure
        total_stats.cached += stats.cached
        total_stats.failed += stats.failed

    return all_results, total_stats
