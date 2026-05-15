#!/usr/bin/env python3
"""
模拟完整新闻 Pipeline (避免 AI 干预)
- 阶段1: RSS 收集
- 阶段2: 规则质量评分
- 阶段3: 模拟 AI 校准 (跳过真实 API 调用)
- 阶段4: 存储输出
"""

import asyncio
import json
import logging
import sys
import os
from datetime import datetime
from pathlib import Path
from dataclasses import asdict

# 添加项目根目录到路径
sys.path.insert(0, str(Path(__file__).parent.parent))

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger(__name__)

# ===== 模拟 AI 校准结果 =====
MOCK_AI_CALIBRATION = {
    "钛媒体": {"action": "pass", "category": "news", "reason": "科技资讯符合领域"},
    "爱范儿": {"action": "pass", "category": "product", "reason": "产品资讯符合领域"},
    "少数派": {"action": "pass", "category": "tools", "reason": "工具类内容符合领域"},
    "Solidot": {"action": "pass", "category": "news", "reason": "科技新闻符合领域"},
    "虎嗅": {"action": "pass", "category": "news", "reason": "商业科技符合领域"},
    "36氪": {"action": "pass", "category": "ai", "reason": "创业科技符合领域"},
}

def mock_ai_calibrate(news_item: dict) -> dict:
    """模拟 AI 校准 - 基于规则的替代方案"""
    source = news_item.get('source_zh', '') or news_item.get('source_en', '')
    title = news_item.get('title_zh', '') or news_item.get('title_en', '')
    
    mock_result = MOCK_AI_CALIBRATION.get(source, {
        "action": "adjust",
        "category": "news",
        "reason": "规则判断通过"
    })
    
    # 过滤关键词
    filter_keywords = ["游戏", "娱乐", "金融", "医疗", "汽车"]
    for kw in filter_keywords:
        if kw in title:
            mock_result = {"action": "discard", "category": "news", "reason": f"标题包含过滤词: {kw}"}
            break
    
    # 内容太长则截断
    content = news_item.get('content_zh', '') or news_item.get('content_en', '')
    if len(content) > 150:
        for i in range(len(content)-1, max(0, 140), -1):
            if content[i] in '。！？；':
                content = content[:i+1]
                break
        news_item['content_zh'] = content
        news_item['content_refined'] = True
    
    # 润色标题
    if len(title) > 30:
        news_item['title_zh'] = title.rstrip('…').rstrip('...')
        news_item['title_refined'] = True
    
    return mock_result

async def run_pipeline():
    """运行完整 Pipeline"""
    
    print("\n" + "="*60)
    print("🚀 模拟新闻 Pipeline 开始")
    print("="*60 + "\n")
    
    # ===== 阶段1: 收集 =====
    print("📡 [阶段1] 从 RSS 源收集新闻...")
    print("-" * 40)
    
    from src.services.news.news_collector_v2 import BilingualNewsCollector
    
    collector = BilingualNewsCollector()
    try:
        raw_news = await collector.collect_all(lang='zh')
        print(f"\n✅ 收集完成: {len(raw_news)} 条原始新闻\n")
    finally:
        await collector.close()
    
    # 显示收集结果
    if raw_news:
        print("收集的新闻源分布:")
        sources_count = {}
        for news in raw_news:
            src = news.source_zh or news.source_en
            sources_count[src] = sources_count.get(src, 0) + 1
        for src, count in sorted(sources_count.items(), key=lambda x: -x[1]):
            print(f"   {src}: {count}条")
        print()
    
    # ===== 阶段2: 规则质量评分 =====
    print("📊 [阶段2] 规则质量评分 (DeerFlow v2)...")
    print("-" * 40)
    
    from src.models.news_bilingual import NewsItem
    
    grades = {"A+": 0, "A": 0, "B": 0, "C": 0, "D": 0}
    for news in raw_news:
        grade = news.quality.grade if hasattr(news.quality, 'grade') else 'D'
        grades[grade] = grades.get(grade, 0) + 1
    
    print(f"评分分布: A+={grades['A+']}, A={grades['A']}, B={grades['B']}, C={grades['C']}, D={grades['D']}")
    
    avg_score = sum(n.quality.total_100 for n in raw_news) / len(raw_news) if raw_news else 0
    print(f"平均质量分: {avg_score:.1f}\n")
    
    # ===== 阶段3: AI 校准 (模拟) =====
    print("🤖 [阶段3] AI 校准 (模拟模式)...")
    print("-" * 40)
    
    calibrated_news = []
    stats = {
        "total": len(raw_news),
        "passed": 0,
        "adjusted": 0,
        "discarded": 0,
        "categories": {"ai": 0, "tools": 0, "news": 0, "product": 0}
    }
    
    for i, news in enumerate(raw_news):
        news_dict = news.to_dict() if hasattr(news, 'to_dict') else news
        title = news_dict.get('title_zh', '') or news_dict.get('title_en', '')
        
        print(f"   [{i+1}/{stats['total']}] {title[:35]}...")
        
        result = mock_ai_calibrate(news_dict)
        
        if result['action'] == 'discard':
            stats['discarded'] += 1
            print(f"      ❌ 舍弃: {result['reason']}")
            continue
        
        if result.get('category'):
            news_dict['category'] = result['category']
        
        stats['passed'] += 1
        stats['categories'][result['category']] = stats['categories'].get(result['category'], 0) + 1
        
        if result['action'] == 'adjust':
            stats['adjusted'] += 1
            refined = " [润色]" if news_dict.get('content_refined') or news_dict.get('title_refined') else ""
            print(f"      ✅ 通过 | 分类: {result['category']}{refined}")
        else:
            print(f"      ✅ 通过 | 分类: {result['category']}")
        
        if not isinstance(news, NewsItem):
            news = NewsItem.from_dict(news_dict)
        
        calibrated_news.append(news)
    
    print(f"\n📈 校准统计: 通过={stats['passed']}, 舍弃={stats['discarded']}, 调整={stats['adjusted']}")
    print(f"   分类分布: AI={stats['categories']['ai']}, 工具={stats['categories']['tools']}, "
          f"动态={stats['categories']['news']}, 产品={stats['categories']['product']}")
    
    # ===== 阶段4: 存储 =====
    print("\n💾 [阶段4] 存储结果...")
    print("-" * 40)
    
    output_data = {
        "generated_at": datetime.now().isoformat(),
        "pipeline_version": "1.0-mock",
        "stats": stats,
        "news": [item.to_dict() if hasattr(item, 'to_dict') else item for item in calibrated_news]
    }
    
    output_dir = Path(__file__).parent.parent / "app" / "data"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    output_file = output_dir / "news.json"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)
    
    print(f"✅ 已保存到: {output_file}")
    print(f"   总共 {len(calibrated_news)} 条新闻")
    
    print("\n" + "="*60)
    print("🎉 Pipeline 模拟完成!")
    print("="*60)
    
    return output_data

if __name__ == "__main__":
    asyncio.run(run_pipeline())
