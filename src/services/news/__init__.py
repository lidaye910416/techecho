"""
新闻服务模块

包含:
- news_collector: RSS 新闻收集 + 质量评分
- news_ai_calibrator: AI 校准、分类、内容润色
- news_database: MySQL 数据库操作
"""

from src.services.news.news_collector_v2 import BilingualNewsCollector, collector
from src.services.news.news_ai_calibrator import NewsAICalibrator, get_calibrator
from src.services.news.news_database import (
    # 同步版本（向后兼容）
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
    # 异步版本（用于 FastAPI async 端点）
    _save_news_to_db,
    _get_news_from_db,
    _get_news_stats,
    _get_news_by_id,
    _mark_as_read,
    _save_news_audio,
    _get_news_audio_url,
    _get_news_cloud_file_id,
    _save_news_cloud_file_id,
    _get_news_without_audio,
)

__all__ = [
    'BilingualNewsCollector',
    'collector',
    'NewsAICalibrator',
    'get_calibrator',
    # 同步版本
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
    # 异步版本
    '_save_news_to_db',
    '_get_news_from_db',
    '_get_news_stats',
    '_get_news_by_id',
    '_mark_as_read',
    '_save_news_audio',
    '_get_news_audio_url',
    '_get_news_cloud_file_id',
    '_save_news_cloud_file_id',
    '_get_news_without_audio',
]
