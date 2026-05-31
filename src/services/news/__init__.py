"""
新闻服务模块

包含:
- news_collector: RSS 新闻收集 + 质量评分
- news_ai_calibrator: AI 校准、分类、内容润色
- news_database: SQLite 数据库操作
"""

from src.services.news.news_collector_v2 import BilingualNewsCollector, collector
from src.services.news.news_ai_calibrator import NewsAICalibrator, get_calibrator
from src.services.news.news_database import (
    save_news_to_db,
    get_news_from_db,
    get_news_stats,
    get_news_by_id,
    mark_as_read,
    save_news_audio,
    get_news_audio_url,
    get_news_cloud_file_id,
    save_news_cloud_file_id,
    get_news_without_audio,
    save_news_audio_urls,  # 新增：同时保存云存储 URL 和备份 URL
    get_backup_audio_url,  # 新增：获取 MiniMax OSS 备份 URL
    init_news_table,       # 新增：MySQL 表初始化
)

__all__ = [
    'BilingualNewsCollector',
    'collector',
    'NewsAICalibrator',
    'get_calibrator',
    'save_news_to_db',
    'get_news_from_db',
    'get_news_stats',
    'get_news_by_id',
    'mark_as_read',
    'save_news_audio',
    'get_news_audio_url',
    'get_news_cloud_file_id',
    'save_news_cloud_file_id',
    'get_news_without_audio',
    'save_news_audio_urls',
    'get_backup_audio_url',
    'init_news_table',
]
