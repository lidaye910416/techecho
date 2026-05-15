#!/bin/bash
# TechEcho Pro - 每日自动新闻收集与TTS生成
# 运行时间: 每天早上 8:30 (通过 crontab 调用)

# 自动检测项目根目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# 日志文件
LOG_DIR="$PROJECT_ROOT/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/collect_$(date +%Y%m%d).log"

echo "=========================================" >> "$LOG_FILE"
echo "开始执行: $(date)" >> "$LOG_FILE"
echo "=========================================" >> "$LOG_FILE"

# 执行新闻收集
python3 scripts/collect_news.py >> "$LOG_FILE" 2>&1

echo "执行完成: $(date)" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"
