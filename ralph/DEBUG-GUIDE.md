# 日期选择器调试指南

## 问题诊断

### 问题1: 右边界仍可继续拖动

**可能原因**：
1. `scrollLeft` 作为受控属性**不阻止手势滚动**
2. `onScroll` 回调有性能节流，可能检测不及时
3. `setSnapTarget` 设置后，手势惯性可能继续滚动

**诊断**：在 handleDateScroll 中添加日志
```js
console.log('scrollLeft:', left, 'monthSnapLeft:', monthSnapLeft, 'exceeded:', left > monthSnapLeft)
```

### 问题2: 档位吸附不工作

**可能原因**：
1. `onScrollEnd` 在微信小程序中**不触发**或触发时机不对
2. `onScroll` 结束时的位置与吸附位置差异 > 2 像素阈值
3. 吸附后又被手势覆盖

**诊断**：在 handleScrollEnd 中添加日志
```js
console.log('scrollEnd triggered, scrollLeft:', left)
```

### 问题3: 仍有动画

**可能原因**：
1. `scrollWithAnimation={false}` 可能不生效
2. 微信 ScrollView 默认有弹性/惯性效果

**诊断**：检查微信小程序基础库版本是否支持

## 核心问题分析

微信小程序的 ScrollView 与 H5 有本质区别：
1. **scrollLeft 受控不等于可阻止滚动** — 只是控制显示位置
2. **手势滚动由原生组件处理** — JS 无法完全拦截
3. **惯性滚动是原生行为** — 无法通过 JS 禁用

## 替代方案

### 方案A: 使用 WXS 绑定处理滚动（推荐）

WXS 是微信的响应式脚本，运行在渲染线程，可以拦截手势：
```xml
<scroll-view 
  scroll-x
  bindscroll="wxsScroll"
  scroll-left="{{snapTarget}}"
>
```

WXS 中可以实时修改 scroll-left 属性。

### 方案B: 使用 view 模拟滚动

放弃 ScrollView，用 touch 事件完全控制：
```xml
<view 
  bindtouchstart="onTouchStart"
  bindtouchmove="onTouchMove"
  bindtouchend="onTouchEnd"
>
```

### 方案C: 使用 CSS overscroll-behavior

微信可能不支持，但值得尝试：
```scss
.idx-date-track {
  overscroll-behavior: contain;
}
```

## 下一步行动

1. 添加调试日志观察实际行为
2. 尝试方案A（WXS）或方案B（自定义touch）
3. 在真机上测试

请先在开发者工具中：
1. 打开调试器的 Console 面板
2. 操作日期选择器
3. 查看是否有 console.log 输出
4. 告诉我你看到了什么
