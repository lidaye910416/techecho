"""
Azure Cognitive Services TTS 客户端
作为 MiniMax TTS 的替代方案
"""
import httpx
import logging
import base64
from typing import Optional, Dict, Any
import os

logger = logging.getLogger(__name__)

class AzureTTSClient:
    """Azure TTS 客户端"""

    def __init__(self):
        self.api_key = os.environ.get("AZURE_SPEECH_KEY") or os.environ.get("AZURE_TTS_KEY")
        self.region = os.environ.get("AZURE_SPEECH_REGION") or os.environ.get("AZURE_TTS_REGION", "eastus")
        self.base_url = f"https://{self.region}.tts.speech.microsoft.com"

        if not self.api_key:
            logger.warning("Azure TTS API key not configured (AZURE_SPEECH_KEY or AZURE_TTS_KEY)")

        # Azure TTS 可用声音列表
        self.available_voices = [
            {"id": "zh-CN-XiaoxiaoNeural", "name": "晓晓 (女声)", "language": "zh-CN"},
            {"id": "zh-CN-YunxiNeural", "name": "云希 (男声)", "language": "zh-CN"},
            {"id": "zh-CN-YunyangNeural", "name": "云扬 (男声)", "language": "zh-CN"},
            {"id": "zh-CN-XiaoyiNeural", "name": "晓伊 (女声)", "language": "zh-CN"},
            {"id": "en-US-JennyNeural", "name": "Jenny (女声)", "language": "en-US"},
            {"id": "en-US-GuyNeural", "name": "Guy (男声)", "language": "en-US"},
        ]

    async def synthesize(
        self,
        text: str,
        voice_id: str = "zh-CN-XiaoxiaoNeural",
        speed: float = 1.0,
        pitch: float = 0.0
    ) -> Dict[str, Any]:
        """将文字转换为语音"""
        logger.info(f"Azure TTS: Synthesizing speech with voice {voice_id}")

        if not self.api_key:
            logger.warning("Azure TTS not configured, using mock")
            return self._get_mock_response()

        try:
            url = f"{self.base_url}/cognitiveservices/v1"

            headers = {
                "Ocp-Apim-Subscription-Key": self.api_key,
                "Content-Type": "application/ssml+xml",
                "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3"
            }

            # 构建 SSML
            ssml = f"""<speak version='1.0' xmlns='https://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'>
                <voice name='{voice_id}'>
                    <prosody rate='{speed}' pitch='{pitch}Hz'>
                        {text}
                    </prosody>
                </voice>
            </speak>"""

            response = httpx.post(url, headers=headers, content=ssml.encode("utf-8"), timeout=60.0)

            if response.status_code == 200:
                audio_base64 = base64.b64encode(response.content).decode("utf-8")
                audio_url = f"data:audio/mp3;base64,{audio_base64}"
                logger.info(f"Azure TTS success: {len(audio_base64)} bytes")
                return {
                    "data": {
                        "audio_url": audio_url,
                        "format": "mp3",
                        "provider": "azure"
                    }
                }
            else:
                logger.error(f"Azure TTS error: {response.status_code} - {response.text}")
                raise Exception(f"Azure TTS error: {response.status_code}")

        except Exception as e:
            logger.error(f"Azure TTS request failed: {e}")
            return self._get_mock_response()

    def _get_mock_response(self) -> Dict[str, Any]:
        """返回 Mock 数据"""
        return {
            "data": {
                "audio_url": "data:audio/mp3;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
                "format": "mp3",
                "provider": "mock"
            }
        }

    def get_available_voices(self) -> list:
        """返回可用声音列表"""
        return self.available_voices

    async def check_status(self) -> Dict[str, Any]:
        """检查 Azure TTS 配置状态"""
        return {
            "configured": bool(self.api_key),
            "region": self.region,
            "available_voices": len(self.available_voices)
        }

# 全局实例
_azure_tts_client: Optional[AzureTTSClient] = None

def get_azure_tts_client() -> AzureTTSClient:
    global _azure_tts_client
    if _azure_tts_client is None:
        _azure_tts_client = AzureTTSClient()
    return _azure_tts_client
