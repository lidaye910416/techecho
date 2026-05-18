import httpx
import logging
import base64
import os
from typing import Optional, Dict, Any
from src.config import MINIMAX_API_KEY, MINIMAX_BASE_URL

logger = logging.getLogger(__name__)

class MiniMaxClient:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or MINIMAX_API_KEY
        # 正确的 Base URL
        self.base_url = "https://api.minimaxi.com"

        if not self.api_key:
            logger.warning("MINIMAX_API_KEY is not set!")

        self.client = httpx.AsyncClient(timeout=120.0)

        # MiniMax 官方系统 Voice ID
        self.available_voices = [
            # 男声
            "male-qn-qingse", "male-qn-jingying", "male-qn-shuanglang", "male-qn-wenrou",
            # 女声
            "female-tianmei", "female-shaonv", "female-yujie", "female-chengshu",
        ]

        # 支持的 TTS 模型 (按优先级)
        self.tts_models = ["speech-2.8-hd", "speech-2.6-hd", "speech-02-hd"]
        # 支持的视频模型 (根据官方文档)
        self.video_models = ["MiniMax-Hailuo-2.3", "MiniMax-Hailuo-2.3-Fast", "I2V-01-Director", "I2V-01-live", "I2V-01"]
        # 文本对话模型（M2.5 非推理模型，输出干净无 <think> 标签）
        self.chat_model = "MiniMax-M2.5"

    async def _make_request(
        self,
        method: str,
        endpoint: str,
        data: Optional[Dict] = None
    ) -> Dict[str, Any]:
        if not self.api_key:
            raise ValueError("MINIMAX_API_KEY is not configured")

        url = f"{self.base_url}/{endpoint}"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        logger.info(f"MiniMax API request: {method} {endpoint}")

        try:
            if method.upper() == "GET":
                response = await self.client.get(url, headers=headers, timeout=60.0)
            else:
                response = await self.client.post(url, headers=headers, json=data, timeout=120.0)

            logger.info(f"MiniMax API response: {response.status_code}")

            # 尝试解析 JSON 响应
            try:
                result = response.json()
            except Exception:
                logger.warning(f"Non-JSON response: {response.text[:200]}")
                raise Exception(f"MiniMax API returned non-JSON response: {response.status_code}")

            # 检查 API 错误 (status_code != 0 表示失败)
            if "base_resp" in result and result["base_resp"].get("status_code", 0) != 0:
                error_msg = result["base_resp"].get("status_msg", "Unknown error")
                raise Exception(f"MiniMax API error: {error_msg}")

            if response.status_code >= 400:
                logger.error(f"MiniMax API error: {response.status_code} - {response.text}")
                raise Exception(f"MiniMax API error: {response.status_code}")

            return result

        except Exception as e:
            logger.error(f"MiniMax API request failed: {str(e)}")
            raise

    def get_available_voices(self) -> list:
        """返回可用的声音列表"""
        return self.available_voices

    async def text_to_speech(
        self,
        text: str,
        voice_id: str = "female-tianmei",
        speed: float = 1.0
    ) -> Dict[str, Any]:
        """
        TTS 同步调用 - 直接返回音频 URL

        API: POST https://api.minimaxi.com/v1/t2a_v2
        使用 output_format: url 返回可访问的音频 URL
        """
        logger.info(f"TTS: {text[:50]}... (voice: {voice_id}, speed: {speed})")

        # 尝试不同的模型
        for model in self.tts_models:
            try:
                data = {
                    "model": model,
                    "text": text,
                    "stream": False,
                    "voice_setting": {
                        "voice_id": voice_id,
                        "speed": round(speed, 2),
                        "volume": 1.0,
                        "pitch": 0
                    },
                    "output_format": "url"  # 返回 URL 格式
                }
                result = await self._make_request("POST", "v1/t2a_v2", data)

                # 返回结果包含 audio URL
                audio_url = result.get("data", {}).get("audio", "")
                extra_info = result.get("extra_info", {})

                logger.info(f"TTS success: {audio_url[:80]}...")

                return {
                    "data": {
                        "audio_url": audio_url,
                        "extra_info": extra_info
                    }
                }
            except Exception as e:
                error_str = str(e)
                if "not support model" in error_str or "invalid params" in error_str:
                    logger.warning(f"Model {model} failed, trying next...")
                    continue
                else:
                    raise

        raise Exception("所有 TTS 模型都不可用")

    async def video_generation(
        self,
        prompt: str,
        model: str = None
    ) -> Dict[str, Any]:
        """
        视频生成 - 提交视频生成任务

        API: POST https://api.minimaxi.com/v1/video_generation
        """
        logger.info(f"Video generation: {prompt[:50]}...")

        # 尝试不同的模型
        video_models = model and [model] or self.video_models

        for vm in video_models:
            try:
                data = {
                    "model": vm,
                    "prompt": prompt
                }
                result = await self._make_request("POST", "v1/video_generation", data)
                logger.info(f"Video model {vm} success: task_id={result.get('task_id')}")
                return result
            except Exception as e:
                error_str = str(e)
                if "not support model" in error_str:
                    logger.warning(f"Model {vm} not supported, trying next...")
                    continue
                else:
                    raise

        raise Exception("所有视频模型都不可用 (Token Plan 问题)")

    async def video_generation_i2v(
        self,
        prompt: str,
        image_url: str,
        model: str = "MiniMax-Hailuo-2.3"
    ) -> Dict[str, Any]:
        """
        图生视频 - 根据图片生成视频

        API: POST https://api.minimaxi.com/v1/video_generation
        支持模型: MiniMax-Hailuo-2.3, MiniMax-Hailuo-2.3-Fast, I2V-01-Director, I2V-01-live, I2V-01
        """
        logger.info(f"I2V: {prompt[:50]}... (image: {image_url})")

        # 尝试不同的模型
        for video_model in ["MiniMax-Hailuo-2.3", "MiniMax-Hailuo-2.3-Fast", "I2V-01-Director", "I2V-01-live", "I2V-01"]:
            try:
                data = {
                    "model": video_model,
                    "prompt": prompt,
                    "first_frame_image": image_url
                }

                # MiniMax-Hailuo 系列需要 duration 和 resolution
                if "Hailuo" in video_model:
                    data["duration"] = 6
                    data["resolution"] = "768P"

                result = await self._make_request("POST", "v1/video_generation", data)
                logger.info(f"Video model {video_model} success: {result}")
                return result
            except Exception as e:
                error_str = str(e)
                if "not support model" in error_str or "incorrect model" in error_str:
                    logger.warning(f"Model {video_model} not supported, trying next...")
                    continue
                else:
                    raise

        raise Exception("所有视频模型都不可用 (Token Plan 问题)")

    async def speech_to_video(self, audio_url: str, image_url: str) -> Dict[str, Any]:
        """
        唇形同步 - 根据音频和图片生成视频

        这是简化版本，实际需要使用视频生成 API
        """
        logger.info(f"Speech to video: audio={audio_url}, image={image_url}")

        # 使用 I2V (图生视频) 模式
        return await self.video_generation_i2v(
            prompt="A person speaking naturally with lip-sync",
            image_url=image_url
        )

    async def check_api_status(self) -> Dict[str, Any]:
        """检查 API 状态"""
        status = {
            "api_key_set": bool(self.api_key),
            "base_url": self.base_url,
            "tts": {"available": False, "models": [], "error": None, "endpoint": "v1/t2a_v2"},
            "video": {"available": False, "models": [], "error": None, "endpoint": "v1/video_generation"}
        }

        # 测试 TTS
        for model in self.tts_models:
            try:
                result = await self._make_request("POST", "v1/t2a_v2", {
                    "model": model,
                    "text": "测试",
                    "stream": False,
                    "voice_setting": {"voice_id": "female-tianmei"},
                    "output_format": "url"
                })
                if result.get("base_resp", {}).get("status_code") == 0:
                    status["tts"]["available"] = True
                    status["tts"]["models"].append(model)
            except Exception as e:
                error_str = str(e)
                if "not support model" in error_str:
                    continue
                status["tts"]["error"] = error_str

        # 视频生成是可选功能，跳过测试避免误报
        status["video"]["available"] = False
        status["video"]["error"] = "需要 Token Plan 授权（可选功能）"

        return status

    async def close(self):
        await self.client.aclose()

    # ============ 文本对话 API ============

    async def chat(
        self,
        messages: list,
        model: str = None
    ) -> Dict[str, Any]:
        """
        文本对话 - 使用 MiniMax 对话模型

        API: POST https://api.minimaxi.com/v1/chat/completions (OpenAI 兼容)
        """
        model = model or self.chat_model
        logger.info(f"Chat request with model: {model}")

        # 尝试多个文本对话模型 (按优先级)
        # 注意：MiniMax-M2.7 是推理模型，输出包含 <think> 标签，不适合直接使用
        # 优先使用 MiniMax-M2.5（非推理模型）获得干净输出
        text_models = model and [model] or [
            "MiniMax-M2.5",
            "abab6.5s-chat",
            "MiniMax-M2.7",
        ]

        for text_model in text_models:
            try:
                data = {
                    "model": text_model,
                    "messages": messages,
                    "stream": False
                }

                result = await self._make_request("POST", "v1/chat/completions", data)

                # OpenAI 兼容格式: choices[0].message.content
                choices = result.get("choices", [])
                if choices:
                    msg = choices[0].get("message", {})
                    content = msg.get("content", "")
                    if content:
                        return {
                            "content": content,
                            "role": "assistant",
                            "model": text_model
                        }

                # 兼容 BaseResp 格式
                if result.get("base_resp", {}).get("status_code", -1) != 0:
                    continue

            except Exception as e:
                error_str = str(e)
                if any(kw in error_str for kw in ["not support model", "2061", "invalid model"]):
                    logger.warning(f"Model {text_model} not supported, trying next...")
                    continue
                else:
                    raise

        raise Exception("所有文本对话模型都不可用")

    async def check_text_api_status(self) -> Dict[str, Any]:
        """检查文本对话 API 状态"""
        status = {
            "available": False,
            "models": [],
            "error": None
        }

        text_models = [
            "MiniMax-M2.7",
            "MiniMax-M2.5",
        ]

        for model in text_models:
            try:
                result = await self._make_request("POST", "v1/chat/completions", {
                    "model": model,
                    "messages": [{"role": "user", "content": "Hi"}],
                    "stream": False,
                    "max_tokens": 10
                })
                choices = result.get("choices", [])
                if choices and choices[0].get("message", {}).get("content"):
                    status["available"] = True
                    status["models"].append(model)
                elif result.get("base_resp", {}).get("status_code") == 0:
                    status["available"] = True
                    status["models"].append(model)
            except Exception as e:
                error_str = str(e)
                if any(kw in error_str for kw in ["not support model", "2061", "invalid model"]):
                    continue
                status["error"] = error_str

        return status

    async def analyze_text(
        self,
        text: str,
        analysis_type: str = "summarize"
    ) -> Dict[str, Any]:
        """
        文本分析 - 通用文本分析接口

        Args:
            text: 待分析文本
            analysis_type: 分析类型 (summarize/keywords/sentiment)
        """
        prompts = {
            "summarize": f"请为以下新闻生成简洁的中文摘要（100字以内），突出核心信息：\n\n{text}\n\n摘要：",
            "keywords": f"请从以下新闻中提取5-8个关键词，用逗号分隔：\n\n{text}\n\n关键词：",
            "sentiment": f"请分析以下新闻的情感倾向，返回JSON格式：\n{{\"sentiment\": \"positive/neutral/negative\", \"score\": -1到1的小数, \"reason\": \"简要原因\"}}\n\n新闻内容：\n{text}\n\n分析结果："
        }

        prompt = prompts.get(analysis_type, prompts["summarize"])

        result = await self.chat([{"role": "user", "content": prompt}])

        return {
            "analysis_type": analysis_type,
            "result": result.get("content", ""),
            "raw_text": text[:200] + "..." if len(text) > 200 else text
        }

# 全局客户端实例
_minimax_client: Optional[MiniMaxClient] = None

def get_minimax_client() -> MiniMaxClient:
    global _minimax_client
    if _minimax_client is None:
        _minimax_client = MiniMaxClient()
    return _minimax_client
