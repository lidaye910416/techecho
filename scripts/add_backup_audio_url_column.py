#!/usr/bin/env python3
"""
数据库迁移脚本：添加 backup_audio_url 列

功能：
- 在 news_items 表中添加 backup_audio_url 列
- 如果列已存在则跳过

使用方法：
    python scripts/add_backup_audio_url_column.py
"""

import asyncio
import sys
import os

# 添加项目路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from src.services.db import get_db_session


async def add_backup_audio_url_column():
    """添加 backup_audio_url 列"""
    print("🔄 开始添加 backup_audio_url 列...")
    
    async with get_db_session(max_retries=3) as session:
        # 检查列是否存在
        check_sql = text("""
            SELECT COUNT(*) as cnt 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'news_items' 
            AND COLUMN_NAME = 'backup_audio_url'
        """)
        result = await session.execute(check_sql)
        count = result.scalar()
        
        if count > 0:
            print("✓ backup_audio_url 列已存在，跳过")
            return
        
        # 添加列
        alter_sql = text("""
            ALTER TABLE news_items 
            ADD COLUMN backup_audio_url TEXT DEFAULT NULL
        """)
        await session.execute(alter_sql)
        await session.commit()
        
        print("✓ backup_audio_url 列添加成功")
    
    # 验证
    async with get_db_session(max_retries=3) as session:
        verify_sql = text("DESCRIBE news_items")
        result = await session.execute(verify_sql)
        columns = [row[0] for row in result.fetchall()]
        
        if 'backup_audio_url' in columns:
            print("✓ 验证成功：backup_audio_url 列已存在")
        else:
            print("❌ 验证失败：backup_audio_url 列不存在")


if __name__ == "__main__":
    print("=" * 50)
    print("TechEcho - 添加 backup_audio_url 列")
    print("=" * 50)
    asyncio.run(add_backup_audio_url_column())
    print("=" * 50)
