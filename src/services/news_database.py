"""
新闻数据库服务
"""
import sqlite3
import json
import os
from datetime import datetime
from typing import List, Optional, Dict, Any

DB_PATH = os.path.join(os.path.dirname(__file__), '../../data/database.db')

def get_db_connection():
    """获取数据库连接"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_news_table():
    """初始化新闻表"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS news_items (
            id TEXT PRIMARY KEY,
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
            is_favorited BOOLEAN DEFAULT 0
        )
    ''')
    conn.commit()
    conn.close()

def save_news_to_db(news_list: List[Dict[str, Any]]) -> int:
    """保存新闻列表到数据库"""
    if not news_list:
        return 0
    
    conn = get_db_connection()
    cursor = conn.cursor()
    saved_count = 0
    
    for item in news_list:
        quality = item.get('quality', {})
        quality_scores = quality.get('scores', {})
        
        cursor.execute('''
            INSERT OR REPLACE INTO news_items (
                id, title_zh, title_en, content_zh, content_en,
                source_zh, source_en, source_url, lang, category,
                published_at, created_at, quality_score, quality_grade,
                quality_scores
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            item.get('id'),
            item.get('title_zh'),
            item.get('title_en'),
            item.get('content_zh'),
            item.get('content_en'),
            item.get('source_zh'),
            item.get('source_en'),
            item.get('source_url'),
            item.get('lang'),
            item.get('category'),
            item.get('published_at'),
            item.get('created_at'),
            quality.get('total_100'),
            quality.get('grade'),
            json.dumps(quality_scores, ensure_ascii=False)
        ))
        saved_count += 1
    
    conn.commit()
    conn.close()
    return saved_count

def get_news_from_db(
    lang: Optional[str] = None,
    category: Optional[str] = None,
    date: Optional[str] = None,
    min_quality: Optional[int] = 0,
    limit: Optional[int] = None
) -> List[Dict[str, Any]]:
    """从数据库获取新闻"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = "SELECT * FROM news_items WHERE 1=1"
    params = []
    
    if lang:
        query += " AND lang = ?"
        params.append(lang)
    
    if category and category != 'all':
        query += " AND category = ?"
        params.append(category)
    
    if date:
        query += " AND published_at LIKE ?"
        params.append(f"{date}%")
    
    if min_quality:
        query += " AND quality_score >= ?"
        params.append(min_quality)
    
    query += " ORDER BY quality_score DESC"
    
    if limit:
        query += f" LIMIT {limit}"
    
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    
    news_list = []
    for row in rows:
        item = {
            'id': row['id'],
            'title_zh': row['title_zh'],
            'title_en': row['title_en'],
            'content_zh': row['content_zh'],
            'content_en': row['content_en'],
            'source_zh': row['source_zh'],
            'source_en': row['source_en'],
            'source_url': row['source_url'],
            'lang': row['lang'],
            'category': row['category'],
            'published_at': row['published_at'],
            'created_at': row['created_at'],
            'quality': {
                'total_100': row['quality_score'],
                'grade': row['quality_grade'],
                'scores': json.loads(row['quality_scores']) if row['quality_scores'] else {}
            },
            'is_read': bool(row['is_read']),
            'is_favorited': bool(row['is_favorited'])
        }
        news_list.append(item)
    
    return news_list

def get_news_stats() -> Dict[str, Any]:
    """获取新闻统计"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT COUNT(*) as total FROM news_items")
    total = cursor.fetchone()['total']
    
    cursor.execute("SELECT quality_grade, COUNT(*) as count FROM news_items GROUP BY quality_grade")
    grade_stats = {row['quality_grade']: row['count'] for row in cursor.fetchall()}
    
    cursor.execute("SELECT DISTINCT category FROM news_items WHERE category IS NOT NULL")
    categories = [row['category'] for row in cursor.fetchall()]
    
    cursor.execute("SELECT MAX(created_at) as last_update FROM news_items")
    last_update = cursor.fetchone()['last_update']
    
    conn.close()
    
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

def get_news_by_id(news_id: str) -> Optional[Dict[str, Any]]:
    """根据ID获取单条新闻"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM news_items WHERE id = ?", (news_id,))
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        return None
    
    return {
        'id': row['id'],
        'title_zh': row['title_zh'],
        'title_en': row['title_en'],
        'content_zh': row['content_zh'],
        'content_en': row['content_en'],
        'source_zh': row['source_zh'],
        'source_en': row['source_en'],
        'source_url': row['source_url'],
        'lang': row['lang'],
        'category': row['category'],
        'published_at': row['published_at'],
        'created_at': row['created_at'],
        'quality': {
            'total_100': row['quality_score'],
            'grade': row['quality_grade'],
            'scores': json.loads(row['quality_scores']) if row['quality_scores'] else {}
        },
        'is_read': bool(row['is_read']),
        'is_favorited': bool(row['is_favorited'])
    }

def mark_as_read(news_id: str) -> bool:
    """标记新闻为已读"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE news_items SET is_read = 1 WHERE id = ?", (news_id,))
    affected = cursor.rowcount
    conn.commit()
    conn.close()
    return affected > 0

# 初始化表
init_news_table()
