#!/bin/bash
# Docker 测试脚本
#   ./test-docker.sh          # 从 zip 包构建 + 测试（完整流程）
#   ./test-docker.sh --reuse   # 使用已有镜像测试
#   ./test-docker.sh --daemon  # 执行测试 + 保持运行，按 Ctrl+C 清理

set -e

ZIP_FILE="${ZIP_FILE:-techecho-backend.zip}"
IMAGE_NAME="techecho:wxcloud"
CONTAINER_NAME="techecho-test"
PORT=8090

# 解析参数
DAEMON_MODE=false
REUSE_IMAGE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --daemon) DAEMON_MODE=true; shift ;;
        --reuse)  REUSE_IMAGE=true; shift ;;
        *)        echo "未知参数: $1"; exit 1 ;;
    esac
done

cleanup() {
    echo ""
    echo "🧹 清理..."
    docker stop $CONTAINER_NAME 2>/dev/null && docker rm $CONTAINER_NAME 2>/dev/null || true
}

# 始终注册清理钩子（daemon 模式按 Ctrl+C 触发，普通模式脚本结束时触发）
trap cleanup EXIT

# ========== 1. 构建镜像 ==========
if [ "$REUSE_IMAGE" = false ]; then
    echo "========================================"
    echo "📦 从 zip 包构建镜像"
    echo "========================================"
    
    # 获取项目根目录（scripts 的父目录）
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
    
    # 解压到临时目录
    rm -rf /tmp/techecho-build && mkdir -p /tmp/techecho-build
    unzip -o "$PROJECT_ROOT/$ZIP_FILE" -d /tmp/techecho-build
    cd /tmp/techecho-build
    
    echo "🔨 构建镜像: $IMAGE_NAME"
    docker build -t $IMAGE_NAME .
    echo "✅ 镜像构建成功"
else
    echo "========================================"
    echo "♻️ 使用已有镜像: $IMAGE_NAME"
    echo "========================================"
fi

# ========== 2. 启动容器 ==========
echo ""
echo "========================================"
echo "🚀 启动容器"
echo "========================================"

docker stop $CONTAINER_NAME 2>/dev/null && docker rm $CONTAINER_NAME 2>/dev/null || true

docker run -d \
  --name $CONTAINER_NAME \
  -p $PORT:8000 \
  -e PORT=8000 \
  -e MINIMAX_API_KEY=${MINIMAX_API_KEY:-sk-cp-tV4TuUIpZt64tdZO3kjFDIydJtrgaSDPDAXNo8zYk8CTHD39wz7vg1JN7_Dqd8LpevwJo-ZozDcpRo1REhX3PaCak4A8M-Rl8MXAEMvGbMoNOSi73B27yoM} \
  $IMAGE_NAME

echo "⏳ 等待服务启动..."
sleep 3

# ========== 3. 执行测试 ==========
echo ""
echo "========================================"
echo "🧪 功能测试"
echo "========================================"

echo -n "  [1/4] /health: "
if curl -s http://localhost:$PORT/health | grep -q "healthy"; then
    echo "✅"
else
    echo "❌"
    exit 1
fi

echo -n "  [2/4] /api/news: "
if curl -s "http://localhost:$PORT/api/news?limit=1" | grep -q "success"; then
    echo "✅"
else
    echo "❌"
    exit 1
fi

echo -n "  [3/4] /api/news/collect: "
TASK_ID=$(curl -s -X POST "http://localhost:$PORT/api/news/collect?source_limit=2&limit=3" | grep -o '"task_id":"[^"]*"' | cut -d'"' -f4)
if [ -n "$TASK_ID" ]; then
    echo "✅ (task_id: ${TASK_ID:0:8}...)"
else
    echo "❌"
    exit 1
fi

echo "  [4/4] 等待收集任务完成..."
for i in {1..60}; do
    STATUS=$(curl -s "http://localhost:$PORT/api/news/collect/status?task_id=$TASK_ID" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ]; then
        echo "     任务状态: $STATUS"
        break
    fi
    echo "     等待中... ($i/60)"
    sleep 2
done

echo ""
echo "========================================"
echo "✅ 全部测试通过！"
echo "========================================"
echo ""
echo "📊 数据库验证:"
curl -s "http://localhost:$PORT/api/news?limit=10" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'   新闻数量: {len(d.get(\"data\",[]))} 条')"

# ========== 4. daemon 模式：保持运行 ==========
if [ "$DAEMON_MODE" = true ]; then
    echo ""
    echo "========================================"
    echo "📡 容器已启动，可继续观察日志"
    echo "========================================"
    echo ""
    echo "📡 API 地址: http://localhost:$PORT"
    echo "   新闻接口: http://localhost:$PORT/api/news"
    echo "   收集接口: POST http://localhost:$PORT/api/news/collect"
    echo ""
    echo "按 Ctrl+C 停止并清理容器"
    echo "---"
    docker logs -f $CONTAINER_NAME
fi
