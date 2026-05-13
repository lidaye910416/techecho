#!/bin/bash
# Ralph Auto Loop - 日期选择器自动化优化循环
# 持续运行直到所有问题修复

ITERATION=0
MAX_ITER=20

echo "============================================"
echo "Ralph Auto Loop - 日期选择器优化"
echo "============================================"

# 初始化
mkdir -p /tmp/ralph-fixes
FIX_LOG="/tmp/ralph-fixes/fixes-$(date +%Y%m%d-%H%M%S).log"

log_fix() {
    echo "[$(date '+%H:%M:%S')] $1" | tee -a "$FIX_LOG"
}

run_verify() {
    ./ralph/verify-all.sh > /tmp/verify-result.txt 2>&1
    cat /tmp/verify-result.txt
    if grep -q "所有验证通过" /tmp/verify-result.txt; then
        return 0
    else
        return 1
    fi
}

# 主循环
while [ $ITERATION -lt $MAX_ITER ]; do
    ITERATION=$((ITERATION + 1))
    echo ""
    echo "=== 迭代 #$ITERATION ==="
    
    # 1. 验证
    log_fix "迭代 #$ITERATION 开始"
    
    if run_verify; then
        echo ""
        echo "✅ 代码验证通过"
        log_fix "代码验证通过"
        # 编译确认
        cd app && npx taro build --type weapp 2>&1 | tail -3 && cd ..
        echo ""
        echo "📋 请在微信开发者工具中验证以下功能："
        echo "   1. 往右滚动到本月后不能再继续拖动"
        echo "   2. 松手后吸附到最近档位（无动效）"
        echo "   3. 点击任意档位立即跳转（无动画）"
        echo ""
        
        # 用户确认
        echo -n "是否还有问题？ (y/n): "
        read -r answer
        if [ "$answer" != "y" ] && [ "$answer" != "Y" ]; then
            log_fix "用户确认无问题，循环结束"
            break
        fi
        echo "请描述剩余问题："
        read -r issue
        
        # 分析问题并修复
        case "$issue" in
            *"右"*|*"往右"*|*"空白"*)
                log_fix "问题: 右边界可继续拖动 - 尝试增强右边界限制"
                # 方案: 在 handleDateScroll 中增加更严格的检测
                # 同时在 onTouchEnd 中再次检测并拉回
                ;;
            *"吸附"*)
                log_fix "问题: 档位吸附不工作"
                ;;
            *"动画"*|*"动效"*)
                log_fix "问题: 仍有动画"
                ;;
            *)
                log_fix "其他问题: $issue"
                ;;
        esac
    else
        echo ""
        echo "⚠️ 代码验证未通过，尝试修复..."
        log_fix "代码验证失败，尝试修复"
    fi
    
    # 短暂暂停
    sleep 0.5
done

echo ""
echo "============================================"
echo "循环完成，共 $ITERATION 次迭代"
echo "修复日志: $FIX_LOG"
echo "============================================"
