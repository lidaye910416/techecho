"""
MySQL 数据库连接管理模块

使用 SQLAlchemy AsyncEngine + AsyncSession 实现异步 MySQL 访问。
支持连接池管理和自动重试（应对微信云托管 Serverless 冷启动）。
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine

logger = logging.getLogger(__name__)

# 全局异步引擎（延迟初始化）
_engine = None

# 连接池配置
POOL_SIZE = 5
MAX_OVERFLOW = 10
POOL_TIMEOUT = 30
POOL_RECYCLE = 3600  # 1小时，避免连接过期


def get_database_url() -> str:
    """构建 MySQL 连接 URL（运行时获取环境变量）"""
    # 运行时获取环境变量，支持动态配置
    # 从 settings 导入默认值
    from src.config.settings import (
        MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
    )
    host = os.getenv('MYSQL_HOST') or MYSQL_HOST
    port = int(os.getenv('MYSQL_PORT') or MYSQL_PORT)
    user = os.getenv('MYSQL_USER') or MYSQL_USER
    password = os.getenv('MYSQL_PASSWORD') or MYSQL_PASSWORD
    database = os.getenv('MYSQL_DATABASE') or MYSQL_DATABASE

    return (
        f"mysql+aiomysql://{user}:{password}@"
        f"{host}:{port}/{database}"
        f"?charset=utf8mb4"
    )


def get_engine() -> AsyncEngine:
    """获取或创建异步引擎（单例模式）"""
    global _engine
    if _engine is None:
        database_url = get_database_url()
        logger.info(f"[DB] Creating engine with URL: mysql+aiomysql://***:***@{os.getenv('MYSQL_HOST', 'not set')}:{os.getenv('MYSQL_PORT', '3306')}/***")
        _engine = create_async_engine(
            database_url,
            pool_size=POOL_SIZE,
            max_overflow=MAX_OVERFLOW,
            pool_timeout=POOL_TIMEOUT,
            pool_recycle=POOL_RECYCLE,
            echo=True,  # 开启 SQL 日志便于调试
        )
    return _engine


async def close_engine():
    """关闭引擎（应用退出时调用）"""
    global _engine
    if _engine:
        await _engine.dispose()
        _engine = None
        logger.info("MySQL engine disposed")


@asynccontextmanager
async def get_db_session(max_retries: int = 3, retry_delay: float = 1.0) -> AsyncGenerator[AsyncSession, None]:
    """
    获取数据库会话的上下文管理器
    
    自动处理重试逻辑，应对 Serverless 冷启动时的连接问题。
    
    Args:
        max_retries: 最大重试次数
        retry_delay: 重试间隔（秒）
    
    Yields:
        AsyncSession: 数据库会话
    
    Example:
        async with get_db_session() as session:
            result = await session.execute(text("SELECT 1"))
    """
    engine = get_engine()
    last_error: Exception | None = None
    
    for attempt in range(max_retries):
        try:
            async with AsyncSession(engine, expire_on_commit=False) as session:
                # 验证连接有效
                await session.execute(text("SELECT 1"))
                yield session
                return
        except Exception as e:
            last_error = e
            logger.warning(f"Database connection attempt {attempt + 1}/{max_retries} failed: {e}")
            if attempt < max_retries - 1:
                await asyncio.sleep(retry_delay * (attempt + 1))  # 指数退避
    
    # 所有重试都失败
    logger.error(f"Database connection failed after {max_retries} attempts")
    raise last_error


async def init_database():
    """
    初始化数据库（创建表结构等）
    
    在应用启动时调用一次。
    """
    engine = get_engine()
    async with engine.begin() as conn:
        # 创建数据库（如果不存在）- 连接时已指定数据库，这里检查表即可
        logger.info("Database connection established successfully")


async def health_check() -> bool:
    """检查数据库连接健康状态"""
    try:
        async with get_db_session(max_retries=1) as session:
            await session.execute(text("SELECT 1"))
            return True
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return False
