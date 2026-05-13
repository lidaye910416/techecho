# PRD-004: 语音风格切换 TTS 限制逻辑优化

## Problem Statement

当前语音风格切换存在两个问题：

1. **首页语音风格未更新**：首页点击朗读时，使用的仍是数据库中预生成的语音，而非用户当前设置的语音风格
2. **收藏页面实时 TTS 调用**：切换语音风格后，收藏页面会实时调用 TTS API 生成新语音，这会消耗用户宝贵的"一次体验"额度

**根本原因**：切换语音风格不应该触发实时 TTS 调用。实时 TTS 是受限资源（登录用户限一次），不应随意消耗。

## Solution

### 核心策略

切换语音风格后：
- **不主动调用 TTS**
- 用户点击朗读时，显示弹窗询问用户意图：
  - **切换风格**：使用新风格调用 TTS（消耗一次体验）
  - **保持风格**：使用数据库中已有的预生成语音（免费）

### 弹窗交互流程

```
用户切换语音风格（如 voice1 → voice2）
       │
       ▼
存储新设置 (techecho_settings)
       │
       ▼
用户点击朗读某条新闻
       │
       ▼
┌─────────────────────────────────────┐
│  弹窗：切换语音风格？                │
│                                     │
│  当前风格：温婉女声                  │
│  切换至：清朗男声                    │
│                                     │
│  [切换风格]  [保持当前风格]         │
└─────────────────────────────────────┘
       │
       ├── 点击「切换风格」
       │     │
       │     ▼
       │   检查登录状态
       │     ├── 未登录 → 引导登录
       │     ├── 已登录 + 已用完 → 弹窗提示次数用完
       │     └── 已登录 + 未用 → 调用 TTS，标记已用
       │
       └── 点击「保持当前风格」
             │
             ▼
           使用数据库预生成语音（如果存在）
```

## User Stories

1. 作为用户，我希望切换语音风格后不自动消耗 TTS 体验次数，以便保留免费试用机会
2. 作为用户，我希望能明确选择是否使用新语音风格生成实时 TTS，避免意外消耗体验额度
3. 作为用户，当新闻有预生成语音时，我希望直接播放而不需要调用 TTS
4. 作为用户，当新闻无预生成语音且选择切换风格时，我需要先登录才能使用 TTS
5. 作为用户，当新闻无预生成语音且已用完 TTS 体验次数时，我能看到提示并继续使用预生成语音
6. 作为用户，我希望语音风格设置在所有页面（首页、收藏页）保持一致
7. 作为未登录用户，我希望在尝试使用 TTS 时看到登录引导

## Implementation Decisions

### 1. 数据结构

```typescript
// 存储结构
interface AppSettings {
  voice: string        // 'voice1' | 'voice2' | 'voice3' | 'voice4'
  threshold: number
  darkMode: boolean
}

// 弹窗回调
interface VoiceSwitchCallback {
  onSwitchStyle: () => void      // 调用 TTS（消耗体验）
  onKeepStyle: () => void        // 使用预生成语音
}
```

### 2. 弹窗函数设计

```typescript
/**
 * 显示语音风格切换确认弹窗
 * @param currentVoice - 当前设置的语音风格
 * @param newsItem - 当前新闻（用于检查预生成语音）
 * @param onSwitch - 切换风格回调
 * @param onKeep - 保持风格回调
 */
function promptVoiceSwitch(
  currentVoice: string,
  newsItem: NewsItem,
  onSwitch: () => void,
  onKeep: () => void
): void
```

### 3. 语音风格名称映射

```typescript
const VOICE_NAMES: Record<string, string> = {
  voice1: '沉稳男声',
  voice2: '清朗男声',
  voice3: '温婉女声',
  voice4: '清新女声',
}
```

### 4. 修改页面

| 文件 | 修改内容 |
|------|---------|
| `app/src/pages/index/index.tsx` | 添加 `promptVoiceSwitch` 函数，修改 `handleSpeak` |
| `app/src/pages/news/news.tsx` | 添加 `promptVoiceSwitch` 函数，修改 `handleSpeak` |
| `app/src/i18n/index.ts` | 添加国际化文案 |

### 5. 逻辑流程

```typescript
handleSpeak(item) {
  // 1. 如果正在播放该新闻 → 停止
  if (speakingId === item.id) {
    stopPlayback()
    return
  }

  // 2. 停止其他播放
  stopCurrentPlayback()

  // 3. 检查是否有预生成语音
  const preGenAudio = item.audio?.[voice]
  
  if (preGenAudio) {
    // 有预生成语音 → 直接播放
    playAudio(preGenAudio)
    return
  }

  // 4. 无预生成语音 → 检查用户偏好
  // 当前设置的语音风格与数据库预生成的不一致？
  const hasOtherVoiceAudio = Object.keys(item.audio || {}).length > 0
  
  if (hasOtherVoiceAudio) {
    // 数据库有其他风格的预生成语音
    // 弹窗询问：切换风格 or 使用已有
    promptVoiceSwitch(voice, item, onSwitch, onKeep)
    return
  }

  // 5. 数据库完全没有预生成语音
  // 直接调用 TTS（按现有限制逻辑）
  requestTTSWithLimitCheck(item)
}
```

### 6. 国际化文案

```typescript
zh: {
  voiceSwitchTitle: '切换语音风格？',
  voiceSwitchContent: '当前风格：{current} · 将切换至：{target}',
  switchStyle: '切换风格',
  keepStyle: '保持风格',
  // ... 其他文案
}
```

## Testing Decisions

### 测试用例

| 场景 | 预期行为 |
|------|---------|
| 有预生成语音 | 直接播放，无弹窗 |
| 无预生成语音 + 数据库有其他风格 | 弹窗询问 |
| 无预生成语音 + 数据库无任何语音 | 直接调用 TTS（按限制逻辑） |
| 点击「切换风格」+ 已登录 | 调用 TTS |
| 点击「保持风格」+ 有其他风格预生成 | 播放其他风格的语音 |
| 点击「切换风格」+ 未登录 | 引导登录 |
| 点击「切换风格」+ 已用完 | 弹窗提示次数用完 |

### 测试重点

- 验证弹窗显示的语音风格名称正确
- 验证「切换风格」消耗体验，「保持风格」不消耗
- 验证多页面（首页、收藏页）行为一致

## Out of Scope

- 后端 TTS API 修改
- 数据库预生成语音管理
- 语音风格切换动画优化
- 其他功能页面（非朗读相关）

## Further Notes

1. **设计原则**：用户主动行为（如点击朗读）才触发 TTS 限制检查，切换语音风格设置本身不应触发
2. **降级策略**：当弹窗确认后如果 TTS 失败，仍应提示用户并允许重试
3. **体验一致性**：首页和收藏页的弹窗样式和文案保持完全一致
