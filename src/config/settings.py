"""
全局配置设置

支持环境变量覆盖:
- DATA_DIR: 数据目录路径（默认 /app/data）
- PORT: 服务端口（默认 8000）
- MINIMAX_API_KEY: MiniMax API 密钥
- MINIMAX_BASE_URL: MiniMax API 地址（可选）
"""

import os
from pathlib import Path

# 数据目录配置
DATA_DIR = os.getenv('DATA_DIR', '/app/data')

# 确保目录存在
Path(DATA_DIR).mkdir(parents=True, exist_ok=True)

# 数据库路径
DB_PATH = os.path.join(DATA_DIR, 'database.db')

# 音频目录
AUDIO_DIR = os.path.join(DATA_DIR, 'audio')

# 服务配置
PORT = int(os.getenv('PORT', 8000))

# MiniMax API 配置
MINIMAX_API_KEY = os.getenv('MINIMAX_API_KEY', '')
MINIMAX_BASE_URL = os.getenv('MINIMAX_BASE_URL', 'https://api.minimaxi.com')

# ============ 微信云存储配置 ============
# 用于后端将音频文件上传到微信云托管对象存储
# 获取方式：微信云托管控制台 -> 环境 -> 对象存储 -> 访问密钥
WECHAT_CLOUD_SECRET_ID = os.getenv('WECHAT_CLOUD_SECRET_ID', '')
WECHAT_CLOUD_SECRET_KEY = os.getenv('WECHAT_CLOUD_SECRET_KEY', '')
WECHAT_CLOUD_BUCKET = os.getenv('WECHAT_CLOUD_BUCKET', '')  # 如: techecho-audio-12345678
WECHAT_CLOUD_REGION = os.getenv('WECHAT_CLOUD_REGION', 'ap-shanghai')
WECHAT_CLOUD_ENV = os.getenv('WECHAT_CLOUD_ENV', '')  # 环境ID，如: test1-258814-7

# 云存储是否启用 (未配置凭证时降级为本地存储)
CLOUD_STORAGE_ENABLED = bool(WECHAT_CLOUD_SECRET_ID and WECHAT_CLOUD_SECRET_KEY and WECHAT_CLOUD_BUCKET)

# 注意：目录创建由启动脚本或 Dockerfile 负责
# 这里只定义路径，不自动创建
