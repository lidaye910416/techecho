"""
收藏新闻 AI 分析 API

提供收藏新闻的分析和 TTS 语音播报功能

[TODO] 并发处理优化
- 当前：多用户同时调用 analyze 时，共用单例 MiniMaxClient，可能触发 API 限流
- 优化方案：
  1. 请求队列 + asyncio.Semaphore 限制并发数
  2. 分析结果缓存（相同 news_ids 直接返回缓存）
  3. 基于用户的请求频率限制（避免单用户频繁触发）
"""

from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
from typing import Optional, List, Dict
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
    voice: Optional[str] = None  # 'voice1'|'voice2'|'voice3'|'voice4'，默认 voice3


# ============ 精细化提示词 ============

SYSTEM_PROMPT = """你是一位资深科技行业分析师，有10年行业研究经验。你擅长从新闻中提炼趋势、发现关联、给出有数据支撑的判断。

请根据提供的新闻撰写一份科技分析报告。要求：

【报告结构 — 自然段落，不用任何标签】
第一行：报告标题（10-20字），概括核心发现
空行后：一段摘要（2-3句话），概述报告要点
空行后：2-4段现状分析，每段引用新闻中的具体产品或事件作为论据
空行后：1-2段趋势预判，给出未来1-3个月走向
空行后：一段风险提示（可选），指出潜在问题但不制造焦虑
最后一段：结语，一句话收尾

【风格要求】
- 专业但不晦涩，信息密度高
- 引用新闻中具体数据、产品名称、公司名称作为论据
- 措辞克制：使用「似乎」「可能」「值得关注」「数据表明」
- 避免绝对化表达，保持分析师的客观

【格式要求 — 严格遵守】
- 纯文本段落，用空行分隔
- 禁止使用 ## 标题、**加粗**、- 列表、1.编号
- 禁止使用【】标签括号
- 标题独占第一行

【字数】全文 300-800 字

只输出报告正文，不要说"好的""以下是"等开场白。"""


def format_for_tts(text: str) -> str:
    """
    将分析文本格式化为适合 TTS 朗读的形式
    增强感染力：添加自然停顿、语气优化
    """
    import re
    # 清理可能的 Markdown 残留
    text = re.sub(r'^#+\s.*$', '', text, flags=re.MULTILINE)
    text = re.sub(r'【[^】]*】', '', text)

    # 句号后添加自然停顿
    text = text.replace('。', '。...')
    text = text.replace('？', '？...')
    text = text.replace('！', '！...')

    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


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

    # 获取收藏的新闻数据（使用异步版本，避免 asyncio.run() 嵌套问题）
    from src.services.news import _get_news_from_db

    # 先拉取足够多的新闻，再用 news_ids 过滤
    # 使用较大的 limit 确保覆盖收藏列表中的低分新闻
    fetch_limit = max(200, (request.limit or 50) * 10)
    news_list = await _get_news_from_db(limit=fetch_limit)
    if request.news_ids:
        news_ids_set = set(request.news_ids)
        news_list = [n for n in news_list if n.get('id') in news_ids_set]
        # 限制分析数量
        news_list = news_list[:20]

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

        # 先检查文本 API 是否可用
        text_api_status = await client.check_text_api_status()

        if not text_api_status.get("available"):
            # 降级方案：使用规则生成分析
            logger.warning("文本对话 API 不可用，使用规则生成分析")
            raw_text = generate_rule_based_analysis(news_list)

            return {
                "success": True,
                "data": {
                    "raw_text": raw_text,
                    "news_count": len(news_list),
                    "mode": "rule_based"
                }
            }

        # 调用 AI 分析 - system 消息放指令，user 消息只放数据
        logger.info(f"Analyzing {len(news_list)} news items with AI")

        result = await client.chat([
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": "请根据以下新闻撰写一篇播报文稿：\n\n" + full_content}
        ])

        analysis_text = result.get("content", "")

        if not analysis_text:
            raise Exception("AI 返回为空")

        # 强力清理：移除模型可能回显的指令文本
        import re
        # 移除 <think>...</think> 推理过程（M2.7 等推理模型会输出）
        analysis_text = re.sub(r'<think>.*?</think>', '', analysis_text, flags=re.DOTALL)
        # 移除【】标签
        analysis_text = re.sub(r'【[^】]*】', '', analysis_text)
        # 移除 ## 标题行
        analysis_text = re.sub(r'^#{1,4}\s.*$', '', analysis_text, flags=re.MULTILINE)
        # 移除列表符号行（以 - + * • · 开头）
        analysis_text = re.sub(r'^[\s]*[-+*•·]\s.*$', '', analysis_text, flags=re.MULTILINE)
        # 移除编号行（1. 2. 等）
        analysis_text = re.sub(r'^[\s]*\d+[\.、）)]\s.*$', '', analysis_text, flags=re.MULTILINE)
        # 移除常见开场白
        analysis_text = re.sub(r'^(好的|以下是|下面|现在开始|让我).*$', '', analysis_text, flags=re.MULTILINE)
        # 移除只含标点/空格的短行
        analysis_text = re.sub(r'^[\s\.,;:!?，。；：！？…—\-\(\)（）""''、]{1,10}$', '', analysis_text, flags=re.MULTILINE)
        # 合并多余空行
        analysis_text = re.sub(r'\n{3,}', '\n\n', analysis_text)
        analysis_text = analysis_text.strip()

        # 如果清理后为空，说明模型回复质量太差，降级
        if len(analysis_text) < 50:
            logger.warning("AI 返回内容过短或清理后为空，使用规则降级")
            raw_text = generate_rule_based_analysis(news_list)
            return {
                "success": True,
                "data": {
                    "raw_text": raw_text,
                    "news_count": len(news_list),
                    "mode": "rule_based"
                }
            }

        return {
            "success": True,
            "data": {
                "raw_text": analysis_text,
                "news_count": len(news_list),
                "mode": "ai"
            }
        }

    except Exception as e:
        logger.error(f"Analysis failed: {e}")
        raise HTTPException(status_code=504, detail=f"AI 分析失败: {str(e)}，请重试")


