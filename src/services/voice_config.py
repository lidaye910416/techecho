"""
统一语音配置服务

整合所有 TTS 提供商的语音配置
"""

from typing import Dict, List, Optional, Callable


# ===== 语音风格定义 (播客风格四声线模板) =====

VOICE_STYLES: Dict[str, Dict] = {
    "voice3": {
        "name": "温婉女声",
        "minimax": "female-yujie",
        "edge": "zh-CN-XiaoyiNeural",
        "azure": "zh-CN-XiaoyiNeural",
        "gender": "female",
        "speed": 1.15,
        "desc": "知性柔和，适合行业洞察",
    },
    "voice1": {
        "name": "沉稳男声",
        "minimax": "male-qn-qingse",
        "edge": "zh-CN-YunxiNeural",
        "azure": "zh-CN-YunxiNeural",
        "gender": "male",
        "speed": 1.1,
        "desc": "低音磁性，适合深度长文",
    },
    "voice2": {
        "name": "清朗男声",
        "minimax": "male-qn-jingying",
        "edge": "zh-CN-YunyangNeural",
        "azure": "zh-CN-YunyangNeural",
        "gender": "male",
        "speed": 1.2,
        "desc": "明亮有力，适合科技快讯",
    },
    "voice4": {
        "name": "清新女声",
        "minimax": "female-tianmei",
        "edge": "zh-CN-XiaoxiaoNeural",
        "azure": "zh-CN-XiaoxiaoNeural",
        "gender": "female",
        "speed": 1.25,
        "desc": "甜美自然，适合轻松播报",
    },
}


# ===== MiniMax 系统语音 =====

MINIMAX_VOICES: List[Dict] = [
    # 男声
    {"id": "male-qn-qingse", "name": "青叔·播报 (男)", "gender": "male", "age": "young", "available": True},
    {"id": "male-qn-jingying", "name": "少年·解读 (男)", "gender": "male", "age": "young", "available": True},
    {"id": "male-qn-shuanglang", "name": "青年爽朗 (男)", "gender": "male", "age": "young", "available": True},
    {"id": "male-qn-wenrou", "name": "青年温柔 (男)", "gender": "male", "age": "young", "available": True},
    # 女声
    {"id": "female-tianmei", "name": "甜美女声", "gender": "female", "age": "young", "available": True},
    {"id": "female-shaonv", "name": "少女声", "gender": "female", "age": "young", "available": True},
    {"id": "female-yujie", "name": "御姐女声", "gender": "female", "age": "adult", "available": True},
    {"id": "female-chengshu", "name": "成熟女声", "gender": "female", "age": "middle", "available": True},
    {"id": "male-qn", "name": "青年男声", "gender": "male", "age": "young", "available": False},
]


# ===== edge-tts / Azure 语音 =====

EDGE_VOICES: List[Dict] = [
    {"id": "zh-CN-XiaoxiaoNeural", "name": "晓晓 (女声)", "language": "zh-CN", "gender": "female"},
    {"id": "zh-CN-YunxiNeural", "name": "云希 (男声)", "language": "zh-CN", "gender": "male"},
    {"id": "zh-CN-XiaoyiNeural", "name": "晓伊 (女声)", "language": "zh-CN", "gender": "female"},
    {"id": "zh-CN-YunyangNeural", "name": "云扬 (男声)", "language": "zh-CN", "gender": "male"},
    {"id": "en-US-JennyNeural", "name": "Jenny (女声)", "language": "en-US", "gender": "female"},
    {"id": "en-US-GuyNeural", "name": "Guy (男声)", "language": "en-US", "gender": "male"},
]


class VoiceConfigService:
    """语音配置服务"""

    def __init__(self):
        self.voices = MINIMAX_VOICES

    def get_all_voices(self) -> List[Dict]:
        return self.voices

    def get_available_voices(self) -> List[Dict]:
        """只返回可用的声音"""
        return [v for v in self.voices if v.get("available", True)]

    def get_voices_by_gender(self, gender: str) -> List[Dict]:
        return [v for v in self.voices if v["gender"] == gender]

    def get_voice_style(self, voice_id: str) -> Optional[Dict]:
        """获取指定语音风格的配置"""
        return VOICE_STYLES.get(voice_id)

    def get_all_voice_styles(self) -> List[str]:
        """返回所有可用的语音风格 ID"""
        return list(VOICE_STYLES.keys())

    def get_emotion_styles(self) -> List[str]:
        return ["professional", "warm", "energetic", "calm", "friendly"]

    def apply_preset(self, preset_name: str) -> Dict:
        presets = {
            "professional_female": {"voice_id": "female-yujie", "speed": 1.15},
            "professional_male": {"voice_id": "male-qn-qingse", "speed": 1.1},
            "friendly_female": {"voice_id": "female-tianmei", "speed": 1.25},
            "friendly_male": {"voice_id": "male-qn-jingying", "speed": 1.2},
            "energetic_female": {"voice_id": "female-yujie", "speed": 1.3},
            "calm_male": {"voice_id": "male-qn-qingse", "speed": 1.05},
        }
        return presets.get(preset_name, presets["professional_female"])


# 全局实例
voice_config = VoiceConfigService()
