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

from fastapi import APIRouter, HTTPException, Query, Body
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
import sys
import os
import logging

# Add src to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

logger = logging.getLogger(__name__)

from src.services.news import (
    get_news_from_db,
    get_news_stats,
    get_news_by_id,
    mark_as_read as db_mark_as_read,
    get_news_cloud_file_id,
)
from src.services.news_collect_service import (
    trigger_collect_task,
    get_task_status,
    get_current_task,
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
    news = await get_news_from_db(
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
        news = await get_news_from_db(
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
    stats = await get_news_stats()
    news = await get_news_from_db(limit=1000)

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
    stats = await get_news_stats()
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

    stats = await get_news_stats()
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
    item = await get_news_by_id(news_id)

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
    朗读新闻 - 返回音频 URL

    优先级：
    1. 微信云存储 cloud_file_id → 获取临时下载 URL
    2. MiniMax OSS URL (backup_audio_url) → 直接返回
    3. 容器内本地文件 → 返回文件流
    """
    from src.services.news import get_news_cloud_file_id, get_backup_audio_url, get_news_audio_url
    from src.services.wechat_token import get_access_token
    import httpx

    # 1. 尝试从云存储获取临时 URL
    cloud_file_id = await get_news_cloud_file_id(news_id)
    if cloud_file_id and cloud_file_id.startswith('cloud://'):
        access_token = await get_access_token()
        if access_token:
            try:
                # 从 fileID 提取路径
                env = cloud_file_id.split('://')[1].split('/')[0]
                path = cloud_file_id.replace(f'cloud://{env}/', '')

                # 调用微信云存储 API 获取临时 URL
                url = f"https://api.weixin.qq.com/tcb/batchdownloadfile?access_token={access_token}"
                data = {
                    "env": env,
                    "file_list": [{"fileid": cloud_file_id, "max_age": 3600}]
                }

                async with httpx.AsyncClient(verify=False, timeout=30.0) as client:
                    response = await client.post(url, json=data)
                    result = response.json()

                if result.get("errcode") == 0 and result.get("file_list"):
                    file_info = result["file_list"][0]
                    if file_info.get("status") == 0:
                        temp_url = file_info.get("download_url")
                        logger.info(f"[Read] Cloud URL for {news_id[:24]}: {temp_url[:60]}...")
                        return {"success": True, "audio_url": temp_url, "source": "cloud"}

            except Exception as e:
                logger.warning(f"[Read] Cloud storage error: {e}")

    # 2. Fallback: 使用 MiniMax OSS URL
    backup_url = await get_backup_audio_url(news_id)
    if backup_url:
        logger.info(f"[Read] Using backup URL for {news_id[:24]}")
        return {"success": True, "audio_url": backup_url, "source": "backup"}

    # 3. Fallback: 容器内本地文件
    audio_url = await get_news_audio_url(news_id)
    if audio_url and audio_url.startswith('/data/audio/'):
        from pathlib import Path
        project_root = Path(__file__).parent.parent.parent
        audio_file = project_root / audio_url.lstrip('/')

        if audio_file.exists():
            from fastapi.responses import StreamingResponse
            logger.info(f"[Read] Using local file for {news_id[:24]}")
            return StreamingResponse(
                open(audio_file, 'rb'),
                media_type="audio/mpeg",
                headers={
                    "Accept-Ranges": "bytes",
                    "Content-Disposition": f"inline; filename={audio_file.name}"
                }
            )

    return {"success": False, "message": "No audio available"}


# ============ 云存储音频接口 ============

@router.put("/{news_id}/cloud-file")
async def update_cloud_file_id(news_id: str, cloud_file_id: str = Query(..., description="云存储 fileID")):
    """
    更新新闻的云存储 fileID
    用于前端上传音频到云存储后，回调更新数据库
    """
    from src.services.news import save_news_cloud_file_id

    success = await save_news_cloud_file_id(news_id, cloud_file_id)
    if success:
        return {'success': True, 'message': 'Cloud file ID updated', 'news_id': news_id, 'cloud_file_id': cloud_file_id}
    else:
        return {'success': False, 'message': 'News not found'}


@router.get("/{news_id}/cloud-file")
async def get_cloud_file_id(news_id: str):
    """
    获取新闻的云存储 fileID
    """
    cloud_file_id = get_news_cloud_file_id(news_id)
    if cloud_file_id:
        return {'success': True, 'news_id': news_id, 'cloud_file_id': cloud_file_id}
    else:
        return {'success': False, 'message': 'No cloud file ID'}


# ============ TTS 测试接口 ============

@router.post("/tts-test")
async def test_tts_pipeline(
    news_id: str = Query(None, description="新闻ID，不指定则取最新一条"),
):
    """
    TTS 完整流程测试接口

    测试并返回：
    1. MiniMax TTS API 调用结果
    2. 微信云存储上传结果
    3. 数据库保存结果

    直接调用此接口即可看到所有步骤的成功/失败状态，无需查看日志。
    """
    import httpx
    from src.services.minimax_client import get_minimax_client
    from src.services.news import get_news_by_id, save_news_audio_urls, get_news_cloud_file_id
    from src.services.wechat_token import get_access_token
    from src.config.settings import WECHAT_CLOUD_ENV
    import tempfile
    from pathlib import Path

    result = {
        "success": False,
        "steps": {},
        "final_status": {},
    }

    # 1. 获取测试用的新闻
    if news_id:
        news = await get_news_by_id(news_id)
    else:
        from src.services.news import get_news_from_db
        news_list = await get_news_from_db(limit=1)
        news = news_list[0] if news_list else None

    if not news:
        result["error"] = "No news found for testing"
        return result

    result["steps"]["1_fetch_news"] = {
        "success": True,
        "news_id": news.get("id", "")[:24],
        "title": (news.get("title_zh") or news.get("title_en", ""))[:50],
    }

    # 2. 调用 MiniMax TTS API
    try:
        title = news.get('title_zh') or news.get('title_en', '')
        content = news.get('content_zh') or news.get('content_en', '')
        text = f"{title}。{content}"[:300]

        client = get_minimax_client()
        tts_result = await client.text_to_speech(
            text=text,
            voice_id="female-yujie",
            speed=1.15
        )

        minimax_url = tts_result.get("data", {}).get("audio_url", "")
        if minimax_url:
            result["steps"]["2_minimax_tts"] = {
                "success": True,
                "audio_url": minimax_url[:80] + "..." if len(minimax_url) > 80 else minimax_url,
            }
        else:
            result["steps"]["2_minimax_tts"] = {
                "success": False,
                "error": "Empty audio_url from MiniMax",
                "raw_result": str(tts_result)[:200],
            }
            result["error"] = "MiniMax TTS failed"
            return result

    except Exception as e:
        result["steps"]["2_minimax_tts"] = {
            "success": False,
            "error": str(e),
        }
        result["error"] = f"MiniMax TTS error: {e}"
        return result

    # 3. 下载音频到临时文件
    try:
        async with httpx.AsyncClient(timeout=60.0, verify=False) as http_client:
            response = await http_client.get(minimax_url, timeout=60.0)
            if response.status_code != 200:
                raise Exception(f"Download failed: HTTP {response.status_code}")
            audio_content = response.content

        result["steps"]["3_download_audio"] = {
            "success": True,
            "size_bytes": len(audio_content),
        }
    except Exception as e:
        result["steps"]["3_download_audio"] = {
            "success": False,
            "error": str(e),
        }
        result["error"] = f"Download error: {e}"
        return result

    # 4. 上传到微信云存储 - 直接测试多种格式并返回详细结果
    import requests

    access_token = await get_access_token()
    if not access_token:
        result["steps"]["4_wechat_upload"] = {
            "success": False,
            "error": "Cannot get access_token",
        }
        result["final_status"] = {
            "audio_url": minimax_url,
            "cloud_file_id": None,
            "backup_audio_url": minimax_url,
        }
        result["success"] = False
        result["warning"] = "No access_token"
        return result

    cloud_path = f"audio/{news.get('id')}.mp3"
    file_name = cloud_path.split("/")[-1]
    upload_url = f"https://api.weixin.qq.com/tcb/uploadfile?access_token={access_token}"

    # 尝试不同的 env 值
    env_options = [
        WECHAT_CLOUD_ENV,  # 环境 ID: prod-d9g7e5osy7b5e7a9c
        "7072-prod-d9g7e5osy7b5e7a9c-1433977056",  # 存储桶 ID
    ]

    # 调试信息
    result["debug"] = {
        "access_token_prefix": access_token[:20] + "...",
        "access_token_length": len(access_token),
        "wechat_cloud_env": WECHAT_CLOUD_ENV,
        "env_options_tested": env_options,
        "upload_url": upload_url[:60] + "...",
    }

    cloud_file_id = None
    success_format = None

    # 测试不同 env 值和格式组合
    for env_val in env_options:
        # 格式1: files 包含所有字段
        files_v1 = {
            "file": (file_name, audio_content, "audio/mpeg"),
            "env": (None, env_val),
            "path": (None, cloud_path),
        }
        resp = requests.post(upload_url, files=files_v1, timeout=60, verify=False)
        res = resp.json()
        if res.get("errcode") == 0:
            cloud_file_id = f"cloud://{env_val}/{cloud_path}"
            success_format = f"files_all+env={env_val[:20]}..."
            break

        # 格式2: data + files 分离
        data_v2 = {"env": env_val, "path": cloud_path}
        files_v2 = {"file": (file_name, audio_content, "audio/mpeg")}
        resp = requests.post(upload_url, data=data_v2, files=files_v2, timeout=60, verify=False)
        res = resp.json()
        if res.get("errcode") == 0:
            cloud_file_id = f"cloud://{env_val}/{cloud_path}"
            success_format = f"data_files+env={env_val[:20]}..."
            break

        # 格式3: 没有 filename
        files_v3 = {
            "file": (None, audio_content, "audio/mpeg"),
            "env": (None, env_val),
            "path": (None, cloud_path),
        }
        resp = requests.post(upload_url, files=files_v3, timeout=60, verify=False)
        res = resp.json()
        if res.get("errcode") == 0:
            cloud_file_id = f"cloud://{env_val}/{cloud_path}"
            success_format = f"no_filename+env={env_val[:20]}..."
            break

        # 格式4: env 作为字符串值
        files_v4 = {
            "file": (file_name, audio_content, "audio/mpeg"),
            "env": env_val,
            "path": cloud_path,
        }
        resp = requests.post(upload_url, files=files_v4, timeout=60, verify=False)
        res = resp.json()
        if res.get("errcode") == 0:
            cloud_file_id = f"cloud://{env_val}/{cloud_path}"
            success_format = f"string_values+env={env_val[:20]}..."
            break

    if cloud_file_id:
        result["steps"]["4_wechat_upload"] = {
            "success": True,
            "cloud_file_id": cloud_file_id,
            "format": success_format,
        }
    else:
        result["steps"]["4_wechat_upload"] = {
            "success": False,
            "note": "All env/format combinations failed",
            "wechat_cloud_env_used": WECHAT_CLOUD_ENV,
            "tried_envs": env_options,
        }

    # 5. 保存到数据库
    if cloud_file_id:
        db_audio_url = cloud_file_id
    else:
        db_audio_url = minimax_url

    try:
        save_ok = await save_news_audio_urls(
            news_id=news.get('id'),
            audio_url=db_audio_url,
            backup_audio_url=minimax_url,
            cloud_file_id=cloud_file_id
        )

        # 验证保存结果
        saved_cloud_id = await get_news_cloud_file_id(news.get('id'))

        result["steps"]["5_save_to_db"] = {
            "success": save_ok,
            "saved_cloud_file_id": saved_cloud_id,
            "expected_cloud_file_id": cloud_file_id,
            "db_save_matches": saved_cloud_id == cloud_file_id,
        }

        result["final_status"] = {
            "audio_url": db_audio_url,
            "cloud_file_id": saved_cloud_id,
            "backup_audio_url": minimax_url,
        }

    except Exception as e:
        result["steps"]["5_save_to_db"] = {
            "success": False,
            "error": str(e),
        }
        result["error"] = f"Database save error: {e}"
        return result

    # 汇总
    all_steps_ok = all(
        step.get("success", False)
        for step in result["steps"].values()
    )
    result["success"] = all_steps_ok

    if all_steps_ok:
        result["summary"] = "✅ 全部成功"
    else:
        failed_steps = [k for k, v in result["steps"].items() if not v.get("success", False)]
        result["summary"] = f"❌ 失败步骤: {', '.join(failed_steps)}"

    return result


# ============ 通用云存储接口 ============
# 用于前端从微信云存储下载音频文件

@router.post("/cloud-url")
async def get_cloud_temp_url(cloud_file_id: str = Body(..., description="微信云存储 fileID")):
    """
    根据 cloud_file_id 获取临时访问 URL

    用于前端从微信云存储下载音频文件
    """
    from src.services.wechat_token import get_access_token
    import httpx

    if not cloud_file_id or not cloud_file_id.startswith('cloud://'):
        raise HTTPException(status_code=400, detail="Invalid cloud_file_id format")

    access_token = await get_access_token()
    if not access_token:
        raise HTTPException(status_code=500, detail="Cannot get access_token")

    try:
        # 从 fileID 提取 env 和 path
        env = cloud_file_id.split('://')[1].split('/')[0]

        # 调用微信云存储 API 获取临时 URL
        url = f"https://api.weixin.qq.com/tcb/batchdownloadfile?access_token={access_token}"
        data = {
            "env": env,
            "file_list": [{"fileid": cloud_file_id, "max_age": 3600}]
        }

        async with httpx.AsyncClient(verify=False, timeout=30.0) as client:
            response = await client.post(url, json=data)
            result = response.json()

        if result.get("errcode") == 0 and result.get("file_list"):
            file_info = result["file_list"][0]
            if file_info.get("status") == 0:
                temp_url = file_info.get("download_url")
                logger.info(f"[Cloud] Got temp URL for {cloud_file_id[:40]}...")
                return {"success": True, "temp_url": temp_url, "source": "cloud"}
            else:
                logger.error(f"[Cloud] Get URL status error: {file_info}")
                raise HTTPException(status_code=404, detail="File not found in cloud storage")
        else:
            logger.error(f"[Cloud] Get URL error: {result}")
            raise HTTPException(status_code=500, detail="Failed to get temp URL")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Cloud] Get temp URL error: {e}")
        raise HTTPException(status_code=500, detail=f"Cloud storage error: {str(e)}")
