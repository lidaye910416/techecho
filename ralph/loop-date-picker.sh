#!/bin/bash
# Ralph Loop - 日期选择器持续优化
# 每次迭代：分析问题 -> 修复 -> 验证 -> 报告

ITERATION=1
MAX_ITERATIONS=10

echo "============================================"
echo "Ralph Loop - 日期选择器优化"
echo "============================================"

while [ $ITERATION -le $MAX_ITERATIONS ]; do
    echo ""
    echo ">>> 迭代 #$ITERATION <<<"
    echo ""
    
    # 运行验证
    echo "[验证]"
    if ! ./ralph/verify-all.sh; then
        echo "验证失败，修复后重试..."
    fi
    
    # 检查当前状态
    echo ""
    echo "[分析当前代码]"
    
    # 检查右边界逻辑是否完善
    echo "- 右边界检测逻辑："
    grep -n "monthSnapLeft" app/src/pages/index/index.tsx | head -3
    
    # 检查是否使用了 enhanced 属性
    echo "- ScrollView enhanced 属性："
    if grep -q "enhanced" app/src/pages/index/index.tsx; then
        echo "  存在 enhanced 属性（可能影响滚动）"
    else
        echo "  无 enhanced 属性"
    fi
    
    # 检查是否所有档位都能被吸附
    echo "- doSnap 吸附逻辑："
    grep -A 15 "const doSnap" app/src/pages/index/index.tsx | head -18
    
    # 用户需要手动测试并反馈问题
    echo ""
    echo "请在微信开发者工具中测试并报告具体问题："
    echo "1. 往右滚动到本月后是否能继续拖动？"
    echo "2. 松手后是否吸附到最近档位？"
    echo "3. 点击跳转是否立即到位无动画？"
    echo ""
    read -p "输入问题描述（或按 Enter 跳过）: " USER_INPUT
    
    if [ -z "$USER_INPUT" ]; then
        echo "迭代完成（用户无反馈）"
        break
    fi
    
    # 分析问题类型并修复
    case "$USER_INPUT" in
        *"右"*|*"往右"*|*"继续"*|*"空白"*)
            echo ""
            echo ">>> 修复：右边界限制 <<<"
            # 改进：使用更精确的右边界判断，考虑实际可视区域宽度
            cat >> /tmp/fix_log.txt << FIX1
问题: 右边界仍可继续拖动
可能原因: 
1. onScroll 检测滞后
2. scrollLeft 受控属性不阻止实际滚动
3. 实际可视区域宽度与 halfScreen 不一致

尝试方案:
1. 使用 enhanced={false} 获得更直接的手势控制
2. 添加 onTouchEnd 事件处理最终位置
3. 考虑使用 CSS overscroll-behavior 替代 JS
FIX1
            
            # 读取当前 handleDateScroll 逻辑
            echo "当前右边界逻辑："
            grep -A 20 "handleDateScroll" app/src/pages/index/index.tsx | head -25
            ;;
        *"吸附"*|*"档位"*)
            echo ""
            echo ">>> 修复：档位吸附 <<<"
            # 检查 onScrollEnd 是否真的被触发
            cat >> /tmp/fix_log.txt << FIX2
问题: 档位吸附不工作
可能原因:
1. onScrollEnd 在某些微信版本不触发
2. doSnap 逻辑中的阈值判断问题

尝试方案:
1. 同时监听 onTouchEnd 作为备选
2. 调整 doSnap 中的阈值 (当前 > 2)
FIX2
            ;;
        *"动画"*|*"动效"*)
            echo ""
            echo ">>> 修复：移除动效 <<<"
            # 确认 scrollWithAnimation=false
            grep -n "scrollWithAnimation" app/src/pages/index/index.tsx
            ;;
        *)
            echo ""
            echo ">>> 分析：$USER_INPUT <<<"
            ;;
    esac
    
    ((ITERATION++))
done

echo ""
echo "============================================"
echo "Loop 结束，共 $((ITERATION-1)) 次迭代"
echo "============================================"
