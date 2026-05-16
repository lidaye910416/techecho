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

# Add src to path - 使用绝对路径避免 __file__ 问题
# 优先使用环境变量指定项目根目录
_project_root = os.environ.get('PROJECT_ROOT', None)

if _project_root is None:
    try:
        _script_path = os.path.abspath(__file__)
    except (NameError, AttributeError):
        _script_path = os.path.abspath('scripts/collect_news.py')
    _script_dir = os.path.dirname(_script_path)
    _project_root = os.path.dirname(_script_dir)

# 确保 _project_root 是绝对路径
if not os.path.isabs(_project_root):
    _project_root = os.path.abspath(_project_root)

_src_path = os.path.join(_project_root, 'src')
if _src_path not in sys.path:
    sys.path.insert(0, _src_path)

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
        import importlib.util
        import importlib.machinery

        # 尝试标准导入，如果失败则使用 importlib 直接加载
        try:
            from src.services.news import BilingualNewsCollector, NewsAICalibrator, save_news_to_db
        except ModuleNotFoundError:
            # 直接从文件加载模块
            news_init_path = os.path.join(_src_path, 'services', 'news', '__init__.py')
            if os.path.exists(news_init_path):
                # 创建模块 spec 并加载
                news_spec = importlib.util.spec_from_file_location("src.services.news", news_init_path)
                news_module = importlib.util.module_from_spec(news_spec)

                # 先加载父模块
                src_spec = importlib.util.spec_from_file_location("src", os.path.join(_src_path, '__init__.py'))
                src_module = importlib.util.module_from_spec(src_spec)
                sys.modules['src'] = src_module
                src_spec.loader.exec_module(src_module)

                # 加载 services 模块
                services_spec = importlib.util.spec_from_file_location("src.services", os.path.join(_src_path, 'services', '__init__.py'))
                services_module = importlib.util.module_from_spec(services_spec)
                sys.modules['src.services'] = services_module
                services_spec.loader.exec_module(services_module)

                # 加载 news 模块
                sys.modules['src.services.news'] = news_module
                news_spec.loader.exec_module(news_module)

                # 获取导出对象
                BilingualNewsCollector = news_module.BilingualNewsCollector
                NewsAICalibrator = news_module.NewsAICalibrator
                save_news_to_db = news_module.save_news_to_db
            else:
                raise ImportError(f"Cannot find module: {news_init_path}")

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
        db_count = save_news_to_db(calibrated_news)
        print(f"   已存入数据库: {db_count} 条")

        # TTS 预生成（采集后自动为每条新闻生成语音缓存）
        try:
            try:
                from src.services.tts import pre_generate_tts_for_news
            except ModuleNotFoundError:
                # TTS 模块也使用 importlib 加载
                tts_init_path = os.path.join(_src_path, 'services', 'tts', '__init__.py')
                if os.path.exists(tts_init_path):
                    tts_spec = importlib.util.spec_from_file_location("src.services.tts", tts_init_path)
                    tts_module = importlib.util.module_from_spec(tts_spec)
                    sys.modules['src.services.tts'] = tts_module
                    tts_spec.loader.exec_module(tts_module)
                    pre_generate_tts_for_news = tts_module.pre_generate_tts_for_news
                else:
                    raise ImportError(f"Cannot find module: {tts_init_path}")

            print("\n[5/5] TTS 语音预生成...")
            tts_stats = await pre_generate_tts_for_news(calibrated_news)
            print(f"   TTS 预生成完成: 成功 {tts_stats['success']}, 跳过 {tts_stats['skipped']}, 失败 {tts_stats['failed']}")
        except Exception as e:
            print(f"   ⚠️ TTS 预生成失败（不阻断流程）: {e}")

        # 保存到 app/data/news.json (作为备份和前端兼容)
        output_path = os.path.join(_project_root, 'app', 'data', 'news.json')
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
        import traceback
        print(f"\n⚠️  导入错误: {e}")
        traceback.print_exc()
        print("   请确保已安装依赖: pip install -r requirements.txt")
        return []
    except Exception as e:
        print(f"\n❌ 错误: {e}")
        import traceback
        traceback.print_exc()
        return []

def main():
    """
    新闻收集主入口

    服务器部署说明:
    1. 设置环境变量 PROJECT_ROOT 为项目根目录:
       export PROJECT_ROOT=/path/to/digital-human-tool

    2. 使用 cron 定时任务调用:
       30 8 * * * cd /path/to/digital-human-tool && python3 scripts/collect_news.py >> /var/log/news_collect.log 2>&1

    3. 或使用 shell 脚本 (scripts/daily_workflow.sh):
       ./scripts/daily_workflow.sh
    """
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
