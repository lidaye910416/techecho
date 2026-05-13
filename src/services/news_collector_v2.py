"""科技资讯收集服务 v3 - 双语版本

支持:
- 中英文 RSS 源分离配置
- 双语内容存储
- 用户语言选择
- DeerFlow v2 质量评分
"""

import feedparser
import httpx
import logging
import re
import os
from datetime import datetime
from typing import List, Dict, Any, Set, Optional
from src.models.news_bilingual import NewsItem, QualityScore
from src.config.sources import (
    get_categories, get_source_tiers, get_filter_keywords, get_quality_keywords,
    get_tier_for_source, COMPLETENESS_PATTERNS, DENSITY_PATTERNS
)

logger = logging.getLogger(__name__)

# ===== RSS 源配置 - 中英文分离 =====

ZH_SOURCES = [
    # 中文源 (高质量)
    {"name": "钛媒体", "url": "https://www.tmtpost.com/rss", "category": "news", "weight": 3},
    {"name": "爱范儿", "url": "https://www.ifanr.com/feed", "category": "product", "weight": 3},
    {"name": "少数派", "url": "https://sspai.com/feed", "category": "product", "weight": 3},
    {"name": "Solidot", "url": "https://www.solidot.org/index.rss", "category": "news", "weight": 2.5},
    {"name": "虎嗅", "url": "https://www.huxiu.com/rss/0.xml", "category": "news", "weight": 2.5},
    {"name": "36氪", "url": "https://36kr.com/feed", "category": "news", "weight": 2.5},
]

EN_SOURCES = [
    # [TODO] 英文新闻源配置（暂时禁用 - 纯中文项目）
    #
    # 禁用原因：产品定位为纯中文科技资讯平台
    #
    # 如需恢复英文新闻功能：
    # 1. 取消下方源列表注释，恢复各新闻源配置
    # 2. 恢复 collect_en() 方法的正常逻辑（见该方法 TODO）
    # 3. 确保 API 接口支持 lang='en' 筛选
    #
    # {"name": "TechCrunch", "url": "https://techcrunch.com/feed/", "category": "news", "weight": 2.5},
    # {"name": "MIT Tech Review", "url": "https://www.technologyreview.com/feed/", "category": "ai", "weight": 2.5},
    # {"name": "Ars Technica", "url": "https://feeds.arstechnica.com/arstechnica/index", "category": "tools", "weight": 2},
    # {"name": "The Verge", "url": "https://www.theverge.com/rss/index.xml", "category": "product", "weight": 2},
    # {"name": "Hacker News", "url": "https://hnrss.org/frontpage", "category": "news", "weight": 2},
    # {"name": "Wired", "url": "https://www.wired.com/feed/rss", "category": "ai", "weight": 2},
]

