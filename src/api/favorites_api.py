"""
收藏新闻 AI 分析 API

提供收藏新闻的分析和 TTS 语音播报功能
"""

from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
from typing import Optional, List
import json
import logging

from src.services.minimax_client import get_minimax_client
from src.config import MINIMAX_API_KEY

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/favorites", tags=["favorites"])


class AnalyzeRequest(BaseModel):
    """分析请求"""
    news_ids: Optional[List[str]] = None
    limit: Optional[int] = 10


class TTSRequest(BaseModel):
    """TTS 请求"""
    text: str


# ============ 精细化提示词 ============

ANALYSIS_PROMPT = """你是一位资深科技媒体主笔，有10年科技行业报道经验。
你的语言风格：专业但不晦涩，犀利但有温度，善于用比喻和案例让复杂技术变得易懂。

请根据以下新闻内容，按照固定模板输出分析报告：

## 一句话总结
用一句话概括这批新闻的核心主题，15-25个字，类似新闻标题风格。
格式：【核心发现】xxxxxxxxxxxxxxxx

## 现状扫描
2-3段，每段3-5句话。分析当前科技领域的实际情况，引用具体新闻佐证。
要求：
- 段落开头用【数据说话】或【热点追踪】或【产品动态】等标签开头
- 穿插具体数字和案例
- 语气自信但留有余地，用「似乎」「可能」「值得关注」等词汇
- 避免绝对化表达

## 趋势研判
2-3段，每段3-5句话。预测未来1-3个月的走向。
要求：
- 段落开头用【行业风向】或【技术前沿】或【市场信号】等标签开头
- 给出具体的时间节点和预期
- 用「预计」「可能」「或将」等词汇
- 解释为什么会有这个趋势

## 值得注意的问题
2-3段，每段2-4句话。指出潜在风险和挑战。
要求：
- 段落开头用【风险提示】或【隐忧观察】或【待解难题】等标签开头
- 指出问题但不制造焦虑
- 提供角度而非答案
- 用「需要关注」「警惕」「审视」等词汇

## 收尾金句
一句话作为结尾，20-30个字，有洞察力，给人思考空间。
格式：【主笔手记】xxxxxxxxxxxxxxxx

【播客风格优化】
- 句子长度控制在15-25字，适合口语朗读
- 使用停顿标记：适当使用「...」「、」「；」
- 避免长句复合句，多用短句和断句
- 适当使用连接词：不过、而且、另外、说到...这一点
- 语气词自然融入：说起来、你看、其实、不得不说

现在开始分析以下新闻：
"""


def format_for_tts(text: str) -> str:
    """
    将分析文本格式化为适合 TTS 朗读的形式

    增强感染力：
    1. 添加自然停顿
    2. 语气优化
    3. 重点强调
    """
    # 移除 Markdown 格式标记
    text = text.replace("【核心发现】", "核心发现：")
    text = text.replace("【数据说话】", "")
    text = text.replace("【热点追踪】", "")
    text = text.replace("【产品动态】", "")
    text = text.replace("【行业风向】", "")
    text = text.replace("【技术前沿】", "")
    text = text.replace("【市场信号】", "")
    text = text.replace("【风险提示】", "")
    text = text.replace("【隐忧观察】", "")
    text = text.replace("【待解难题】", "")
    text = text.replace("【主笔手记】", "主笔手记：")

    # 规范化标题格式
    text = text.replace("## 一句话总结", "")
    text = text.replace("## 现状扫描", "")
    text = text.replace("## 趋势研判", "")
    text = text.replace("## 值得注意的问题", "")
    text = text.replace("## 收尾金句", "")

    # 添加自然停顿和语气优化
    # 在段落之间添加停顿
    text = text.replace("。", "。...")

    return text


