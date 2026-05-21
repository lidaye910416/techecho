from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from src.api.routes import router as api_router
import os
import logging
from pathlib import Path

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 自动加载 .env 文件（仅用于本地开发，云托管环境变量由容器注入）
from dotenv import load_dotenv
env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    load_dotenv(env_path, override=False)  # 不覆盖已有的环境变量

app = FastAPI(title="Tech Echo - 科技资讯播报", version="0.3.2")

# 启动时打印环境变量调试信息
print(f"[TechEcho] PYTHONPATH: {os.getenv('PYTHONPATH', 'not set')}")
print(f"[TechEcho] DATA_DIR: {os.getenv('DATA_DIR', 'not set')}")
print(f"[TechEcho] MINIMAX_API_KEY: {'***' if os.getenv('MINIMAX_API_KEY') else 'NOT SET'}")
print(f"[TechEcho] WECHAT_APPID: {'***' if os.getenv('WECHAT_APPID') else 'NOT SET'}")
print(f"[TechEcho] WECHAT_CLOUD_ENV: {os.getenv('WECHAT_CLOUD_ENV', 'not set')}")
print(f"[TechEcho] MYSQL_HOST: {os.getenv('MYSQL_HOST', 'NOT SET')}")
print(f"[TechEcho] MYSQL_PORT: {os.getenv('MYSQL_PORT', 'NOT SET')}")
print(f"[TechEcho] MYSQL_DATABASE: {os.getenv('MYSQL_DATABASE', 'NOT SET')}")
print(f"[TechEcho] MYSQL_USER: {os.getenv('MYSQL_USER', 'NOT SET')}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    # 启动定时调度器（每日 08:30 自动采集新闻到数据库）
    try:
        from src.services.scheduler_service import start_scheduler
        start_scheduler()
    except ImportError:
        pass  # APScheduler 未安装

@app.on_event("shutdown")
async def shutdown_event():
    try:
        from src.services.scheduler_service import stop_scheduler
        stop_scheduler()
    except:
        pass

# 注册 API 路由
app.include_router(api_router)

# 挂载静态文件目录 (用于头像图片等非音频资源)
# 注意：音频文件已迁移到微信云托管对象存储，不再存储在容器内
data_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
if os.path.exists(data_dir):
    app.mount("/data", StaticFiles(directory=data_dir), name="data")
    print(f"[TechEcho] Static files mounted: {data_dir}")
else:
    os.makedirs(data_dir, exist_ok=True)
    app.mount("/data", StaticFiles(directory=data_dir), name="data")
    print(f"[TechEcho] Static files mounted (created): {data_dir}")

@app.get("/")
async def root():
    return {
        "name": "Tech Echo API",
        "version": "0.3.2",
        "description": "科技资讯播报平台 API"
    }

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.get("/api/status")
async def get_status():
    """获取服务状态"""
    from src.services.tts.tts_service import get_wechat_cloud_storage

    cloud_storage = get_wechat_cloud_storage()

    return {
        "status": "healthy",
        "version": "0.3.2",
        "wechat_cloud_storage": {
            "available": cloud_storage is not None,
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8000)))