class BilingualNewsCollector:
    """双语新闻收集器"""
    
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=30.0)
        self._analyzer = None
    
    async def close(self):
        await self.client.aclose()
    
    async def collect_zh(self) -> List[NewsItem]:
        """收集中文新闻"""
        return await self._collect_sources(ZH_SOURCES, lang='zh')
    
    async def collect_en(self) -> List[NewsItem]:
        """收集英文新闻（暂时禁用 - 纯中文项目）

        [TODO] 如需恢复英文新闻功能：
        1. 取消 EN_SOURCES 的注释，恢复各新闻源配置
        2. 取消下方 return 语句的注释
        3. 确保 API 接口支持 lang='en' 筛选

        恢复代码：
            return await self._collect_sources(EN_SOURCES, lang='en')
        """
        # [TODO] 恢复英文新闻收集：取消下方注释并删除 pass
        # return await self._collect_sources(EN_SOURCES, lang='en')
        pass
    
    async def collect_all(self, lang=None, category=None) -> List[NewsItem]:
        """收集所有新闻"""
        # 英文新闻已禁用，始终为空列表
        en_news: List[NewsItem] = []

        if lang == 'zh':
            zh_news = await self.collect_zh()
        else:
            zh_news = await self.collect_zh()

        # 去重 (基于标题相似度)
        all_news = zh_news + en_news
        result = self._deduplicate(all_news)

        # 分类过滤
        if category:
            result = [n for n in result if n.category == category]

        return result
    
    async def _collect_sources(self, sources: List[Dict], lang: str) -> List[NewsItem]:
        """从多个源收集"""
        items = []
        
        for source in sources:
            try:
                response = await self.client.get(source['url'])
                response.raise_for_status()
                feed = feedparser.parse(response.text)
                
                for entry in feed.entries[:10]:
                    news_item = self._parse_entry(entry, source, lang)
                    if news_item:
                        items.append(news_item)
                        
            except Exception as e:
                logger.warning(f"Failed to fetch {source['name']}: {e}")
        
        return items
    
    def _parse_entry(self, entry, source: Dict, lang: str) -> Optional[NewsItem]:
        """解析 RSS 条目"""
        # 获取内容
        content = ""
        if hasattr(entry, 'summary'):
            content = entry.summary
        elif hasattr(entry, 'description'):
            content = entry.description
        elif hasattr(entry, 'content'):
            content = entry.content[0].value if entry.content else ""
        
        # 清理 HTML
        content = self._clean_html(content)
        
        # 获取标题
        title = entry.get('title', '')[:200]
        
        # 生成摘要
        summary = content[:300] if content else ""
        
        # 创建新闻条目
        news = NewsItem(
            title_zh=title if lang == 'zh' else "",
            title_en=title if lang == 'en' else "",
            content_zh=content if lang == 'zh' else "",
            content_en=content if lang == 'en' else "",
            summary_zh=summary if lang == 'zh' else "",
            summary_en=summary if lang == 'en' else "",
            source_zh=source['name'] if lang == 'zh' else "",
            source_en=source['name'] if lang == 'en' else "",
            source_url=entry.get('link', ''),
            lang=lang,
            category=source.get('category', 'news'),
            published_at=entry.get('published', ''),
            created_at=datetime.now().isoformat(),
            weight=source.get('weight', 1.0)
        )
        
        # 计算质量评分
        self._analyze_quality(news)
        
        return news
    
    def _clean_html(self, text: str) -> str:
        """清理 HTML 标签"""
        # 移除 HTML 标签
        text = re.sub(r'<[^>]+>', '', text)
        # 清理多余空白
        text = re.sub(r'\s+', ' ', text)
        return text.strip()
    
    def _analyze_quality(self, news: NewsItem):
        """分析新闻质量"""
        if self._analyzer is None:
            self._analyzer = NewsQualityAnalyzerV2()
        
        # 根据语言选择内容
        title = news.title_zh or news.title_en
        summary = news.summary_zh or news.summary_en
        source = news.source_zh or news.source_en
        
        quality_dict = self._analyzer.analyze_quality(title, summary, source, news.source_url)
        
        news.quality = QualityScore(
            total_100=quality_dict.get('total_100', 0),
            weighted_total=quality_dict.get('weighted_total', 0),
            grade=quality_dict.get('grade', 'D'),
            scores=quality_dict.get('scores', {}),
            issues=quality_dict.get('issues', [])
        )
    
    def _deduplicate(self, items: List[NewsItem]) -> List[NewsItem]:
        """去重"""
        seen_titles = set()
        unique_items = []
        
        for item in items:
            # 标准化标题
            norm_title = re.sub(r'[^一-龥a-zA-Z0-9]', '', item.title_zh or item.title_en)
            norm_title = norm_title.lower()[:30]
            
            if norm_title not in seen_titles:
                seen_titles.add(norm_title)
                unique_items.append(item)
        
        return unique_items


