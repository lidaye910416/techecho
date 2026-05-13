#!/bin/bash
# 日期选择器验证脚本
# 用法: ./verify-date-picker.sh

set -e

echo "============================================"
echo "日期选择器验证 - $(date)"
echo "============================================"

# 1. 检查 scrollWithAnimation
echo ""
echo "[1] 检查 scrollWithAnimation = false"
if grep -q 'scrollWithAnimation' app/src/pages/index/index.tsx; then
    if grep -q 'scrollWithAnimation={false}' app/src/pages/index/index.tsx; then
        echo "✅ scrollWithAnimation 已设为 false"
    elif grep -q 'scrollWithAnimation' app/src/pages/index/index.tsx; then
        echo "❌ scrollWithAnimation 仍存在（可能为 true）"
        grep -n 'scrollWithAnimation' app/src/pages/index/index.tsx
    fi
else
    echo "❌ ScrollView 中未找到 scrollWithAnimation"
fi

# 2. 检查 doSnap 调用
echo ""
echo "[2] 检查档位吸附逻辑"
if grep -q 'onScrollAnimationEnd' app/src/pages/index/index.tsx; then
    echo "✅ 已添加 onScrollAnimationEnd 回调"
elif grep -q 'doSnap' app/src/pages/index/index.tsx; then
    # 检查 doSnap 是否被调用
    if grep -c 'doSnap(' app/src/pages/index/index.tsx | grep -q '[2-9]'; then
        echo "✅ doSnap 被调用多次（吸附逻辑存在）"
    else
        echo "❌ doSnap 存在但未被调用"
        grep -n 'doSnap' app/src/pages/index/index.tsx
    fi
else
    echo "❌ 未找到 doSnap 或 onScrollAnimationEnd"
fi

# 3. 检查右边界硬限制
echo ""
echo "[3] 检查右边界硬限制"
if grep -q 'monthSnapLeft' app/src/pages/index/index.tsx; then
    echo "✅ 右边界检查逻辑存在"
    grep -n 'monthSnapLeft' app/src/pages/index/index.tsx
else
    echo "❌ 未找到右边界检查逻辑"
fi

# 4. 检查 contentWidth 与实际档位数
echo ""
echo "[4] 检查档位数量"
DATE_COUNT=$(grep -oP "(?<=dateOptions = )\[[\w',]+(?=\])" app/src/api/index.ts | tr -cd ',' | wc -c)
echo "日期选项数: $((DATE_COUNT + 1))"
if [ $((DATE_COUNT + 1)) -eq 9 ]; then
    echo "✅ 恰好9个档位"
else
    echo "❌ 档位数量不对（期望9个）"
fi

# 5. 编译验证
echo ""
echo "[5] 编译验证"
cd app
if npx taro build --type weapp 2>&1 | grep -q "Compiled successfully"; then
    echo "✅ 编译通过"
else
    echo "❌ 编译失败"
    npx taro build --type weapp 2>&1 | tail -20
fi

echo ""
echo "============================================"
echo "验证完成"
echo "============================================"
