"""
定时任务模块

包含:
- scheduler_service: 每日 8:30 自动收集新闻
"""

from src.services.scheduler.scheduler_service import (
    start_scheduler,
    stop_scheduler,
    get_scheduler_status,
    daily_news_collection,
)

__all__ = [
    'start_scheduler',
    'stop_scheduler',
    'get_scheduler_status',
    'daily_news_collection',
]
