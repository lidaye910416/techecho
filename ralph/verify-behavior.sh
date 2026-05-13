#!/bin/bash
echo "============================================"
echo "日期选择器行为验证"
echo "============================================"
PASS=0
FAIL=0

# [1] calcItemCenter 简化公式
echo -n "[1] calcItemCenter 简化公式: "
grep -q "calcItemCenter = .*i \* ITEM_WIDTH" app/src/pages/index/index.tsx && echo "✅ PASS" || echo "❌ FAIL"

# [2] 速度检测
echo -n "[2] 速度检测逻辑: "
grep -q "velocity" app/src/pages/index/index.tsx && echo "✅ PASS" || echo "❌ FAIL"

# [3] settleTimer
echo -n "[3] settleTimer 定时器: "
grep -q "settleTimerRef" app/src/pages/index/index.tsx && echo "✅ PASS" || echo "❌ FAIL"

# [4] getRightBound
echo -n "[4] getRightBound 函数: "
grep -q "getRightBound" app/src/pages/index/index.tsx && echo "✅ PASS" || echo "❌ FAIL"

# [5] doSnap 无动画延迟
echo -n "[5] doSnap 无动画延迟: "
grep -A 10 "const doSnap" app/src/pages/index/index.tsx | grep -q "setTimeout" && echo "❌ FAIL" || echo "✅ PASS"

# [6] scrollToDate 无动画延迟
echo -n "[6] scrollToDate 无动画延迟: "
grep -A 10 "const scrollToDate" app/src/pages/index/index.tsx | grep -q "setTimeout" && echo "❌ FAIL" || echo "✅ PASS"

# [7] 无 onScrollEnd JSX
echo -n "[7] 移除 onScrollEnd JSX: "
grep -q "onScrollEnd={" app/src/pages/index/index.tsx && echo "❌ FAIL" || echo "✅ PASS"

# [8] scrollWithAnimation=false
echo -n "[8] scrollWithAnimation=false: "
grep -q "scrollWithAnimation={false}" app/src/pages/index/index.tsx && echo "✅ PASS" || echo "❌ FAIL"

# [9] 9个固定档位
echo -n "[9] 9个固定档位: "
grep -q "TOTAL_ITEMS = 9" app/src/pages/index/index.tsx && echo "✅ PASS" || echo "❌ FAIL"

# [10] 编译
echo -n "[10] 编译验证: "
(cd app && npx taro build --type weapp 2>&1 | grep -q "Compiled") && echo "✅ PASS" || echo "❌ FAIL"

echo ""
echo "============================================"
echo "验证完成"
echo "============================================"
