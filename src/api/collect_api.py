"""
新闻收集 API 接口

POST /api/news/collect - 触发新闻收集（异步）
GET /api/news/collect/status - 查询收集任务状态
"""

from fastapi import APIRouter, BackgroundTasks, Query
from pydantic import BaseModel
from typing import Optional, Dict, Any
import asyncio

from src.services.news_collect_service import (
    trigger_collect_task,
    get_task_status,
    get_current_task,
    collect_news_async,
)

router = APIRouter(prefix="/news", tags=["news-collect"])


class CollectRequest(BaseModel):
    """收集请求参数"""
    category: Optional[str] = None
    lang: Optional[str] = None
    limit: Optional[int] = None
    min_quality: Optional[int] = 55


class CollectResponse(BaseModel):
    """收集响应"""
    success: bool
    message: str
    task_id: str


class TaskStatusResponse(BaseModel):
    """任务状态响应"""
    status: str  # idle/running/completed/failed
    current_task_id: Optional[str] = None
    task_id: Optional[str] = None
    task_status: Optional[Dict[str, Any]] = None


@router.post("/collect", response_model=CollectResponse)
async def collect_news(
    background_tasks: BackgroundTasks,
    category: Optional[str] = None,
    lang: Optional[str] = None,
    limit: Optional[int] = None,
    min_quality: int = Query(default=55, ge=0, le=100)
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
    # 触发收集
    curl -X POST "http://localhost:8000/api/news/collect?limit=5"
    
    # 带参数
    curl -X POST "http://localhost:8000/api/news/collect?category=ai&limit=10"
    ```
    """
    # 启动后台任务
    task_id = await trigger_collect_task(
        category=category,
        lang=lang,
        limit=limit,
        min_quality=min_quality
    )
    
    return CollectResponse(
        success=True,
        message="新闻收集任务已启动，请在 /api/news/collect/status 查看进度",
        task_id=task_id
    )


@router.get("/collect/status", response_model=TaskStatusResponse)
async def get_collect_status(task_id: Optional[str] = None):
    """
    查询收集任务状态
    
    如果不指定 task_id，返回当前任务状态
    """
    if task_id:
        # 查询指定任务
        task_status = get_task_status(task_id)
        if task_status:
            return TaskStatusResponse(
                status="running" if task_status.status == "running" else "idle",
                task_id=task_id,
                task_status={
                    "task_id": task_status.task_id,
                    "status": task_status.status,
                    "raw_count": task_status.raw_count,
                    "filtered_count": task_status.filtered_count,
                    "saved_count": task_status.saved_count,
                    "tts_stats": task_status.tts_stats,
                    "error": task_status.error,
                    "started_at": task_status.started_at,
                    "completed_at": task_status.completed_at,
                }
            )
        else:
            return TaskStatusResponse(
                status="not_found",
                task_id=task_id
            )
    else:
        # 返回当前任务状态
        current = get_current_task()
        if current:
            task_id, task_status = current
            return TaskStatusResponse(
                status="running",
                current_task_id=task_id,
                task_id=task_id,
                task_status={
                    "task_id": task_status.task_id,
                    "status": task_status.status,
                    "raw_count": task_status.raw_count,
                    "filtered_count": task_status.filtered_count,
                    "saved_count": task_status.saved_count,
                    "started_at": task_status.started_at,
                }
            )
        else:
            return TaskStatusResponse(
                status="idle"
            )


# 兼容旧接口 - 如果 /api/news/collect 已存在，保留原有逻辑
@router.post("/collect-legacy")
async def collect_news_legacy():
    """保留旧接口，返回提示信息"""
    return {
        "success": True,
        "message": "请使用 POST /api/news/collect 接口触发收集任务",
        "new_endpoint": "/api/news/collect"
    }
