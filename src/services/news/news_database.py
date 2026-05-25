"""
新闻数据库服务 - MySQL 版本

使用 SQLAlchemy AsyncEngine + AsyncSession 实现异步 MySQL 访问。
"""
import json
import logging
from datetime import datetime
from typing import List, Optional, Dict, Any

from sqlalchemy import text, update
from sqlalchemy.dialects.mysql import insert

logger = logging.getLogger(__name__)

# 导入数据库连接管理
from src.services.db import get_db_session
from src.services.models import News


async def init_news_table():
    """初始化新闻表（MySQL 版本）"""
    try:
        async with get_db_session() as session:
            # 创建表（如果不存在）
            await session.execute(text("""
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
                    is_read BOOLEAN DEFAULT FALSE,
                    is_favorited BOOLEAN DEFAULT FALSE,
                    audio_url TEXT,
                    cloud_file_id VARCHAR(255),
                    backup_audio_url TEXT,
                    INDEX idx_lang (lang),
                    INDEX idx_category (category),
                    INDEX idx_published_at (published_at),
                    INDEX idx_quality_score (quality_score)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """))
            await session.commit()
            logger.info("MySQL news_items table initialized")
    except Exception as e:
        logger.error(f"Failed to init news table: {e}")
        raise


async def save_news_to_db(news_list: List[Dict[str, Any]]) -> int:
    """保存新闻列表到 MySQL 数据库"""
    if not news_list:
        return 0

    saved_count = 0

    async with get_db_session() as session:
        for item in news_list:
            quality = item.get('quality', {})
            quality_scores = quality.get('scores', {})

            # 使用 INSERT ... ON DUPLICATE KEY UPDATE 实现 upsert
            stmt = insert(News).values(
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
                quality_scores=json.dumps(quality_scores, ensure_ascii=False),
            )
            stmt = stmt.on_duplicate_key_update(
                title_zh=stmt.inserted.title_zh,
                title_en=stmt.inserted.title_en,
                content_zh=stmt.inserted.content_zh,
                content_en=stmt.inserted.content_en,
                source_zh=stmt.inserted.source_zh,
                source_en=stmt.inserted.source_en,
                source_url=stmt.inserted.source_url,
                lang=stmt.inserted.lang,
                category=stmt.inserted.category,
                published_at=stmt.inserted.published_at,
                created_at=stmt.inserted.created_at,
                quality_score=stmt.inserted.quality_score,
                quality_grade=stmt.inserted.quality_grade,
                quality_scores=stmt.inserted.quality_scores,
            )
            await session.execute(stmt)
            saved_count += 1

        await session.commit()

    logger.info(f"Saved {saved_count} news items to MySQL")
    return saved_count


async def get_news_from_db(
    lang: Optional[str] = None,
    category: Optional[str] = None,
    date: Optional[str] = None,
    min_quality: Optional[int] = 0,
    limit: Optional[int] = None
) -> List[Dict[str, Any]]:
    """从 MySQL 数据库获取新闻"""
    async with get_db_session() as session:
        query = "SELECT * FROM news_items WHERE 1=1"
        params = []

        if lang:
            query += " AND lang = :lang"
            params.append(('lang', lang))

        if category and category != 'all':
            query += " AND category = :category"
            params.append(('category', category))

        if date:
            query += " AND published_at LIKE :date"
            params.append(('date', f'{date}%'))

        if min_quality:
            query += " AND quality_score >= :min_quality"
            params.append(('min_quality', min_quality))

        query += " ORDER BY quality_score DESC"

        if limit:
            query += f" LIMIT {limit}"

        # 构建参数字典
        param_dict = {k: v for k, v in params}

        result = await session.execute(text(query), param_dict)
        rows = result.fetchall()

        news_list = []
        for row in rows:
            # 将 Row 对象转换为字典
            row_dict = dict(row._mapping)
            item = {
                'id': row_dict.get('id'),
                'title_zh': row_dict.get('title_zh'),
                'title_en': row_dict.get('title_en'),
                'content_zh': row_dict.get('content_zh'),
                'content_en': row_dict.get('content_en'),
                'source_zh': row_dict.get('source_zh'),
                'source_en': row_dict.get('source_en'),
                'source_url': row_dict.get('source_url'),
                'lang': row_dict.get('lang'),
                'category': row_dict.get('category'),
                'published_at': row_dict.get('published_at'),
                'created_at': row_dict.get('created_at'),
                'quality': {
                    'total_100': row_dict.get('quality_score'),
                    'grade': row_dict.get('quality_grade'),
                    'scores': json.loads(row_dict.get('quality_scores') or '{}')
                },
                'is_read': bool(row_dict.get('is_read')),
                'is_favorited': bool(row_dict.get('is_favorited')),
                'audio_url': row_dict.get('audio_url'),
                'cloud_file_id': row_dict.get('cloud_file_id'),
                'backup_audio_url': row_dict.get('backup_audio_url'),
            }
            # 附加 audio 字段（前端兼容格式）
            if item.get('audio_url'):
                item['audio'] = {'voice3': item['audio_url']}
            else:
                item['audio'] = {}
            news_list.append(item)

        return news_list


async def get_news_stats() -> Dict[str, Any]:
    """获取新闻统计"""
    async with get_db_session() as session:
        result = await session.execute(text("SELECT COUNT(*) as total FROM news_items"))
        total = result.scalar() or 0

        result = await session.execute(
            text("SELECT quality_grade, COUNT(*) as count FROM news_items GROUP BY quality_grade")
        )
        grade_stats = {row[0]: row[1] for row in result.fetchall()}

        result = await session.execute(
            text("SELECT DISTINCT category FROM news_items WHERE category IS NOT NULL")
        )
        categories = [row[0] for row in result.fetchall()]

        result = await session.execute(
            text("SELECT MAX(created_at) as last_update FROM news_items")
        )
        last_update = result.scalar()

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


