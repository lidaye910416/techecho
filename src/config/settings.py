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

# 数据目录配置 (仅在容器环境使用，本地测试可忽略)
DATA_DIR = os.getenv('DATA_DIR', '/app/data')

# 数据库路径
DB_PATH = os.path.join(DATA_DIR, 'database.db')

# 音频目录
AUDIO_DIR = os.path.join(DATA_DIR, 'audio')

# 不再自动创建目录，避免本地环境报错
# 目录创建由启动脚本或 Dockerfile 负责

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

# ============ MySQL 数据库配置 (微信云托管) ============
# 使用微信云托管内置 MySQL，容器重新部署后数据持久化
#
# 内网地址(生产): 10.37.107.121:3306 (需在微信云托管环境内访问)
# 公网地址(开发测试): sh-cynosdbmysql-grp-0w2n1paw.sql.tencentcdb.com:22718
#
# 部署时通过环境变量 MYSQL_HOST 指定，生产用内网地址

MYSQL_HOST = os.getenv('MYSQL_HOST', '')
MYSQL_PORT = int(os.getenv('MYSQL_PORT', 3306))
MYSQL_USER = os.getenv('MYSQL_USER', '')
MYSQL_PASSWORD = os.getenv('MYSQL_PASSWORD', '')
MYSQL_DATABASE = os.getenv('MYSQL_DATABASE', 'techecho')

# 注意：目录创建由启动脚本或 Dockerfile 负责
# 这里只定义路径，不自动创建