@router.post("/analyze")
async def analyze_favorites(request: AnalyzeRequest):
    """
    AI 分析收藏的新闻

    请求体:
    - news_ids: 可选，指定新闻ID列表
    - limit: 可选，获取最新收藏数量（默认10条）

    响应:
    - success: 是否成功
    - data: 分析结果
    """
    # 检查 API Key
    if not MINIMAX_API_KEY:
        raise HTTPException(status_code=500, detail="MINIMAX_API_KEY 未配置，请先配置环境变量")

    # 获取收藏的新闻数据
    # TODO: 从数据库或缓存获取收藏的新闻
    # 目前暂时返回示例数据
    from src.services.news_database import get_news_from_db

    # 获取新闻（模拟获取收藏的新闻）
    news_list = get_news_from_db(limit=request.limit or 10)

    if not news_list:
        return {
            "success": True,
            "data": None,
            "message": "暂无收藏内容"
        }

    # 构造新闻文本
    news_content = []
    for i, news in enumerate(news_list[:20], 1):  # 最多处理20条
        title = news.get('title_zh') or news.get('title_en', '')
        content = news.get('content_zh') or news.get('content_en', '')
        source = news.get('source_zh') or news.get('source_en', '')
        published = news.get('published_at', '')

        news_content.append(f"【新闻{i}】标题：{title}")
        if source:
            news_content.append(f"来源：{source}")
        if published:
            news_content.append(f"发布时间：{published}")
        if content:
            # 截取前500字
            content_preview = content[:500] if len(content) > 500 else content
            news_content.append(f"内容摘要：{content_preview}")
        news_content.append("")

    full_content = "\n".join(news_content)

    try:
        client = get_minimax_client()

        # 调用 AI 分析
        prompt = ANALYSIS_PROMPT + "\n" + full_content
        logger.info(f"Analyzing {len(news_list)} news items")

        result = await client.chat([
            {"role": "user", "content": prompt}
        ])

        analysis_text = result.get("content", "")

        if not analysis_text:
            raise Exception("AI 返回为空")

        # 解析分析结果
        # 提取各个部分
        sections = {
            "core_finding": "",
            "current_status": "",
            "trend_prediction": "",
            "problems_summary": "",
            "final_thought": ""
        }

        # 简单解析（按固定格式）
        lines = analysis_text.split("\n")
        current_section = None

        for line in lines:
            line = line.strip()
            if not line:
                continue

            if "核心发现" in line:
                current_section = "core_finding"
                sections["core_finding"] = line.replace("【核心发现】", "").replace("核心发现", "")
            elif "现状扫描" in line and "现状" in line:
                current_section = "current_status"
            elif "趋势研判" in line and "趋势" in line:
                current_section = "trend_prediction"
            elif "值得注意" in line or "问题总结" in line:
                current_section = "problems_summary"
            elif "主笔手记" in line:
                current_section = "final_thought"
                sections["final_thought"] = line.replace("【主笔手记】", "").replace("主笔手记", "")
            elif current_section and line:
                # 追加到当前部分
                if sections[current_section]:
                    sections[current_section] += "\n" + line
                else:
                    sections[current_section] = line

        return {
            "success": True,
            "data": {
                "analysis": sections,
                "raw_text": analysis_text,
                "news_count": len(news_list)
            }
        }

    except Exception as e:
        logger.error(f"Analysis failed: {e}")
        raise HTTPException(status_code=504, detail=f"AI 分析失败: {str(e)}，请重试")


@router.post("/tts")
async def text_to_speech(request: TTSRequest):
    """
    将文本转换为语音

    请求体:
    - text: 要转换的文本

    响应:
    - success: 是否成功
    - data: 音频 URL 和时长
    """
    text = request.text

    if not text:
        raise HTTPException(status_code=400, detail="文本内容不能为空")

    # 检查 API Key
    if not MINIMAX_API_KEY:
        raise HTTPException(status_code=500, detail="MINIMAX_API_KEY 未配置")

    # 文本预处理 - 增强感染力
    formatted_text = format_for_tts(text)

    # 截断超长文本
    if len(formatted_text) > 2500:
        formatted_text = formatted_text[:2500]
        logger.warning("Text truncated to 2500 characters")

    try:
        client = get_minimax_client()

        # 调用 TTS
        result = await client.text_to_speech(
            text=formatted_text,
            voice_id="female-tianmei",
            speed=1.15  # 播客语速
        )

        audio_url = result.get("data", {}).get("audio_url", "")

        if not audio_url:
            raise Exception("TTS 返回的音频 URL 为空")

        # 估算时长（按语速 1.15x，约 400字/分钟）
        estimated_duration = len(formatted_text) / 400 * 60  # 秒

        return {
            "success": True,
            "data": {
                "audio_url": audio_url,
                "duration": round(estimated_duration, 1),
                "text_length": len(formatted_text)
            }
        }

    except Exception as e:
        logger.error(f"TTS failed: {e}")
        raise HTTPException(status_code=502, detail=f"TTS 服务暂时不可用: {str(e)}")


@router.get("/analyze-and-tts")
async def analyze_and_tts(limit: int = 10):
    """
    一站式分析并生成语音

    快捷接口：分析收藏新闻并直接返回语音
    """
    # 先分析
    analyze_result = await analyze_favorites(AnalyzeRequest(limit=limit))

    if not analyze_result.get("data"):
        return analyze_result

    # 再转语音
    raw_text = analyze_result["data"].get("raw_text", "")
    if raw_text:
        tts_result = await text_to_speech(TTSRequest(text=raw_text))
        analyze_result["data"]["audio_url"] = tts_result.get("data", {}).get("audio_url")

    return analyze_result
