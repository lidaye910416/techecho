"""
TechEcho Pro - 新闻 API 端点

提供新闻相关的 API 接口 - 从数据库读取新闻数据
"""

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
from typing import Optional, List
from datetime import datetime, timedelta
import sys
import os

# Add src to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from src.services.news import (
    get_news_from_db,
    get_news_stats,
    get_news_by_id,
    mark_as_read as db_mark_as_read
)

router = APIRouter(prefix="/news", tags=["news"])

@router.get("")
async def get_news_list(
    lang: Optional[str] = Query(None, description="语言筛选: zh, en, both"),
    category: Optional[str] = Query(None, description="分类筛选"),
    date: Optional[str] = Query(None, description="日期筛选: YYYY-MM-DD"),
    min_quality: Optional[int] = Query(55, description="最低质量分"),
    limit: Optional[int] = Query(None, description="限制数量")
):
    """获取新闻列表

    特殊逻辑: 如果请求今天但没有今天的新闻，自动返回昨天的新闻
    (因为新闻通常在当天上午收集，但内容是昨天的)
    """
    news = get_news_from_db(
        lang=lang,
        category=category,
        date=date,
        min_quality=min_quality,
        limit=limit
    )

    today = datetime.now().strftime('%Y-%m-%d')
    yesterday = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')

    # 如果请求今天但没有今天的新闻，返回昨天的
    if date == today and not news:
        news = get_news_from_db(
            lang=lang,
            category=category,
            date=yesterday,
            min_quality=min_quality,
            limit=limit
        )

    return {
        'success': True,
        'data': news,
        'total': len(news)
    }

@router.get("/dates")
async def get_available_dates():
    """获取有新闻的日期列表"""
    stats = get_news_stats()
    news = get_news_from_db(limit=1000)

    dates = set()
    today = datetime.now().strftime('%Y-%m-%d')
    yesterday = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')

    for item in news:
        published_at = item.get('published_at', '')
        if published_at:
            date_str = published_at.split(' ')[0] if ' ' in published_at else published_at[:10]
            if len(date_str) == 10:
                dates.add(date_str)

    # 如果最新新闻是昨天但没有今天的新闻, 添加"今天"选项
    if dates and yesterday in dates and today not in dates:
        dates.add(today)

    return {
        'success': True,
        'data': sorted(list(dates), reverse=True)
    }

@router.get("/stats")
async def get_stats():
    """获取新闻统计"""
    stats = get_news_stats()
    return {
        'success': True,
        'data': {
            'lastUpdate': stats.get('lastUpdate'),
            'totalCount': stats.get('totalCount', 0),
            'stats': stats.get('stats', {'A+': 0, 'A': 0, 'B': 0, 'C': 0, 'D': 0}),
            'categories': stats.get('categories', [])
        }
    }

@router.get("/categories")
async def get_categories():
    """获取资讯分类"""
    CATEGORY_MAP = {
        'ai': {'name': 'AI', 'emoji': '🤖'},
        'tools': {'name': '工具', 'emoji': '🔧'},
        'news': {'name': '动态', 'emoji': '📰'},
        'product': {'name': '产品', 'emoji': '💡'}
    }

    stats = get_news_stats()
    result = []
    for cat in stats.get('categories', []):
        info = CATEGORY_MAP.get(cat, {'name': cat, 'emoji': '📰'})
        result.append({
            'id': cat,
            'name': info['name'],
            'emoji': info['emoji']
        })

    return {
        'success': True,
        'data': result
    }

@router.get("/{news_id}")
async def get_news_detail(news_id: str):
    """获取新闻详情"""
    item = get_news_by_id(news_id)

    if not item:
        raise HTTPException(status_code=404, detail="News not found")

    return {
        'success': True,
        'data': item
    }

@router.post("/collect")
async def trigger_collect(
    category: Optional[str] = None,
    lang: Optional[str] = None,
    limit: Optional[int] = None,
    min_quality: int = Query(default=55, ge=0, le=100)
):
    """触发新闻收集任务（异步后台执行）"""
    from src.services.news_collect_service import trigger_collect_task

    task_id = await trigger_collect_task(
        category=category,
        lang=lang,
        limit=limit,
        min_quality=min_quality
    )

    return {
        'success': True,
        'message': '新闻收集任务已启动，请在 /api/news/collect/status 查看进度',
        'task_id': task_id
    }

@router.post("/{news_id}/read")
async def read_news_aloud(
    news_id: str,
    voice_id: str = Query("female-tianmei")
):
    """朗读新闻 - 预留接口"""
    return {
        'success': True,
        'message': 'TTS 功能预留',
        'data': {
            'news_id': news_id,
            'audio_url': None,
            'voice_id': voice_id
        }
    }

@router.put("/{news_id}/read")
async def mark_as_read(news_id: str):
    """标记新闻为已读"""
    success = db_mark_as_read(news_id)
    return {"success": success, "message": "Marked as read" if success else "News not found"}
