"""
全局配置设置

支持环境变量覆盖:
- DATA_DIR: 数据目录路径（默认 /app/data）
- PORT: 服务端口（默认 8000）
- MINIMAX_API_KEY: MiniMax API 密钥
- MINIMAX_BASE_URL: MiniMax API 地址（可选）
"""

import os

# 数据目录配置
DATA_DIR = os.getenv('DATA_DIR', '/app/data')

# 数据库路径
DB_PATH = os.path.join(DATA_DIR, 'database.db')

# 音频目录
AUDIO_DIR = os.path.join(DATA_DIR, 'audio')

# 服务配置
PORT = int(os.getenv('PORT', 8000))

# MiniMax API 配置
MINIMAX_API_KEY = os.getenv('MINIMAX_API_KEY', '')
MINIMAX_BASE_URL = os.getenv('MINIMAX_BASE_URL', 'https://api.minimaxi.com')

# 注意：目录创建由启动脚本或 Dockerfile 负责
# 这里只定义路径，不自动创建
