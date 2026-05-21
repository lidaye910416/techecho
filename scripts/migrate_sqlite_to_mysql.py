#!/usr/bin/env python3
"""
SQLite 到 MySQL 数据迁移脚本

功能：
1. 从 SQLite 读取新闻数据
2. 创建 MySQL 表结构
3. 导入数据到 MySQL
4. 验证数据一致性

使用方法：
    python scripts/migrate_sqlite_to_mysql.py

注意事项：
- 迁移前请先备份 SQLite 数据库
- 确保 MySQL 数据库已创建
- 迁移脚本只会写入，不会删除任何数据
"""

import asyncio
import json
import os
import sys
import sqlite3
from datetime import datetime

# 添加项目路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from src.services.db import get_db_session, get_engine
from src.services.models import News


def get_sqlite_connection(db_path: str) -> sqlite3.Connection:
    """获取 SQLite 连接"""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def read_sqlite_data(db_path: str) -> list:
    """从 SQLite 读取所有新闻数据"""
    if not os.path.exists(db_path):
        print(f"❌ SQLite 数据库不存在: {db_path}")
        return []
    
    conn = get_sqlite_connection(db_path)
    cursor = conn.cursor()
    
    # 检查表是否存在
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='news_items'")
    if not cursor.fetchone():
        print("❌ news_items 表不存在")
        conn.close()
        return []
    
    # 读取所有数据
    cursor.execute("SELECT * FROM news_items")
    rows = cursor.fetchall()
    
    data = []
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
            'quality_score': row['quality_score'],
            'quality_grade': row['quality_grade'],
            'quality_scores': row['quality_scores'],
            'is_read': bool(row['is_read']),
            'is_favorited': bool(row['is_favorited']),
            'audio_url': row['audio_url'] if 'audio_url' in row.keys() else None,
            'cloud_file_id': row['cloud_file_id'] if 'cloud_file_id' in row.keys() else None,
        }
        data.append(item)
    
    conn.close()
    print(f"✓ 从 SQLite 读取了 {len(data)} 条记录")
    return data


async def create_mysql_table():
    """创建 MySQL 表结构"""
    async with get_db_session(max_retries=3) as session:
        # 创建表
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
        print("✓ MySQL 表结构已创建/验证")


async def import_to_mysql(data: list) -> int:
    """导入数据到 MySQL"""
    if not data:
        print("⚠️ 没有数据需要导入")
        return 0
    
    imported = 0
    
    async with get_db_session(max_retries=3) as session:
        for item in data:
            # 使用 INSERT ... ON DUPLICATE KEY UPDATE
            insert_sql = text("""
                INSERT INTO news_items (
                    id, title_zh, title_en, content_zh, content_en,
                    source_zh, source_en, source_url, lang, category,
                    published_at, created_at, quality_score, quality_grade,
                    quality_scores, is_read, is_favorited, audio_url, cloud_file_id
                ) VALUES (
                    :id, :title_zh, :title_en, :content_zh, :content_en,
                    :source_zh, :source_en, :source_url, :lang, :category,
                    :published_at, :created_at, :quality_score, :quality_grade,
                    :quality_scores, :is_read, :is_favorited, :audio_url, :cloud_file_id
                )
                ON DUPLICATE KEY UPDATE
                    title_zh = VALUES(title_zh),
                    title_en = VALUES(title_en),
                    content_zh = VALUES(content_zh),
                    content_en = VALUES(content_en),
                    quality_score = VALUES(quality_score),
                    quality_grade = VALUES(quality_grade),
                    quality_scores = VALUES(quality_scores)
            """)
            
            await session.execute(insert_sql, {
                'id': item['id'],
                'title_zh': item['title_zh'],
                'title_en': item['title_en'],
                'content_zh': item['content_zh'],
                'content_en': item['content_en'],
                'source_zh': item['source_zh'],
                'source_en': item['source_en'],
                'source_url': item['source_url'],
                'lang': item['lang'],
                'category': item['category'],
                'published_at': item['published_at'],
                'created_at': item['created_at'],
                'quality_score': item['quality_score'],
                'quality_grade': item['quality_grade'],
                'quality_scores': item['quality_scores'],
                'is_read': item['is_read'],
                'is_favorited': item['is_favorited'],
                'audio_url': item['audio_url'],
                'cloud_file_id': item['cloud_file_id'],
            })
            imported += 1
        
        await session.commit()
    
    return imported


async def verify_migration(sqlite_count: int) -> dict:
    """验证迁移结果"""
    async with get_db_session(max_retries=3) as session:
        # 统计 MySQL 中的记录数
        count_sql = text("SELECT COUNT(*) as cnt FROM news_items")
        result = await session.execute(count_sql)
        mysql_count = result.scalar()
        
        # 统计各等级数量
        grade_sql = text("""
            SELECT quality_grade, COUNT(*) as cnt 
            FROM news_items 
            GROUP BY quality_grade
        """)
        result = await session.execute(grade_sql)
        grade_stats = {row[0]: row[1] for row in result.all()}
        
        return {
            'sqlite_count': sqlite_count,
            'mysql_count': mysql_count,
            'grade_stats': grade_stats,
            'success': sqlite_count == mysql_count
        }


async def main():
    """主函数"""
    print("=" * 60)
    print("TechEcho Pro - SQLite 到 MySQL 数据迁移")
    print("=" * 60)
    print()
    
    # 获取路径
    data_dir = os.getenv('DATA_DIR', '/app/data')
    sqlite_db_path = os.path.join(data_dir, 'database.db')
    
    print(f"SQLite 数据库: {sqlite_db_path}")
    print(f"迁移时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    # 1. 读取 SQLite 数据
    print("[1/4] 读取 SQLite 数据...")
    data = read_sqlite_data(sqlite_db_path)
    if not data:
        print("⚠️ 迁移终止：没有数据可迁移")
        return
    
    # 2. 创建 MySQL 表
    print("\n[2/4] 创建 MySQL 表结构...")
    await create_mysql_table()
    
    # 3. 导入数据
    print("\n[3/4] 导入数据到 MySQL...")
    imported = await import_to_mysql(data)
    print(f"✓ 成功导入 {imported} 条记录")
    
    # 4. 验证
    print("\n[4/4] 验证迁移结果...")
    result = await verify_migration(len(data))
    
    print()
    print("=" * 60)
    print("迁移结果")
    print("=" * 60)
    print(f"SQLite 记录数: {result['sqlite_count']}")
    print(f"MySQL 记录数: {result['mysql_count']}")
    print(f"等级分布: {result['grade_stats']}")
    print(f"状态: {'✅ 成功' if result['success'] else '⚠️ 数量不一致'}")
    print()
    
    if result['success']:
        print("🎉 数据迁移完成！")
    else:
        print("⚠️ 警告：记录数不一致，请检查数据")
    
    # 清理
    from src.services.db import close_engine
    await close_engine()


if __name__ == '__main__':
    asyncio.run(main())
