"""
新闻数据库服务 - MySQL 版本

使用 SQLAlchemy AsyncEngine 实现异步 MySQL 访问。
支持自动重试（应对微信云托管 Serverless 冷启动）。

所有函数签名与 SQLite 版本保持一致，确保向后兼容。
"""

import asyncio
import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import select, update, func, text
from sqlalchemy.dialects.mysql import insert

from src.services.db import get_db_session
from src.services.models import News

logger = logging.getLogger(__name__)

# 最大重试次数
MAX_RETRIES = 3
RETRY_DELAY = 1.0


async def init_news_table() -> None:
    """
    初始化新闻表（创建表结构）
    
    使用 CREATE TABLE IF NOT EXISTS 确保幂等性。
    """
    async with get_db_session(max_retries=MAX_RETRIES) as session:
        # 使用原始 SQL 创建表（兼容迁移）
        create_table_sql = text("""
            CREATE TABLE IF NOT EXISTS news_items (
                id VARCHAR(50) PRIMARY KEY,
                title_zh VARCHAR(500),
                title_en VARCHAR(500),
                content_zh TEXT,
                content_en TEXT,
                source_zh VARCHAR(100),
                source_en VARCHAR(100),
                source_url VARCHAR(1000),
                lang VARCHAR(10),
                category VARCHAR(50),
                published_at VARCHAR(50),
                created_at VARCHAR(50),
                quality_score FLOAT,
                quality_grade VARCHAR(5),
                quality_scores TEXT,
                is_read BOOLEAN DEFAULT 0,
                is_favorited BOOLEAN DEFAULT 0,
                audio_url TEXT,
                cloud_file_id VARCHAR(255)
            )
        """)
        await session.execute(create_table_sql)
        await session.commit()


async def _row_to_news_dict(row: News) -> Dict[str, Any]:
    """将数据库行转换为字典格式"""
    audio_url = row.audio_url
    cloud_file_id = row.cloud_file_id
    return {
        'id': row.id,
        'title_zh': row.title_zh,
        'title_en': row.title_en,
        'content_zh': row.content_zh,
        'content_en': row.content_en,
        'source_zh': row.source_zh,
        'source_en': row.source_en,
        'source_url': row.source_url,
        'lang': row.lang,
        'category': row.category,
        'published_at': row.published_at,
        'created_at': row.created_at,
        'quality': {
            'total_100': row.quality_score,
            'grade': row.quality_grade,
            'scores': json.loads(row.quality_scores) if row.quality_scores else {}
        },
        'is_read': bool(row.is_read),
        'is_favorited': bool(row.is_favorited),
        'audio_url': audio_url,
        'cloud_file_id': cloud_file_id,
        'audio': {'voice3': audio_url} if audio_url else {}
    }


async def _save_news_to_db(news_list: List[Dict[str, Any]]) -> int:
    """
    保存新闻列表到数据库（异步 MySQL）
    """
    if not news_list:
        return 0

    saved_count = 0

    async with get_db_session(max_retries=MAX_RETRIES) as session:
        for item in news_list:
            quality = item.get('quality', {})
            quality_scores = quality.get('scores', {})
            
            # 使用 INSERT ... ON DUPLICATE KEY UPDATE 实现 upsert
            news = News(
                id=item.get('id'),
                title_zh=item.get('title_zh'),
                title_en=item.get('title_en'),
                content_zh=item.get('content_zh'),
                content_en=item.get('content_en'),
                source_zh=item.get('source_zh'),
                source_en=item.get('source_en'),
                source_url=item.get('source_url'),
                lang=item.get('lang'),
                category=item.get('category'),
                published_at=item.get('published_at'),
                created_at=item.get('created_at'),
                quality_score=quality.get('total_100'),
                quality_grade=quality.get('grade'),
                quality_scores=json.dumps(quality_scores, ensure_ascii=False) if quality_scores else None,
                is_read=False,
                is_favorited=False,
                audio_url=None,
                cloud_file_id=None,
            )
            session.add(news)
            saved_count += 1
        
        await session.commit()
    
    return saved_count


