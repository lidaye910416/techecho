#!/bin/bash
# Docker 容器测试脚本 - 手动在终端运行
#
# 用法:
#   ./scripts/docker_test.sh          # 启动并测试
#   ./scripts/docker_test.sh --stop  # 停止容器

set -e

IMAGE_NAME="techecho:wxcloud"
CONTAINER_NAME="techecho-test"
PORT=8000

# 解析参数
if [ "$1" == "--stop" ]; then
    echo "🛑 停止容器..."
    docker stop $CONTAINER_NAME 2>/dev/null && echo "✅ 已停止" || echo "容器未运行"
    docker rm $CONTAINER_NAME 2>/dev/null && echo "✅ 已删除" || echo "容器未存在"
    exit 0
fi

echo "========================================"
echo "🧪 Docker 容器测试"
echo "========================================"

# 清理旧容器
echo "🧹 清理旧容器..."
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm $CONTAINER_NAME 2>/dev/null || true

# 启动容器（模拟云托管环境）
echo "🚀 启动容器..."
docker run -d \
  --name $CONTAINER_NAME \
  -p $PORT:8000 \
  -e PORT=8000 \
  -e MINIMAX_API_KEY=${MINIMAX_API_KEY:-sk-cp-tV4TuUIpZt64tdZO3kjFDIydJtrgaSDPDAXNo8zYk8CTHD39wz7vg1JN7_Dqd8LpevwJo-ZozDcpRo1REhX3PaCak4A8M-Rl8MXAEMvGbMoNOSi73B27yoM} \
  -v $(pwd)/app/data:/app/data \
  $IMAGE_NAME

echo "⏳ 等待服务启动..."
sleep 3

# 检查容器状态
if docker ps | grep -q $CONTAINER_NAME; then
    echo "✅ 容器运行中"
else
    echo "❌ 容器启动失败"
    docker logs $CONTAINER_NAME
    exit 1
fi

# 测试 API
echo ""
echo "=== 测试 API ==="
echo -n "健康检查: "
curl -s http://localhost:$PORT/health
echo ""

echo -n "新闻API: "
curl -s "http://localhost:$PORT/api/news?limit=3" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'返回 {len(d.get(\"data\",[]))} 条新闻')"

echo ""
echo "========================================"
echo "✅ 测试完成"
echo "========================================"
echo ""
echo "📋 手动测试命令:"
echo "   进入容器: docker exec -it $CONTAINER_NAME bash"
echo "   新闻收集: docker exec $CONTAINER_NAME python3 scripts/collect_news.py --limit 5"
echo "   查看日志: docker logs $CONTAINER_NAME"
echo "   停止: ./scripts/docker_test.sh --stop"
