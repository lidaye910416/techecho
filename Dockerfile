# TechEcho Pro - 微信云托管镜像
# https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloudrun/src/basic/overview.html

FROM python:3.11-slim

WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖文件
COPY requirements.txt .

# 安装 Python 依赖
RUN pip install --no-cache-dir -r requirements.txt

# 复制代码（排除不需要的）
COPY . .

# 创建必要目录
RUN mkdir -p /app/logs /app/data/audio

# 暴露端口（容器内监听端口）
EXPOSE 8000

# 设置 Python 模块搜索路径
ENV PYTHONPATH=/app

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# 启动命令
# 云托管会自动注入 PORT 环境变量
WORKDIR /app
CMD ["sh", "-c", "uvicorn src.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
