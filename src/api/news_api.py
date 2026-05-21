"""
TechEcho Pro - 新闻 API 端点

提供新闻相关的 API 接口：
- GET /api/news - 获取新闻列表
- GET /api/news/stats - 获取新闻统计
- GET /api/news/dates - 获取可用日期
- GET /api/news/categories - 获取分类列表
- GET /api/news/{id} - 获取新闻详情
- POST /api/news/collect - 触发新闻收集（异步后台）
- GET /api/news/collect/status - 查询收集任务状态
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
import sys
import os

# Add src to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from src.services.news import (
    _get_news_from_db,
    _get_news_stats,
    _get_news_by_id,
    _mark_as_read,
    _get_news_cloud_file_id,
)
from src.services.news_collect_service import (
    trigger_collect_task,
    get_task_status,
    get_current_task,
)
from src.services.news.news_database import (
    save_news_cloud_file_id,
)

router = APIRouter(prefix="/news", tags=["news"])

# ============ 新闻查询接口 ============

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
    news = await _get_news_from_db(
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
        news = await _get_news_from_db(
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
    stats = await _get_news_stats()
    news = await _get_news_from_db(limit=1000)

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
    stats = await _get_news_stats()
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

    stats = await _get_news_stats()
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
    item = await _get_news_by_id(news_id)

    if not item:
        raise HTTPException(status_code=404, detail="News not found")

    return {
        'success': True,
        'data': item
    }

# ============ 新闻收集接口 ============

@router.post("/collect")
async def trigger_collect(
    category: Optional[str] = Query(None, description="新闻分类: ai/tools/news/product"),
    lang: Optional[str] = Query(None, description="语言: zh/en"),
    limit: Optional[int] = Query(None, description="限制最终保存数量"),
    min_quality: int = Query(default=55, ge=0, le=100, description="最低质量分数"),
    source_limit: Optional[int] = Query(default=None, ge=1, le=50, description="每个RSS源最多抓取条数")
):
    """
    触发新闻收集任务（异步后台执行）
    
    收集流程：
    1. 从 RSS 源收集新闻
    2. AI 质量评分和校准
    3. 保存到数据库
    4. TTS 语音预生成
    
    使用 curl 测试：
    ```bash
    # 基础触发（每个源最多10条）
    curl -X POST "http://localhost:8000/api/news/collect?source_limit=10"
    
    # 快速测试
    curl -X POST "http://localhost:8000/api/news/collect?source_limit=2&limit=5"
    
    # 完整参数
    curl -X POST "http://localhost:8000/api/news/collect?category=ai&lang=zh&source_limit=5&limit=20&min_quality=55"
    ```
    
    查询任务状态：
    ```bash
    curl "http://localhost:8000/api/news/collect/status"
    ```
    """
    task_id = await trigger_collect_task(
        category=category,
        lang=lang,
        limit=limit,
        min_quality=min_quality,
        source_limit=source_limit
    )

    return {
        'success': True,
        'message': '新闻收集任务已启动，请在 /api/news/collect/status 查看进度',
        'task_id': task_id
    }

@router.get("/collect/status")
async def get_collect_status(task_id: Optional[str] = Query(None, description="任务ID")):
    """
    查询收集任务状态
    
    如果不指定 task_id，返回当前任务状态
    """
    if task_id:
        task_status = get_task_status(task_id)
        if task_status:
            return {
                'status': task_status.status,
                'task_id': task_id,
                'raw_count': task_status.raw_count,
                'filtered_count': task_status.filtered_count,
                'saved_count': task_status.saved_count,
                'tts_stats': task_status.tts_stats,
                'error': task_status.error,
                'started_at': task_status.started_at,
                'completed_at': task_status.completed_at,
            }
        else:
            return {'status': 'not_found', 'task_id': task_id}
    else:
        current = get_current_task()
        if current:
            task_id, task_status = current
            return {
                'status': 'running',
                'current_task_id': task_id,
                'task_id': task_id,
                'raw_count': task_status.raw_count,
                'filtered_count': task_status.filtered_count,
                'saved_count': task_status.saved_count,
                'started_at': task_status.started_at,
            }
        else:
            return {'status': 'idle'}

# ============ 预留接口 ============

@router.put("/{news_id}/read")
async def read_news_aloud(news_id: str):
    """
    朗读新闻 - 返回音频流
    前端直接用 ctx.src = "/api/news/{id}/read" 播放
    """
    from pathlib import Path
    from src.services.news import get_news_audio_url

    # 获取预存的音频路径
    audio_url = await _get_news_audio_url(news_id)
    if not audio_url:
        return {'success': False, 'message': 'No audio available'}

    # 解析音频文件路径 - 使用项目根目录作为基准
    if audio_url.startswith('/data/audio/'):
        # 获取项目根目录 (src/api/../.. = 项目根目录)
        project_root = Path(__file__).parent.parent.parent
        audio_file = project_root / audio_url.lstrip('/')

        if audio_file.exists():
            from fastapi.responses import StreamingResponse
            return StreamingResponse(
                open(audio_file, 'rb'),
                media_type="audio/mpeg",
                headers={
                    "Accept-Ranges": "bytes",
                    "Content-Disposition": f"inline; filename={audio_file.name}"
                }
            )

    return {'success': False, 'message': 'Audio file not found'}


# ============ 云存储音频接口 ============

@router.put("/{news_id}/cloud-file")
async def update_cloud_file_id(news_id: str, cloud_file_id: str = Query(..., description="云存储 fileID")):
    """
    更新新闻的云存储 fileID
    用于前端上传音频到云存储后，回调更新数据库
    """
    from src.services.news import save_news_cloud_file_id

    success = save_news_cloud_file_id(news_id, cloud_file_id)
    if success:
        return {'success': True, 'message': 'Cloud file ID updated', 'news_id': news_id, 'cloud_file_id': cloud_file_id}
    else:
        return {'success': False, 'message': 'News not found'}


@router.get("/{news_id}/cloud-file")
async def get_cloud_file_id(news_id: str):
    """
    获取新闻的云存储 fileID 和临时访问链接

    前端可以通过返回的 temp_url 直接访问音频文件，
    或者使用 cloud_file_id 通过 wx.cloud.downloadFile 下载。
    """
    cloud_file_id = await _get_news_cloud_file_id(news_id)
    if not cloud_file_id:
        return {'success': False, 'message': 'No cloud file ID'}

    result = {
        'success': True,
        'news_id': news_id,
        'cloud_file_id': cloud_file_id,
        'temp_url': None,
    }

    # 如果配置了云存储，尝试获取临时链接
    try:
        from src.services.tts.tts_service import get_wechat_cloud_storage

        cloud_storage = get_wechat_cloud_storage()
        if cloud_storage and cloud_file_id.startswith('cloud://'):
            temp_url = await cloud_storage.get_temp_file_url(cloud_file_id, max_age=3600)
            if temp_url:
                result['temp_url'] = temp_url
    except Exception as e:
        import logging
        logging.warning(f"[API] Failed to get temp URL: {e}")

    return result