async def get_news_by_id(news_id: str) -> Optional[Dict[str, Any]]:
    """根据ID获取单条新闻"""
    async with get_db_session() as session:
        result = await session.execute(
            text("SELECT * FROM news_items WHERE id = :news_id"),
            {'news_id': news_id}
        )
        row = result.fetchone()

        if not row:
            return None

        row_dict = dict(row._mapping)
        audio_url = row_dict.get('audio_url')

        return {
            'id': row_dict.get('id'),
            'title_zh': row_dict.get('title_zh'),
            'title_en': row_dict.get('title_en'),
            'content_zh': row_dict.get('content_zh'),
            'content_en': row_dict.get('content_en'),
            'source_zh': row_dict.get('source_zh'),
            'source_en': row_dict.get('source_en'),
            'source_url': row_dict.get('source_url'),
            'lang': row_dict.get('lang'),
            'category': row_dict.get('category'),
            'published_at': row_dict.get('published_at'),
            'created_at': row_dict.get('created_at'),
            'quality': {
                'total_100': row_dict.get('quality_score'),
                'grade': row_dict.get('quality_grade'),
                'scores': json.loads(row_dict.get('quality_scores') or '{}')
            },
            'is_read': bool(row_dict.get('is_read')),
            'is_favorited': bool(row_dict.get('is_favorited')),
            'audio_url': audio_url,
            'cloud_file_id': row_dict.get('cloud_file_id'),
            'backup_audio_url': row_dict.get('backup_audio_url'),
            'audio': {'voice3': audio_url} if audio_url else {}
        }


async def mark_as_read(news_id: str) -> bool:
    """标记新闻为已读"""
    async with get_db_session() as session:
        result = await session.execute(
            text("UPDATE news_items SET is_read = TRUE WHERE id = :news_id"),
            {'news_id': news_id}
        )
        await session.commit()
        return result.rowcount > 0


async def save_news_audio(news_id: str, audio_url: str) -> bool:
    """保存新闻的预生成 TTS 音频 URL"""
    async with get_db_session() as session:
        result = await session.execute(
            text("UPDATE news_items SET audio_url = :audio_url WHERE id = :news_id"),
            {'audio_url': audio_url, 'news_id': news_id}
        )
        await session.commit()
        return result.rowcount > 0


async def get_news_audio_url(news_id: str) -> Optional[str]:
    """获取新闻的音频URL"""
    async with get_db_session() as session:
        result = await session.execute(
            text("SELECT audio_url FROM news_items WHERE id = :news_id"),
            {'news_id': news_id}
        )
        row = result.fetchone()
        return row[0] if row else None


async def get_news_cloud_file_id(news_id: str) -> Optional[str]:
    """获取新闻的云存储 fileID"""
    async with get_db_session() as session:
        result = await session.execute(
            text("SELECT cloud_file_id FROM news_items WHERE id = :news_id"),
            {'news_id': news_id}
        )
        row = result.fetchone()
        return row[0] if row else None


async def save_news_cloud_file_id(news_id: str, cloud_file_id: str) -> bool:
    """保存新闻的云存储 fileID"""
    async with get_db_session() as session:
        result = await session.execute(
            text("UPDATE news_items SET cloud_file_id = :cloud_file_id WHERE id = :news_id"),
            {'cloud_file_id': cloud_file_id, 'news_id': news_id}
        )
        await session.commit()
        return result.rowcount > 0


async def save_news_audio_urls(news_id: str, audio_url: str, backup_audio_url: str) -> bool:
    """
    保存新闻的音频 URL（云存储 + 备份）
    """
    async with get_db_session() as session:
        result = await session.execute(
            text("""
                UPDATE news_items
                SET audio_url = :audio_url,
                    cloud_file_id = :audio_url,
                    backup_audio_url = :backup_audio_url
                WHERE id = :news_id
            """),
            {'audio_url': audio_url, 'backup_audio_url': backup_audio_url, 'news_id': news_id}
        )
        await session.commit()
        return result.rowcount > 0


async def get_backup_audio_url(news_id: str) -> Optional[str]:
    """获取新闻的 MiniMax OSS 备份 URL"""
    async with get_db_session() as session:
        result = await session.execute(
            text("SELECT backup_audio_url FROM news_items WHERE id = :news_id"),
            {'news_id': news_id}
        )
        row = result.fetchone()
        return row[0] if row else None


async def get_news_without_audio(limit: int = 50) -> List[Dict[str, Any]]:
    """获取没有预生成音频的新闻（用于批量补生成）"""
    async with get_db_session() as session:
        result = await session.execute(
            text("""
                SELECT id, title_zh, title_en, content_zh, content_en, lang
                FROM news_items
                WHERE audio_url IS NULL OR audio_url = ''
                ORDER BY quality_score DESC
                LIMIT :limit
            """),
            {'limit': limit}
        )
        rows = result.fetchall()

        news_list = []
        for row in rows:
            row_dict = dict(row._mapping)
            item = {
                'id': row_dict.get('id'),
                'title_zh': row_dict.get('title_zh'),
                'title_en': row_dict.get('title_en'),
                'content_zh': row_dict.get('content_zh'),
                'content_en': row_dict.get('content_en'),
                'lang': row_dict.get('lang'),
            }
            news_list.append(item)
        return news_list


# 延迟初始化，避免启动时连接失败
# 实际初始化在应用启动时通过 app.py 调用
def get_init_task():
    """获取异步初始化任务"""
    import asyncio
    return asyncio.create_task(init_news_table())
