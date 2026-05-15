#!/usr/bin/env python3
"""
新闻收集验证脚本 - 用于微信云托管测试
运行后输出收集结果到日志，不写入数据库
"""

import asyncio
import json
import sys
import os
from datetime import datetime
from pathlib import Path

# 添加项目根目录到路径
_project_root = Path(__file__).parent.parent
sys.path.insert(0, str(_project_root))

def log(msg):
    """输出到标准输出（会被 Docker 日志捕获）"""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"[{timestamp}] {msg}")

async def verify_news_collection():
    """验证新闻收集流程"""
    log("=" * 60)
    log("🔍 新闻收集验证开始")
    log("=" * 60)
    
    # 1. 收集
    log("\n📡 [步骤1] 收集新闻...")
    from src.services.news.news_collector_v2 import BilingualNewsCollector
    
    collector = BilingualNewsCollector()
    try:
        raw_news = await collector.collect_all(lang='zh')
        log(f"   ✅ 收集完成: {len(raw_news)} 条原始新闻")
        
        # 显示源分布
        sources = {}
        for n in raw_news:
            src = n.source_zh or n.source_en
            sources[src] = sources.get(src, 0) + 1
        for src, count in sorted(sources.items(), key=lambda x: -x[1]):
            log(f"      {src}: {count}条")
    finally:
        await collector.close()
    
    # 2. 质量评分
    log("\n📊 [步骤2] 质量评分...")
    grades = {"A+": 0, "A": 0, "B": 0, "C": 0, "D": 0}
    total_score = 0
    for n in raw_news:
        grade = n.quality.grade if hasattr(n.quality, 'grade') else 'D'
        grades[grade] = grades.get(grade, 0) + 1
        total_score += n.quality.total_100
    
    avg_score = total_score / len(raw_news) if raw_news else 0
    log(f"   评分分布: A+={grades['A+']}, A={grades['A']}, B={grades['B']}, C={grades['C']}, D={grades['D']}")
    log(f"   平均分: {avg_score:.1f}")
    
    # 3. AI 校准（如果配置了 API Key）
    log("\n🤖 [步骤3] AI 校准...")
    
    api_key = os.getenv('MINIMAX_API_KEY', '')
    if not api_key:
        log("   ⚠️ MINIMAX_API_KEY 未配置，跳过 AI 校准")
    else:
        from src.services.news.news_ai_calibrator import NewsAICalibrator
        
        calibrator = NewsAICalibrator()
        news_dicts = [n.to_dict() if hasattr(n, 'to_dict') else n for n in raw_news[:10]]  # 只校准前10条
        
        log(f"   开始校准 {len(news_dicts)} 条新闻...")
        calibrated, stats = calibrator.batch_calibrate(news_dicts, min_score=55)
        
        log(f"   通过: {stats['passed']}, 舍弃: {stats['discarded']}, 润色: {stats['content_refined']}")
        log(f"   分类: {stats['categories']}")
        
        # 显示校准后样本
        log("\n   📋 校准后样本（前3条）:")
        for i, n in enumerate(calibrated[:3]):
            log(f"      [{i+1}] {n.get('title_zh', '')[:40]}...")
            log(f"          分类: {n.get('category')}, 分数: {n.get('quality', {}).get('total_100', 0)}")
    
    # 4. 输出 JSON 格式结果（方便后续处理）
    log("\n📦 [步骤4] 输出验证结果...")
    
    result = {
        "verify_time": datetime.now().isoformat(),
        "raw_count": len(raw_news),
        "sources": sources,
        "grades": grades,
        "avg_score": round(avg_score, 1),
    }
    
    log("\n" + "=" * 60)
    log("✅ 验证完成 - JSON 结果:")
    log(json.dumps(result, ensure_ascii=False, indent=2))
    log("=" * 60)
    
    return result

if __name__ == "__main__":
    asyncio.run(verify_news_collection())
