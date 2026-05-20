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

# ============ 微信小程序配置 ============
WECHAT_APPID = os.getenv('WECHAT_APPID', '')
WECHAT_SECRET = os.getenv('WECHAT_SECRET', '')

# ============ 微信云托管对象存储配置 ============
# 存储桶 ID: 7072-prod-d9g7e5osy7b5e7a9c-1433977056
# 环境 ID: prod-d9g7e5osy7b5e7a9c
WECHAT_CLOUD_ENV = os.getenv('WECHAT_CLOUD_ENV', 'prod-d9g7e5osy7b5e7a9c')

# 微信 access_token（需要通过 WECHAT_APPID + WECHAT_SECRET 获取）
WECHAT_ACCESS_TOKEN = os.getenv('WECHAT_ACCESS_TOKEN', '')

# 注意：目录创建由启动脚本或 Dockerfile 负责
# 这里只定义路径，不自动创建
