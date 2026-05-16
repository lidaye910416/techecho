"""
TTS 服务模块

包含:
- voice_config: 语音配置 (基础配置，先加载)
- azure_tts_client: Azure TTS 客户端
- tts_pregen: 新闻采集时的 TTS 预生成
- tts_service: 统一 TTS 服务（多引擎支持）

注意：tts_pregen 依赖 voice_config，需要在导入时保持顺序
"""

# 先加载基础配置
from src.services.tts.voice_config import VOICE_STYLES, MINIMAX_VOICES, EDGE_VOICES, VoiceConfigService
from src.services.tts.azure_tts_client import AzureTTSClient, get_azure_tts_client

# 再加载依赖配置的服务
from src.services.tts.tts_pregen import pre_generate_tts_for_news
from src.services.tts.tts_service import TTSService, get_tts_service, synthesize_text, batch_synthesize

__all__ = [
    'pre_generate_tts_for_news',
    'TTSService',
    'get_tts_service',
    'synthesize_text',
    'batch_synthesize',
    'VOICE_STYLES',
    'MINIMAX_VOICES',
    'EDGE_VOICES',
    'VoiceConfigService',
    'AzureTTSClient',
    'get_azure_tts_client',
]
