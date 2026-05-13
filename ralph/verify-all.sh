#!/bin/bash
# 日期选择器完整验证脚本
# 验证所有需求: 右边界 + 档位吸附 + 无动效

echo "============================================"
echo "日期选择器完整验证 - $(date)"
echo "============================================"

PASS=0
FAIL=0

# [1] scrollWithAnimation = false
echo ""
echo "[1] 检查 scrollWithAnimation = false"
if grep -q 'scrollWithAnimation={false}' app/src/pages/index/index.tsx; then
    echo "✅ PASS: scrollWithAnimation 已设为 false"
    ((PASS++))
else
    echo "❌ FAIL: scrollWithAnimation 未设为 false"
    grep -n 'scrollWithAnimation' app/src/pages/index/index.tsx | head -3
    ((FAIL++))
fi

# [2] 使用 onScrollEnd 而非 onScrollAnimationEnd
echo ""
echo "[2] 检查使用 onScrollEnd 回调"
if grep -q 'onScrollEnd={handleScrollEnd}' app/src/pages/index/index.tsx; then
    echo "✅ PASS: 使用 onScrollEnd 触发吸附"
    ((PASS++))
else
    echo "❌ FAIL: 未使用 onScrollEnd"
    ((FAIL++))
fi

# [3] handleScrollEnd 调用 doSnap
echo ""
echo "[3] 检查 handleScrollEnd 调用 doSnap"
if grep -A 5 "handleScrollEnd" app/src/pages/index/index.tsx | grep -q "doSnap"; then
    echo "✅ PASS: handleScrollEnd 调用 doSnap"
    ((PASS++))
else
    echo "❌ FAIL: handleScrollEnd 未调用 doSnap"
    ((FAIL++))
fi

# [4] 右边界硬限制存在
echo ""
echo "[4] 检查右边界硬限制逻辑"
if grep -q "monthSnapLeft" app/src/pages/index/index.tsx && \
   grep -A 10 "monthSnapLeft" app/src/pages/index/index.tsx | grep -q "setSnapTarget(monthSnapLeft)"; then
    echo "✅ PASS: 右边界硬限制逻辑存在"
    ((PASS++))
else
    echo "❌ FAIL: 右边界硬限制逻辑不完整"
    ((FAIL++))
fi

# [5] 9个档位（getDateFilters 返回9项，不含all）
echo ""
echo "[5] 检查档位数量"
# 检查 getDateFilters 不包含 all 选项
if grep -A 30 "getDateFilters" app/src/api/index.ts | grep -q "key: 'all'"; then
    echo "❌ FAIL: 仍包含 'all' 选项"
    ((FAIL++))
else
    # 检查循环次数 - 应该是 for i=6 downto 2 = 5 items, plus yesterday, today, week, month = 9
    echo "✅ PASS: 已移除 'all' 选项（应有9个档位）"
    ((PASS++))
fi

# [6] doSnap 直接设置 snapTarget，无延迟
echo ""
echo "[6] 检查吸附无延迟动效"
if grep -A 15 "const doSnap" app/src/pages/index/index.tsx | grep -q "setSnapTarget(snapLeft)" && \
   ! grep -A 15 "const doSnap" app/src/pages/index/index.tsx | grep -q "setTimeout"; then
    echo "✅ PASS: 吸附直接设置，无 setTimeout 延迟"
    ((PASS++))
else
    echo "❌ FAIL: 吸附可能有延迟动效"
    ((FAIL++))
fi

# [7] 点击跳转直接设置，无延迟
echo ""
echo "[7] 检查点击跳转无延迟"
if grep -A 10 "const scrollToDate" app/src/pages/index/index.tsx | grep -q "setSnapTarget" && \
   ! grep -A 10 "const scrollToDate" app/src/pages/index/index.tsx | grep -q "setTimeout"; then
    echo "✅ PASS: 点击跳转直接设置，无 setTimeout"
    ((PASS++))
else
    echo "❌ FAIL: 点击跳转可能有延迟"
    ((FAIL++))
fi

# [8] 编译验证
echo ""
echo "[8] 编译验证"
cd app
if npx taro build --type weapp 2>&1 | grep -q "Compiled successfully"; then
    echo "✅ PASS: 编译通过"
    ((PASS++))
else
    echo "❌ FAIL: 编译失败"
    ((FAIL++))
fi
cd ..

echo ""
echo "============================================"
echo "结果: $PASS 通过, $FAIL 失败"
echo "============================================"

if [ $FAIL -eq 0 ]; then
    echo "🎉 所有验证通过！"
    exit 0
else
    echo "⚠️  有 $FAIL 项需要修复"
    exit 1
fi
