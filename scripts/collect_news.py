#!/usr/bin/env python3
"""
TechEcho Pro - 新闻收集脚本

用法:
    python scripts/collect_news.py              # 收集所有新闻
    python scripts/collect_news.py --category ai  # 只收集AI类别
    python scripts/collect_news.py --lang zh    # 只收集中文新闻
    python scripts/collect_news.py --limit 50  # 限制数量
"""

import argparse
import asyncio
import json
import sys
import os
from datetime import datetime, timedelta

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

async def collect_news(category=None, lang=None, limit=None, min_quality=55):
    """收集新闻的主函数"""
    print("=" * 50)
    print("TechEcho Pro - 新闻收集工作流")
    print("=" * 50)
    print(f"时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"分类: {category or '全部'}")
    print(f"语言: {lang or '全部'}")
    print(f"最低质量: {min_quality}")
    print("-" * 50)

    try:
        # 导入新闻收集服务
        from services.news_collector_v2 import BilingualNewsCollector
        from services.news_ai_calibrator import NewsAICalibrator

        collector = BilingualNewsCollector()
        calibrator = NewsAICalibrator()

        print("\n[1/4] 初始化收集器...")

        print("\n[2/4] 收集新闻...")
        # 收集新闻
        news_items = await collector.collect_all(lang=lang, category=category)

        print(f"   收集到 {len(news_items)} 条原始新闻")

        print("\n[3/4] 过滤和排序...")
        # 过滤低质量新闻
        filtered = [n for n in news_items if (n.quality.total_100 if n.quality else 0) >= min_quality]
        print(f"   过滤后剩余 {len(filtered)} 条 (质量 >= {min_quality})")

        # 按质量分数排序
        filtered.sort(key=lambda x: x.quality.total_100 if x.quality else 0, reverse=True)

        # 限制数量
        if limit:
            filtered = filtered[:limit]
            print(f"   限制数量后: {len(filtered)} 条")

        # 转换为字典（不包含摘要字段）
        news_dicts = []
        for item in filtered:
            news_dicts.append({
                'id': item.id,
                'title_zh': item.title_zh,
                'title_en': item.title_en,
                'content_zh': item.content_zh,
                'content_en': item.content_en,
                'source_zh': item.source_zh,
                'source_en': item.source_en,
                'source_url': item.source_url,
                'lang': item.lang,
                'category': item.category,
                'published_at': item.published_at,
                'created_at': item.created_at,
                'quality': {
                    'total_100': item.quality.total_100 if item.quality else 0,
                    'grade': item.quality.grade if item.quality else 'D',
                    'scores': item.quality.scores if item.quality else {}
                }
            })

        print("\n[4/4] AI校准与内容润色...")
        # 使用 AI 校准器进行分类验证、过滤和内容润色
        calibrated_news, stats = calibrator.batch_calibrate(news_dicts, min_score=min_quality)
        print(f"   AI校准完成: 通过 {stats['passed']} 条, 修正 {stats['adjusted']} 条, 润色 {stats['content_refined']} 条, 舍弃 {stats['discarded']} 条")

        # 保存到文件
        output_data = {
            'lastUpdate': datetime.now().strftime('%Y-%m-%d %H:%M'),
            'totalCount': len(calibrated_news),
            'stats': {
                'A+': len([n for n in calibrated_news if n['quality']['grade'] == 'A+']),
                'A': len([n for n in calibrated_news if n['quality']['grade'] == 'A']),
                'B': len([n for n in calibrated_news if n['quality']['grade'] == 'B']),
                'C': len([n for n in calibrated_news if n['quality']['grade'] == 'C']),
                'D': len([n for n in calibrated_news if n['quality']['grade'] == 'D'])
            },
            'categories': list(set(n['category'] for n in calibrated_news)),
            'news': calibrated_news
        }

        # 保存到数据库
        from services.news_database import save_news_to_db
        db_count = save_news_to_db(calibrated_news)
        print(f"   已存入数据库: {db_count} 条")

        # TTS 预生成（采集后自动为每条新闻生成语音缓存）
        try:
            from services.tts_pregen import pre_generate_tts_for_news
            print("\n[5/5] TTS 语音预生成...")
            tts_stats = await pre_generate_tts_for_news(calibrated_news)
            print(f"   TTS 预生成完成: 成功 {tts_stats['success']}, 跳过 {tts_stats['skipped']}, 失败 {tts_stats['failed']}")
        except Exception as e:
            print(f"   ⚠️ TTS 预生成失败（不阻断流程）: {e}")

        # 保存到 app/data/news.json (作为备份和前端兼容)
        output_path = os.path.join(os.path.dirname(__file__), '..', 'app', 'data', 'news.json')
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, ensure_ascii=False, indent=2)

        print("-" * 50)
        print(f"✅ 完成!")
        print(f"   数据库: {db_count} 条")
        print(f"   JSON文件: {output_path}")
        print(f"   总计: {len(calibrated_news)} 条新闻")
        print(f"   高质量 (A/B): {len([n for n in calibrated_news if n['quality']['grade'] in ['A+', 'A', 'B']])} 条")

        return calibrated_news
        
    except ImportError as e:
        print(f"\n⚠️  导入错误: {e}")
        print("   请确保已安装依赖: pip install -r requirements.txt")
        return []
    except Exception as e:
        print(f"\n❌ 错误: {e}")
        import traceback
        traceback.print_exc()
        return []

def main():
    parser = argparse.ArgumentParser(description='TechEcho Pro 新闻收集工具')
    parser.add_argument('--category', '-c', help='指定分类 (ai/tools/news/product)')
    parser.add_argument('--lang', '-l', help='指定语言 (zh/en)')
    parser.add_argument('--limit', type=int, help='限制新闻数量')
    parser.add_argument('--min-quality', type=int, default=55, help='最低质量分数 (默认55)')
    
    args = parser.parse_args()
    
    result = asyncio.run(collect_news(
        category=args.category,
        lang=args.lang,
        limit=args.limit,
        min_quality=args.min_quality
    ))
    
    sys.exit(0 if result else 1)

if __name__ == '__main__':
    main()
