#!/bin/bash
echo "============================================"
echo "3档位日期选择器验证"
echo "============================================"

# [1] 3个档位
echo -n "[1] 3个档位: "
grep -q "TOTAL_ITEMS = 3" app/src/pages/index/index.tsx && echo "✅ PASS" || echo "❌ FAIL"

# [2] DATE_KEYS 只有3项
echo -n "[2] DATE_KEYS 3项: "
grep -q "DATE_KEYS = \['yesterday', 'today', 'week'\]" app/src/pages/index/index.tsx && echo "✅ PASS" || echo "❌ FAIL"

# [3] 左边界限制
echo -n "[3] 左边界限制: "
grep -q "getLeftBound" app/src/pages/index/index.tsx && echo "✅ PASS" || echo "❌ FAIL"

# [4] 右边界限制
echo -n "[4] 右边界限制: "
grep -q "getRightBound" app/src/pages/index/index.tsx && echo "✅ PASS" || echo "❌ FAIL"

# [5] scrollWithAnimation=false
echo -n "[5] scrollWithAnimation=false: "
grep -q "scrollWithAnimation={false}" app/src/pages/index/index.tsx && echo "✅ PASS" || echo "❌ FAIL"

# [6] contentWidth = 377
echo -n "[6] contentWidth = 377: "
grep -q "width: 377px" app/src/pages/index/index.scss && echo "✅ PASS" || echo "❌ FAIL"

# [7] 编译
echo -n "[7] 编译: "
(cd app && npx taro build --type weapp 2>&1 | grep -q "Compiled") && echo "✅ PASS" || echo "❌ FAIL"

echo ""
echo "============================================"