async def _get_news_from_db(
    lang: Optional[str] = None,
    category: Optional[str] = None,
    date: Optional[str] = None,
    min_quality: Optional[int] = 0,
    limit: Optional[int] = None
) -> List[Dict[str, Any]]:
    """
    从数据库获取新闻（异步 MySQL）
    
    与 SQLite 版本签名一致。
    """
    async with get_db_session(max_retries=MAX_RETRIES) as session:
        query = select(News).where(News.quality_score >= min_quality)
        
        if lang:
            query = query.where(News.lang == lang)
        
        if category and category != 'all':
            query = query.where(News.category == category)
        
        if date:
            query = query.where(News.published_at.like(f"{date}%"))
        
        query = query.order_by(News.quality_score.desc())
        
        if limit:
            query = query.limit(limit)
        
        result = await session.execute(query)
        rows = result.scalars().all()
        
        news_list = [_row_to_news_dict(row) for row in rows]
    
    return news_list


async def _get_news_stats() -> Dict[str, Any]:
    """
    获取新闻统计（异步 MySQL）
    
    返回格式与 SQLite 版本一致。
    """
    async with get_db_session(max_retries=MAX_RETRIES) as session:
        # 总数
        count_query = select(func.count(News.id))
        total_result = await session.execute(count_query)
        total = total_result.scalar() or 0
        
        # 等级统计
        grade_query = select(News.quality_grade, func.count(News.id)).group_by(News.quality_grade)
        grade_result = await session.execute(grade_query)
        grade_stats = {row[0]: row[1] for row in grade_result.all()}
        
        # 分类列表
        cat_query = select(News.category).distinct().where(News.category.isnot(None))
        cat_result = await session.execute(cat_query)
        categories = [row[0] for row in cat_result.all()]
        
        # 最后更新时间
        last_query = select(func.max(News.created_at))
        last_result = await session.execute(last_query)
        last_update = last_result.scalar()
        
        return {
            'totalCount': total,
            'lastUpdate': last_update,
            'stats': {
                'A+': grade_stats.get('A+', 0),
                'A': grade_stats.get('A', 0),
                'B': grade_stats.get('B', 0),
                'C': grade_stats.get('C', 0),
                'D': grade_stats.get('D', 0)
            },
            'categories': categories
        }


async def _get_news_by_id(news_id: str) -> Optional[Dict[str, Any]]:
    """
    根据ID获取单条新闻（异步 MySQL）
    """
    async with get_db_session(max_retries=MAX_RETRIES) as session:
        query = select(News).where(News.id == news_id)
        result = await session.execute(query)
        row = result.scalar_one_or_none()
        
        if not row:
            return None
        
        return _row_to_news_dict(row)


async def _mark_as_read(news_id: str) -> bool:
    """
    标记新闻为已读（异步 MySQL）
    """
    async with get_db_session(max_retries=MAX_RETRIES) as session:
        query = update(News).where(News.id == news_id).values(is_read=True)
        result = await session.execute(query)
        await session.commit()
        return result.rowcount > 0


async def _save_news_audio(news_id: str, audio_url: str) -> bool:
    """
    保存新闻的预生成 TTS 音频 URL（异步 MySQL）
    """
    async with get_db_session(max_retries=MAX_RETRIES) as session:
        query = update(News).where(News.id == news_id).values(audio_url=audio_url)
        result = await session.execute(query)
        await session.commit()
        return result.rowcount > 0


async def _get_news_audio_url(news_id: str) -> Optional[str]:
    """
    获取新闻的音频URL（异步 MySQL）
    """
    async with get_db_session(max_retries=MAX_RETRIES) as session:
        query = select(News.audio_url).where(News.id == news_id)
        result = await session.execute(query)
        row = result.scalar_one_or_none()
        return row