# ===== DeerFlow v2 质量分析器 =====
class NewsQualityAnalyzerV2:
    """
    DeerFlow deep-research 方法论 v2 - 新闻质量分析器

    8 维度评分体系

    使用配置文件中的关键词和规则
    """

    WEIGHTS = {
        "completeness": 0.15,       # 内容完整性
        "language": 0.15,           # 语言质量
        "title": 0.10,              # 标题质量
        "source_credibility": 0.10, # 来源权威性
        "info_density": 0.10,       # 信息密度
        "actionability": 0.15,      # 可操作性
        "impact": 0.15,             # 影响力
        "originality": 0.10         # 独创性
    }

    # 分数阈值配置
    THRESHOLDS = {
        "grade_A_plus": 85,
        "grade_A": 75,
        "grade_B": 65,
        "grade_C": 55,
    }

    def analyze_quality(self, title: str, summary: str, source: str, url: str = "") -> Dict:
        """分析新闻质量"""
        scores = {
            "completeness": self._score_completeness(summary),
            "language": self._score_language(summary),
            "title": self._score_title(title, summary),
            "source_credibility": self._score_source(source),
            "info_density": self._score_density(summary),
            "actionability": self._score_actionability(summary),
            "impact": self._score_impact(summary),
            "originality": self._score_originality(summary),
        }

        # 加权总分
        weighted = sum(scores[k] * self.WEIGHTS[k] for k in self.WEIGHTS)
        total_100 = weighted * 10

        # 等级
        grade = self._calculate_grade(total_100)

        # 问题识别
        issues = []
        if scores['completeness'] < 6: issues.append("内容要素不完整")
        if scores['language'] < 6: issues.append("语言质量欠佳")
        if scores['actionability'] < 5: issues.append("缺乏可执行洞察")

        return {
            "total_100": round(total_100, 1),
            "weighted_total": round(weighted, 2),
            "grade": grade,
            "scores": {k: round(v, 1) for k, v in scores.items()},
            "issues": issues
        }

    def _calculate_grade(self, score: float) -> str:
        """根据分数计算等级"""
        thresholds = self.THRESHOLDS
        if score >= thresholds["grade_A_plus"]: return "A+"
        elif score >= thresholds["grade_A"]: return "A"
        elif score >= thresholds["grade_B"]: return "B"
        elif score >= thresholds["grade_C"]: return "C"
        else: return "D"

    def _score_completeness(self, text: str) -> float:
        """内容完整性 (5W1H)"""
        score = 0.0
        patterns = COMPLETENESS_PATTERNS
        present = sum(1 for p in patterns.values() if re.search(p, text))
        score = present * 1.5
        if re.search(r'\d+[%亿]', text): score += 0.5
        return min(10, score)

    def _score_language(self, text: str) -> float:
        """语言质量"""
        score = 8.0
        if re.search(r'\bthe\b', text, re.I): score -= 0.5
        if re.search(r'的\s*的', text): score -= 1.0
        quality_kw = get_quality_keywords()
        marketing = quality_kw.get("marketing", [])
        if any(p in text for p in marketing): score -= 2.0
        return max(0, min(10, score))

    def _score_title(self, title: str, content: str) -> float:
        """标题质量"""
        score = 7.0
        if 15 <= len(title) <= 30: score += 1.5
        if title.endswith('...') or title.endswith('…'): score -= 1.0
        quality_kw = get_quality_keywords()
        clickbait = quality_kw.get("clickbait", [])
        if any(p in title for p in clickbait): score -= 2.0
        return max(0, min(10, score))

    def _score_source(self, source: str) -> float:
        """来源权威性"""
        score = 5.0
        tier = get_tier_for_source(source)
        if tier == 1: score += 4.0
        elif tier == 2: score += 2.5
        return max(0, min(10, score))

    def _score_density(self, text: str) -> float:
        """信息密度"""
        count = 0
        patterns = DENSITY_PATTERNS
        for key, pattern in patterns.items():
            if re.search(pattern, text): count += 1
        return min(10, count * 2.5)

    def _score_actionability(self, text: str) -> float:
        """可操作性"""
        score = 5.0
        quality_kw = get_quality_keywords()
        action = quality_kw.get("actionability", [])
        if any(p in text for p in action): score += 2.0
        if re.search(r'\d+[%亿]', text): score += 1.0
        return max(0, min(10, score))

    def _score_impact(self, text: str) -> float:
        """影响力"""
        score = 5.0
        quality_kw = get_quality_keywords()
        high = quality_kw.get("high_impact", [])
        score += sum(0.5 for p in high if p in text)
        return max(0, min(10, score))

    def _score_originality(self, text: str) -> float:
        """独创性"""
        score = 5.0
        quality_kw = get_quality_keywords()
        orig = quality_kw.get("originality", [])
        if any(p in text for p in orig): score += 2.0
        if '编译' in text or '转载' in text: score -= 1.5
        return max(0, min(10, score))


# 全局实例
collector = BilingualNewsCollector()