def generate_rule_based_analysis(news_list: List[Dict]) -> str:
    """基于规则生成分析报告（当 AI API 不可用时的降级方案）"""

    total = len(news_list)
    ai_count = sum(1 for n in news_list if 'ai' in (n.get('category') or '').lower() or
                   'ai' in (n.get('title_zh') or '').lower())
    tech_count = sum(1 for n in news_list if 'tech' in (n.get('category') or '').lower())

    sample_titles = []
    for news in news_list[:3]:
        title = news.get('title_zh') or news.get('title_en', '')
        if title:
            sample_titles.append(title[:35])
    title_samples = "、".join(sample_titles) if sample_titles else "多项科技动态"

    lines = []

    # 标题行
    if ai_count > 0:
        lines.append(f"AI 技术加速渗透：从{total}条资讯看行业演变")
    else:
        lines.append(f"科技行业周度观察：{total}条资讯中的趋势信号")

    # 摘要段
    lines.append(f"本期收录{total}条科技资讯，覆盖人工智能、消费电子等领域。其中{title_samples}等话题值得重点关注，反映出行业正在经历新一轮技术迭代。")

    # 现状分析
    lines.append(f"从具体动态来看，{total}条新闻反映出科技行业多个细分方向同步推进。AI领域持续高热，各大科技巨头纷纷加码技术研发和产品落地，行业竞争正进入白热化阶段。")
    lines.append(f"与此同时，消费电子、新能源汽车等领域的创新步伐也未见放缓，部分企业开始探索跨领域技术融合的可能性，这或许预示着新一轮产业变革正在酝酿。")

    # 趋势预判
    lines.append(f"展望未来一到三个月，AI技术的落地速度预计将进一步加快。多模态能力可能成为下一个竞争焦点，端侧AI的普及或许会带来全新的应用场景。对于从业者而言，这是值得密切关注的信号。")

    # 风险提示
    lines.append(f"然而也需要冷静看待当前热度。AI监管政策尚不明朗，技术发展与伦理规范的平衡需要持续关注。部分细分领域可能存在一定泡沫风险，需要理性审视。")

    # 结语
    lines.append("科技浪潮滚滚向前，唯有持续学习方能不被时代抛下。")

    return "\n\n".join(lines)


def format_analysis_for_tts(text: str) -> str:
    """将分析文本格式化为适合 TTS 朗读的形式（简化版）"""
    # 清理可能的 Markdown 残留
    import re
    text = re.sub(r'^#+\s.*$', '', text, flags=re.MULTILINE)
    text = re.sub(r'【[^】]*】', '', text)
    text = re.sub(r'\n{3,}', '\n\n', text)

    # 句号后添加短暂停顿
    text = text.replace('。', '。...')
    text = text.replace('？', '？...')
    text = text.replace('！', '！...')

    return text.strip()


@router.post("/tts")
async def text_to_speech(request: TTSRequest):
    """
    将文本转换为语音

    请求体:
    - text: 要转换的文本
    - voice: 可选，语音风格 ('voice1'|'voice2'|'voice3'|'voice4')，默认 voice3

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

    # 根据用户选择的语音风格获取 MiniMax voice_id 和 speed
    from src.services.tts import VOICE_STYLES
    default_voice = "voice3"  # 轻御·对谈
    voice = request.voice if request.voice and request.voice in VOICE_STYLES else default_voice
    style = VOICE_STYLES.get(voice, VOICE_STYLES[default_voice])
    voice_id = style["minimax"]
    speed = style.get("speed", 1.0)
    logger.info(f"TTS voice: {voice} → minimax={voice_id}, speed={speed}")

    try:
        client = get_minimax_client()

        # 调用 TTS
        result = await client.text_to_speech(
            text=formatted_text,
            voice_id=voice_id,
            speed=speed
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