async def _get_news_cloud_file_id(news_id: str) -> Optional[str]:
    """
    获取新闻的云存储 fileID（异步 MySQL）
    """
    async with get_db_session(max_retries=MAX_RETRIES) as session:
        query = select(News.cloud_file_id).where(News.id == news_id)
        result = await session.execute(query)
        row = result.scalar_one_or_none()
        return row


async def _save_news_cloud_file_id(news_id: str, cloud_file_id: str) -> bool:
    """
    保存新闻的云存储 fileID（异步 MySQL）
    """
    async with get_db_session(max_retries=MAX_RETRIES) as session:
        query = update(News).where(News.id == news_id).values(cloud_file_id=cloud_file_id)
        result = await session.execute(query)
        await session.commit()
        return result.rowcount > 0


async def _get_news_without_audio(limit: int = 50) -> List[Dict[str, Any]]:
    """
    获取没有预生成音频的新闻（异步 MySQL）
    
    用于批量补生成。
    """
    async with get_db_session(max_retries=MAX_RETRIES) as session:
        query = (
            select(News)
            .where((News.audio_url.is_(None)) | (News.audio_url == ''))
            .order_by(News.quality_score.desc())
            .limit(limit)
        )
        result = await session.execute(query)
        rows = result.scalars().all()
        
        news_list = []
        for row in rows:
            news_list.append({
                'id': row.id,
                'title_zh': row.title_zh,
                'title_en': row.title_en,
                'content_zh': row.content_zh,
                'content_en': row.content_en,
                'lang': row.lang,
            })
        
        return news_list



# 同步包装函数（保持向后兼容）
def save_news_to_db(news_list: List[Dict[str, Any]]) -> int:
    """同步版本的 save_news_to_db"""
    return asyncio.run(_save_news_to_db(news_list))


def get_news_from_db(
    lang: Optional[str] = None,
    category: Optional[str] = None,
    date: Optional[str] = None,
    min_quality: Optional[int] = 0,
    limit: Optional[int] = None
) -> List[Dict[str, Any]]:
    """同步版本的 get_news_from_db"""
    return asyncio.run(_get_news_from_db(lang, category, date, min_quality, limit))


def get_news_stats() -> Dict[str, Any]:
    """同步版本的 get_news_stats"""
    return asyncio.run(_get_news_stats())


def get_news_by_id(news_id: str) -> Optional[Dict[str, Any]]:
    """同步版本的 get_news_by_id"""
    return asyncio.run(_get_news_by_id(news_id))


def mark_as_read(news_id: str) -> bool:
    """同步版本的 mark_as_read"""
    return asyncio.run(_mark_as_read(news_id))


def save_news_audio(news_id: str, audio_url: str) -> bool:
    """同步版本的 save_news_audio"""
    return asyncio.run(_save_news_audio(news_id, audio_url))


def get_news_audio_url(news_id: str) -> Optional[str]:
    """同步版本的 get_news_audio_url"""
    return asyncio.run(_get_news_audio_url(news_id))


def get_news_cloud_file_id(news_id: str) -> Optional[str]:
    """同步版本的 get_news_cloud_file_id"""
    return asyncio.run(_get_news_cloud_file_id(news_id))


def save_news_cloud_file_id(news_id: str, cloud_file_id: str) -> bool:
    """同步版本的 save_news_cloud_file_id"""
    return asyncio.run(_save_news_cloud_file_id(news_id, cloud_file_id))


def get_news_without_audio(limit: int = 50) -> List[Dict[str, Any]]:
    """同步版本的 get_news_without_audio"""
    return asyncio.run(_get_news_without_audio(limit))



# 同步函数已直接定义在上面
# 初始化表（首次导入时执行）
# 注意：异步函数不能在模块级别调用，放到应用启动时处理
# asyncio.run(init_news_table())
