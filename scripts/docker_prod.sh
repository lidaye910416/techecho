#!/bin/bash
# 模拟生产环境运行 - 启动 API + 定时收集
#
# 用法:
#   ./scripts/docker_prod.sh   # 启动并执行一次新闻收集
#   ./scripts/docker_prod.sh --daemon  # 只启动后台服务，不收集

IMAGE_NAME="techecho:wxcloud"
CONTAINER_NAME="techecho-prod"
PORT=8000

echo "========================================"
echo "🏭 模拟生产环境运行"
echo "========================================"

# 清理旧容器
echo "🧹 清理旧容器..."
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm $CONTAINER_NAME 2>/dev/null || true

# 启动容器（生产模式：挂载数据目录持久化）
echo "🚀 启动容器..."
docker run -d \
  --name $CONTAINER_NAME \
  -p $PORT:8000 \
  -e PORT=8000 \
  -e MINIMAX_API_KEY=${MINIMAX_API_KEY:-sk-cp-tV4TuUIpZt64tdZO3kjFDIydJtrgaSDPDAXNo8zYk8CTHD39wz7vg1JN7_Dqd8LpevwJo-ZozDcpRo1REhX3PaCak4A8M-Rl8MXAEMvGbMoNOSi73B27yoM} \
  -v $(pwd)/data:/app/data \
  $IMAGE_NAME

echo "⏳ 等待服务启动..."
sleep 3

# 检查服务状态
echo ""
echo -n "API 服务: "
curl -s http://localhost:$PORT/health && echo " ✅" || echo " ❌"

# 检查是否只启动不收集
if [ "$1" == "--daemon" ]; then
    echo ""
    echo "========================================"
    echo "✅ 生产服务已启动 (daemon模式)"
    echo "========================================"
    echo ""
    echo "📡 API 地址: http://localhost:$PORT"
    echo "   新闻接口: http://localhost:$PORT/api/news"
    echo ""
    echo "📋 常用命令:"
    echo "   查看日志: docker logs -f $CONTAINER_NAME"
    echo "   执行收集: docker exec $CONTAINER_NAME python3 scripts/collect_news.py"
    echo "   停止服务: docker stop $CONTAINER_NAME && docker rm $CONTAINER_NAME"
    exit 0
fi

# 执行新闻收集（模拟每天8:30的任务）
echo ""
echo "📰 执行新闻收集..."
echo "----------------------------------------"
docker exec $CONTAINER_NAME python3 scripts/collect_news.py --limit 20

echo ""
echo "========================================"
echo "✅ 生产环境验证完成"
echo "========================================"
echo ""
echo "📊 验证结果:"
echo -n "   数据库记录: "
curl -s "http://localhost:$PORT/api/news?limit=100" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('data',[])), '条新闻')"

echo ""
echo "📋 后续操作:"
echo "   查看日志: docker logs -f $CONTAINER_NAME"
echo "   手动收集: docker exec $CONTAINER_NAME python3 scripts/collect_news.py"
echo "   停止服务: docker stop $CONTAINER_NAME && docker rm $CONTAINER_NAME"
