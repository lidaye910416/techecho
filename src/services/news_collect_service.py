"""
新闻收集服务 - 供 API 和脚本复用

功能：
- 从 RSS 源收集新闻
- AI 质量评分和校准
- 保存到数据库
- TTS 语音预生成
"""

import asyncio
import logging
import uuid
from datetime import datetime
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, asdict

logger = logging.getLogger(__name__)


@dataclass
class CollectResult:
    """收集结果"""
    task_id: str
    status: str  # "completed" | "failed" | "running"
    raw_count: int
    filtered_count: int
    saved_count: int
    tts_stats: Optional[Dict[str, int]] = None
    error: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


# 全局任务状态存储
_task_status: Dict[str, CollectResult] = {}
_current_task_id: Optional[str] = None


def get_task_status(task_id: str) -> Optional[CollectResult]:
    """获取任务状态"""
    return _task_status.get(task_id)


def get_current_task() -> Optional[tuple]:
    """获取当前运行中的任务"""
    return (_current_task_id, _task_status.get(_current_task_id)) if _current_task_id else None


async def collect_news_async(
    category: Optional[str] = None,
    lang: Optional[str] = None,
    limit: Optional[int] = None,
    min_quality: int = 55,
    task_id: Optional[str] = None
) -> CollectResult:
    """
    异步执行新闻收集任务
    
    Args:
        category: 筛选分类 (ai/tools/news/product)
        lang: 筛选语言 (zh/en)
        limit: 限制数量
        min_quality: 最低质量分
        task_id: 任务ID（用于状态追踪）
    
    Returns:
        CollectResult: 收集结果
    """
    global _current_task_id
    
    if task_id is None:
        task_id = str(uuid.uuid4())
    
    _current_task_id = task_id
    
    result = CollectResult(
        task_id=task_id,
        status="running",
        raw_count=0,
        filtered_count=0,
        saved_count=0,
        tts_stats=None,
        error=None,
        started_at=datetime.now().isoformat(),
        completed_at=None
    )
    _task_status[task_id] = result
    
    logger.info(f"[{task_id}] 新闻收集任务开始")
    print(f"=" * 50)
    print(f"TechEcho Pro - 新闻收集工作流 (API模式)")
    print(f"=" * 50)
    print(f"任务ID: {task_id}")
    print(f"时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"分类: {category or '全部'}")
    print(f"语言: {lang or '全部'}")
    print(f"最低质量: {min_quality}")
    print("-" * 50)
    
    try:
        # 导入服务
        from src.services.news import BilingualNewsCollector, NewsAICalibrator, save_news_to_db
        
        collector = BilingualNewsCollector()
        calibrator = NewsAICalibrator()
        
        # 1. 收集新闻
        print("\n[1/5] 收集新闻...")
        news_items = await collector.collect_all(lang=lang, category=category)
        result.raw_count = len(news_items)
        print(f"   收集到 {len(news_items)} 条原始新闻")
        
        # 2. 过滤和排序
        print("\n[2/5] 过滤和排序...")
        filtered = [n for n in news_items if (n.quality.total_100 if n.quality else 0) >= min_quality]
        filtered.sort(key=lambda x: x.quality.total_100 if x.quality else 0, reverse=True)
        
        if limit:
            filtered = filtered[:limit]
        
        result.filtered_count = len(filtered)
        print(f"   过滤后剩余 {len(filtered)} 条 (质量 >= {min_quality})")
        
        # 3. 转换为字典
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
        
        # 4. AI校准
        print("\n[3/5] AI校准与内容润色...")
        calibrated_news, stats = calibrator.batch_calibrate(news_dicts, min_score=min_quality)
        print(f"   AI校准完成: 通过 {stats['passed']} 条, 修正 {stats['adjusted']} 条, "
              f"润色 {stats['content_refined']} 条, 舍弃 {stats['discarded']} 条")
        
        # 5. 保存到数据库
        print("\n[4/5] 保存到数据库...")
        db_count = save_news_to_db(calibrated_news)
        result.saved_count = db_count
        print(f"   已存入数据库: {db_count} 条")
        
        # 6. TTS 预生成
        print("\n[5/5] TTS 语音预生成...")
        try:
            from src.services.tts import pre_generate_tts_for_news
            tts_stats = await pre_generate_tts_for_news(calibrated_news)
            result.tts_stats = tts_stats
            print(f"   TTS 预生成完成: 成功 {tts_stats['success']}, "
                  f"跳过 {tts_stats['skipped']}, 失败 {tts_stats['failed']}")
        except Exception as e:
            logger.warning(f"TTS 预生成失败（不阻断流程）: {e}")
            print(f"   ⚠️ TTS 预生成失败（不阻断流程）: {e}")
            result.tts_stats = {"success": 0, "skipped": 0, "failed": len(calibrated_news)}
        
        # 完成
        result.status = "completed"
        result.completed_at = datetime.now().isoformat()
        
        print("-" * 50)
        print(f"✅ 完成! 任务ID: {task_id}")
        print(f"   数据库: {db_count} 条")
        print(f"   总计: {len(calibrated_news)} 条新闻")
        print(f"   高质量 (A/B): {len([n for n in calibrated_news if n['quality']['grade'] in ['A+', 'A', 'B']])} 条")
        
    except Exception as e:
        result.status = "failed"
        result.error = str(e)
        result.completed_at = datetime.now().isoformat()
        logger.error(f"[{task_id}] 新闻收集任务失败: {e}")
        print(f"\n❌ 错误: {e}")
    
    finally:
        _current_task_id = None
    
    return result


async def trigger_collect_task(
    category: Optional[str] = None,
    lang: Optional[str] = None,
    limit: Optional[int] = None,
    min_quality: int = 55
) -> str:
    """
    触发新闻收集任务（异步后台执行）
    
    Returns:
        task_id: 任务ID
    """
    task_id = str(uuid.uuid4())
    
    # 启动后台任务
    asyncio.create_task(
        collect_news_async(
            category=category,
            lang=lang,
            limit=limit,
            min_quality=min_quality,
            task_id=task_id
        )
    )
    
    return task_id
