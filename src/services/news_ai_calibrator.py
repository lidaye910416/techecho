"""
TechEcho Pro - AI质量校准器 (优化版)

支持两种模式:
1. AI模式: 使用 MiniMax API 进行语义校准 (需要 MINIMAX_API_KEY)
2. 降级模式: 纯规则截断 (无 API Key 时自动启用)

使用 MiniMax 2.7 模型
"""

import os
import json
import re
import requests
import logging
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# MiniMax API 配置 (从环境变量读取)
MINIMAX_API_KEY = os.getenv("MINIMAX_API_KEY", "")
MINIMAX_API_BASE_URL = "https://api.minimaxi.com"

# 支持的模型列表 (按优先级排序)
SUPPORTED_MODELS = [
    "MiniMax-M2.7",
    "MiniMax-M2.7-highspeed",
    "MiniMax-M2.5",
    "MiniMax-M2.5-highspeed",
]

# API调用配置
MAX_RETRIES = 3
REQUEST_TIMEOUT = 60


@dataclass
class CalibrationResult:
    """校准结果"""
    original_score: float
    calibrated_score: float
    category: str
    category_confirmed: bool
    is_related: bool
    reason: str
    action: str
    refined_title: str = ""
    refined_content: str = ""
    content_refined: bool = False


class NewsAICalibrator:
    """AI质量校准器

    支持降级模式:
    - 有 API Key: 调用 MiniMax API 进行语义校准
    - 无 API Key: 自动降级为规则截断模式
    """

    def __init__(self, api_key: str = None):
        self.api_key = api_key or MINIMAX_API_KEY
        self.enabled = bool(self.api_key)

    def calibrate(self, news_item: Dict) -> CalibrationResult:
        """对单条新闻进行校准

        - 有 API Key: 调用 MiniMax API
        - 无 API Key: 降级为规则截断
        """
        original_score = news_item.get('quality', {}).get('total_100', 0)

        # 降级模式: 只做规则截断
        if not self.enabled:
            content = news_item.get('content_zh', '')[:500] if news_item.get('lang') == 'zh' \
                else news_item.get('content_en', '')[:500]
            refined = self._truncate_at_sentence(content, 150)

            return CalibrationResult(
                original_score=original_score,
                calibrated_score=original_score,
                category=news_item.get('category', 'news'),
                category_confirmed=False,
                is_related=True,
                reason="",
                action="pass",
                refined_content=refined,
                content_refined=True
            )

        # AI模式: 调用 MiniMax API
        prompt = self._build_unified_prompt(news_item)

        last_error = None
        for attempt in range(MAX_RETRIES):
            try:
                response = self._call_minimax(prompt)
                if response:
                    result = self._parse_unified_response(response, news_item)
                    if result:
                        if result.action in ('pass', 'adjust') and not result.refined_content:
                            result.refined_content = self._truncate_at_sentence(
                                news_item.get('content_zh', '')[:500] if news_item.get('lang') == 'zh'
                                else news_item.get('content_en', '')[:500],
                                150
                            )
                            result.content_refined = True
                        return result
                    last_error = "JSON解析失败"

            except requests.exceptions.Timeout:
                last_error = f"请求超时 (尝试 {attempt + 1}/{MAX_RETRIES})"
                logger.warning(f"[AI校准] {last_error}")
            except requests.exceptions.RequestException as e:
                last_error = f"网络错误: {str(e)}"
                logger.warning(f"[AI校准] {last_error}")
            except Exception as e:
                last_error = f"未知错误: {str(e)}"
                logger.error(f"[AI校准] {last_error}")

            if attempt < MAX_RETRIES - 1:
                logger.info(f"[AI校准] 重试中... ({attempt + 2}/{MAX_RETRIES})")

        # 重试耗尽，降级到规则模式
        content = news_item.get('content_zh', '')[:500] if news_item.get('lang') == 'zh' \
            else news_item.get('content_en', '')[:500]
        refined = self._truncate_at_sentence(content, 150)

        return CalibrationResult(
            original_score=original_score,
            calibrated_score=original_score,
            category=news_item.get('category', 'news'),
            category_confirmed=False,
            is_related=True,
            reason=f"降级模式: API失败 - {last_error}",
            action="pass",
            refined_content=refined,
            content_refined=True
        )
    
    def _build_unified_prompt(self, news: Dict) -> str:
        """构建统一的提示词 (一次调用完成分类+润色)"""
        title = news.get('title_zh') or news.get('title_en', '')
        content = news.get('content_zh') or news.get('content_en', '')
        source = news.get('source_zh') or news.get('source_en', '')
        original_score = news.get('quality', {}).get('total_100', 0)
        original_category = news.get('category', 'news')
        
        return f"""评估并润色新闻，直接返回JSON。

标题: {title}
正文: {content[:800]}
来源: {source}

我们只关注以下科技领域（产业数字化 + 数字产业化 + AI）:
- AI/人工智能: 大模型、ChatGPT、AIGC、Agent、机器学习、AI应用落地
- 开发工具/云计算: GitHub、API、编程框架、DevOps、云服务、SaaS
- 半导体/芯片: 制程工艺、芯片设计、EDA、算力基础设施
- 科技产品: 软件发布、App更新、SaaS产品迭代

必须过滤掉以下领域:
- 智能汽车/新能源汽车/自动驾驶 (广告性质重，不收录)
- 游戏/娱乐/影视/音乐/体育
- 金融/银行/保险/股票/IPO/融资财报分析
- 医疗健康/药品/生物技术
- 房产/教育(非AI数字化)
- 农业/环境/能源政策
- 泛消费/生活方式/食品

任务:
1. 判断是否属于关注的科技领域
2. 如是，分类为: ai/tools/news/product
3. 如否，action设为discard
4. 如通过，润色标题(15-30字)和正文(100-150字，完整句子收尾)
   ⚠️ 正文必须控制在100-150字之间，不能少于100字，保证信息密度

返回JSON:
{{"is_related":true/false,"category":"ai/tools/news/product","action":"pass/discard","reason":"理由","title":"润色标题","content":"润色正文(100-150字)"}}"""

    def _call_minimax(self, prompt: str, max_tokens: int = 800) -> Optional[str]:
        """调用 MiniMax API"""
        try:
            url = f"{MINIMAX_API_BASE_URL}/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            for model in SUPPORTED_MODELS:
                try:
                    payload = {
                        "model": model,
                        "messages": [
                            {"role": "system", "content": "你是专业的科技新闻编辑，严格输出JSON。"},
                            {"role": "user", "content": prompt}
                        ],
                        "temperature": 0.3,
                        "max_tokens": max_tokens
                    }
                    
                    response = requests.post(url, headers=headers, json=payload, timeout=60)
                    result = response.json()
                    
                    base_resp = result.get('base_resp', {})
                    if base_resp.get('status_code') == 0:
                        return result.get('choices', [{}])[0].get('message', {}).get('content', '')
                    
                    error_msg = base_resp.get('status_msg', '').lower()
                    if 'model' in error_msg and ('not' in error_msg or 'support' in error_msg):
                        continue
                    
                    return None
                    
                except Exception:
                    continue
            
            return None
            
        except Exception:
            return None
    
    def _parse_unified_response(self, response: str, news: Dict) -> Optional[CalibrationResult]:
        """解析统一响应"""
        try:
            cleaned = response.strip()
            
            # 移除 thinking 标签
            if '</think>' in cleaned:
                cleaned = cleaned.split('</think>')[-1].strip()
            
            # 提取JSON
            json_match = re.search(r'\{[^}]+\}', cleaned, re.DOTALL)
            if json_match:
                json_str = json_match.group()
            else:
                # 尝试移除代码块
                if '```json' in cleaned:
                    cleaned = cleaned.split('```json')[1].split('```')[0]
                elif '```' in cleaned:
                    cleaned = cleaned.split('```')[1]
                json_str = cleaned.strip()
            
            # 替换引号
            json_str = json_str.replace('"', '"').replace('"', '"')
            
            data = json.loads(json_str)
            
            original_score = news.get('quality', {}).get('total_100', 0)
            action = data.get('action', 'pass')
            
            if action == 'discard' or not data.get('is_related', True):
                return CalibrationResult(
                    original_score=original_score,
                    calibrated_score=0,
                    category='news',
                    category_confirmed=True,
                    is_related=False,
                    reason=data.get('reason', '不相关'),
                    action='discard'
                )
            
            # 标准化分类
            category_map = {
                'ai': 'ai', 'tool': 'tools', 'tools': 'tools',
                'news': 'news', 'product': 'product'
            }
            category = category_map.get(data.get('category', 'news'), 'news')
            
            # 处理润色内容
            refined_content = data.get('content', '')
            if refined_content:
                refined_content = self._truncate_at_sentence(refined_content, 150)
                # 清理HTML实体
                refined_content = refined_content.replace('&nbsp;', ' ').replace('&lt;', '<').replace('&gt;', '>')
                refined_content = ' '.join(refined_content.split())
            
            refined_title = data.get('title', '')
            if refined_title:
                refined_title = refined_title.replace('&nbsp;', ' ').replace('&lt;', '<').replace('&gt;', '>')
                refined_title = ' '.join(refined_title.split())
            
            return CalibrationResult(
                original_score=original_score,
                calibrated_score=data.get('adjusted_score', original_score),
                category=category,
                category_confirmed=True,
                is_related=True,
                reason=data.get('reason', ''),
                action=action,
                refined_title=refined_title,
                refined_content=refined_content,
                content_refined=bool(refined_content)
            )
            
        except Exception:
            return None
    
    def _truncate_at_sentence(self, text: str, max_length: int = 150) -> str:
        """在句子边界截断"""
        if len(text) <= max_length:
            return text
        
        sentence_ends = ['。', '！', '？', '；', '\n']
        truncated = text[:max_length]
        
        # 向前找句子结束
        last_end = -1
        for i, char in enumerate(truncated):
            if char in sentence_ends:
                last_end = i
        
        if last_end > max_length * 0.6:
            return truncated[:last_end + 1]
        
        # 向后找句子结束
        remaining = text[max_length:]
        for i, char in enumerate(remaining):
            if char in sentence_ends:
                return text[:max_length + i + 1]
        
        return truncated.rstrip()

    def batch_calibrate(self, news_list: List[Dict], min_score: int = 50) -> Tuple[List[Dict], Dict]:
        """批量校准"""
        print(f"\n[AI校准] 开始校准 {len(news_list)} 条新闻...")

        results = []
        stats = {
            "total": len(news_list),
            "passed": 0,
            "adjusted": 0,
            "discarded": 0,
            "content_refined": 0,
            "categories": {"ai": 0, "tools": 0, "news": 0, "product": 0}
        }

        for i, news in enumerate(news_list):
            print(f"   [{i+1}/{len(news_list)}] {news.get('title_zh', '')[:30]}...")

            result = self.calibrate(news)

            if result.action == 'discard' or not result.is_related:
                stats["discarded"] += 1
                print(f"      ❌ 舍弃: {result.reason}")
                continue

            if result.action == 'adjust':
                stats["adjusted"] += 1

            # 应用结果
            if result.refined_title:
                news['title_zh'] = result.refined_title
            if result.refined_content:
                news['content_zh'] = result.refined_content
            else:
                content = news.get('content_zh', '')
                if len(content) > 150:
                    news['content_zh'] = self._truncate_at_sentence(content, 150)

            if result.category:
                news['category'] = result.category

            news['quality']['content_refined'] = result.content_refined

            # 更新等级
            score = result.calibrated_score or news['quality']['total_100']
            if score >= 85: news['quality']['grade'] = 'A+'
            elif score >= 75: news['quality']['grade'] = 'A'
            elif score >= 65: news['quality']['grade'] = 'B'
            elif score >= 55: news['quality']['grade'] = 'C'
            else: news['quality']['grade'] = 'D'

            news['quality']['total_100'] = score

            results.append(news)
            stats["passed"] += 1
            stats["categories"][result.category] = stats["categories"].get(result.category, 0) + 1

            if result.content_refined:
                stats["content_refined"] += 1
                print(f"      ✅ 通过 | 分类: {result.category} | 润色: {len(result.refined_content)}字")
            else:
                print(f"      ✅ 通过 | 分类: {result.category}")

        print(f"\n[AI校准完成] 通过: {stats['passed']}, 舍弃: {stats['discarded']}, 润色: {stats['content_refined']}")
        return results, stats


def get_calibrator() -> NewsAICalibrator:
    """获取校准器实例"""
    return NewsAICalibrator()
