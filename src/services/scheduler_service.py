"""定时任务服务

每日早上 8:30 自动收集资讯并保存到数据库
"""
import logging
from datetime import datetime, timedelta
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)

# 全局调度器实例
scheduler = AsyncIOScheduler()


async def daily_news_collection():
    """每日资讯收集任务"""
    logger.info("⏰ 定时任务：开始收集资讯")

    try:
        # 动态导入避免循环依赖
        from src.services.news_collector_v2 import BilingualNewsCollector
        from src.services.news_ai_calibrator import NewsAICalibrator
        from src.services.news_database import save_news_to_db

        collector = BilingualNewsCollector()
        calibrator = NewsAICalibrator()

        # 收集新闻
        news_items = await collector.collect_all()

        # 过滤低质量
        filtered = [n for n in news_items if (n.quality.total_100 if n.quality else 0) >= 55]

        # 转换为字典
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

        # AI 校准
        calibrated_news, stats = calibrator.batch_calibrate(news_dicts, min_score=55)

        # 保存到数据库（前端通过 /api/news 接口读取）
        db_count = save_news_to_db(calibrated_news)

        logger.info(f"✅ 资讯收集完成: 通过 {stats['passed']} 条, 写入数据库 {db_count} 条")

        # TTS 预生成（采集后自动为每条新闻生成语音缓存）
        try:
            from src.services.tts_pregen import pre_generate_tts_for_news
            logger.info("🎙️ 开始 TTS 预生成...")
            tts_stats = await pre_generate_tts_for_news(calibrated_news)
            logger.info(
                f"🎙️ TTS 预生成完成: 成功 {tts_stats['success']}, "
                f"跳过 {tts_stats['skipped']}, 失败 {tts_stats['failed']}"
            )
        except Exception as e:
            logger.warning(f"⚠️ TTS 预生成失败（不阻断流程）: {e}")

        await collector.close()

    except Exception as e:
        logger.error(f"❌ 资讯收集失败: {e}")
        raise


def start_scheduler():
    """启动定时调度器"""
    if scheduler.running:
        logger.warning("Scheduler already running")
        return

    # 每日早上 8:30 执行
    scheduler.add_job(
        daily_news_collection,
        CronTrigger(hour=8, minute=30),
        id="daily_news_collection",
        name="每日资讯收集",
        replace_existing=True
    )

    scheduler.start()
    logger.info("✅ 定时调度器已启动 (每日 08:30)")


def stop_scheduler():
    """停止定时调度器"""
    if scheduler.running:
        scheduler.shutdown()
        logger.info("⏹️ 定时调度器已停止")


def get_scheduler_status():
    """获取调度器状态"""
    jobs = scheduler.get_jobs()
    return {
        "running": scheduler.running,
        "jobs": [
            {
                "id": job.id,
                "name": job.name,
                "next_run": job.next_run_time.isoformat() if job.next_run_time else None
            }
            for job in jobs
        ]
    }
