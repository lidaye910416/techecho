/**
 * 首页 — 对标 H5 首页 (localhost:8080, index.html L885-911, L913-927, L1533-1642)
 *
 * 功能：
 * - 渐变色 Logo 头部 + 刷新按钮
 * - 毛玻璃日期滚动选择器（对标 H5 frosted glass date picker）
 * - 分类 Chip 横向滚动
 * - 统计栏（共 N 条）
 * - 新闻卡片（Emoji + 语言标签 + 分类标签 + 来源 ↗ + 标题 + 摘要 + 日期 + 朗读/收藏）
 * - 点击卡片进入详情
 * - 朗读（MiniMax TTS + InnerAudioContext）
 * - 收藏（Storage 持久化）
 * - 质量阈值过滤
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import {
  getNewsList,
  ttsSpeak,
  getAudioUrl,
  NewsItem,
  getDisplayTitle,
  getDisplaySummary,
  getDisplaySource,
  CATEGORY_EMOJIS,
  CATEGORY_NAMES,
  getDateFilters,
  DateFilterOption,
  isInDateRange,
} from '../../api'
import { t } from '../../i18n'
import { useTheme } from '../../hooks/useTheme'
import {
  playNewsAudio,
  stopAllAudio,
  onAudioStop,
  onAudioStart,
  AUDIO_STOP_EVENT,
  AUDIO_START_EVENT,
  AUDIO_PAUSE_EVENT,
  AUDIO_RESUME_EVENT,
  AUDIO_SWITCH_EVENT,
  AUDIO_LOADING_EVENT,
  getPlayingInfo,
  globalAudioCtx,
} from '../../utils/audioManager'
import './index.scss'

// ============ 常量 ============

const ALL_CATEGORIES = [
  { id: 'all', name: '推荐', emoji: '✨' },
  { id: 'ai', name: 'AI', emoji: '🤖' },
  { id: 'tools', name: '工具', emoji: '🔧' },
  { id: 'news', name: '动态', emoji: '📰' },
  { id: 'product', name: '产品', emoji: '💡' },
]

const FAV_STORAGE_KEY = 'techecho_favorites'
const SETTINGS_STORAGE_KEY = 'techecho_settings'
const ANALYSIS_STATE_KEY = 'techecho_analysis_state'
const TTS_USED_KEY = 'techecho_tts_used'

// 语音风格名称映射
const VOICE_NAMES: Record<string, string> = {
  voice1: '沉稳男声',
  voice2: '清朗男声',
  voice3: '温婉女声',
  voice4: '清新女声',
}

// 全局音频标识
const AUDIO_SOURCE = 'index'

// ============ 组件 ============

export default function Index() {
  const { darkMode } = useTheme()

  // 数据
  const [allNews, setAllNews] = useState<NewsItem[]>([])
  const [filteredNews, setFilteredNews] = useState<NewsItem[]>([])
  const [favorites, setFavorites] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 筛选
  const [currentCategory, setCurrentCategory] = useState('all')
  const [currentDateFilter, setCurrentDateFilter] = useState('today')

  // 设置
  const [threshold, setThreshold] = useState(55)
  const [voice, setVoice] = useState('voice3')

  // 播放 - 使用 useRef 避免闭包陷阱
  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const [pausedId, setPausedId] = useState<string | null>(null)  // 暂停的新闻ID
  const [loadingId, setLoadingId] = useState<string | null>(null)  // 正在加载的新闻ID
  const audioCtxRef = useRef<Taro.InnerAudioContext | null>(null)

  // 下拉刷新
  const [refreshing, setRefreshing] = useState(false)

  // 详情底部弹出卡片（对标 H5 modal slideUp）
  const [detailItem, setDetailItem] = useState<NewsItem | null>(null)

  // ================================================
  // [TODO] 日期选择器滚动模式（暂时禁用 - 已简化为3档固定按钮）
  // ================================================
  // 禁用原因：微信小程序 ScrollView 不支持 CSS scroll-snap，
  //          JS 吸附逻辑复杂，当前产品需求只需3档位直接点击选择
  //
  // 如需恢复滚动模式：
  // 1. 取消下方常量定义注释
  //    - ITEM_WIDTH: 单个档位宽度
  //    - HALF_ITEM: 半宽（用于居中计算）
  //    - TODAY_INDEX: "今天"在列表中的索引
  //    - LEADING_SPACER: 左侧占位宽度
  //    - halfScreen: 屏幕半宽
  //
  // 2. 恢复 getDateFilters() 调用，获取完整的日期选项列表
  //
  // 3. 恢复 scrollToDate() 函数，实现：
  //    - 计算目标 scrollLeft
  //    - 速度检测（判断是手动滚动还是点击）
  //    - 档位吸附（滚动到最近的档位中心）
  //    - 右边界硬限制
  //
  // 4. 恢复 ScrollView 的 onScroll 事件处理
  //    - 实时更新 scrollLeft
  //    - 节流触发档位吸附
  //
  // 5. 恢复 index.scss 中的滚动相关样式：
  //    - .idx-date-overlay (渐变遮罩)
  //    - .idx-date-glow (中心高亮)
  //    - .idx-date-track (滚动轨道)
  //    - .idx-date-item (档位项)
  //    - .idx-date-item--active (激活状态)
  //    - .idx-date-label (标签文字 TODAY/YDAY等)
  // ================================================

  // [TODO] 恢复滚动模式：取消下方注释
  // const ITEM_WIDTH = 76
  // const HALF_ITEM = ITEM_WIDTH / 2
  // const TODAY_INDEX = 6
  // const halfScreen = (() => {
  //   try { return Taro.getSystemInfoSync().windowWidth / 2 }
  //   catch (_) { return 187.5 }
  // })()
  // const LEADING_SPACER = halfScreen - HALF_ITEM

  // 3档位固定按钮（当前使用版本）
  const dateOptions = useMemo(() => {
  return [
    { key: 'yesterday', label: '昨天' },
    { key: 'today', label: '今天' },
    { key: 'week', label: '本周' },
  ]
}, [])

  // [TODO] 恢复滚动模式：将 selectDate 替换为 scrollToDate，实现档位吸附滚动
  // const DATE_KEYS = ['day6', 'day5', 'day4', 'day3', 'day2', 'yesterday', 'today', 'week', 'month', 'all'] as const
  // const scrollToDate = (key: string) => {
  //   const idx = DATE_KEYS.indexOf(key as typeof DATE_KEYS[number])
  //   if (idx < 0) return
  //   const targetScrollLeft = idx * ITEM_WIDTH
  //   setScrollLeft(targetScrollLeft)
  //   setCurrentDateFilter(key)
  // }

  // 当前使用：直接设置筛选条件
  const selectDate = (key: string) => {
    if (key === currentDateFilter) return
    setCurrentDateFilter(key)
  }

// 初始化选中"今天"
useEffect(() => {
  setCurrentDateFilter('today')
}, [])

  // ============ 初始化 ============

  useEffect(() => {
    loadSettings()
    loadFavorites()
    loadNews()
  }, [])

  // Tab 切换回首页时刷新收藏状态和设置
  useDidShow(() => {
    loadFavorites()
    loadSettings()
  })

  // 监听全局音频事件
  useEffect(() => {
    const handleStop = () => {
      setSpeakingId(null)
      setPausedId(null)
      setLoadingId(null)
      audioCtxRef.current = null
    }

    const handleStart = (item: { newsId: string; source: string }) => {
      if (item.source === AUDIO_SOURCE) {
        setSpeakingId(item.newsId)
        setPausedId(null)
      } else {
        setSpeakingId(null)
        setPausedId(null)
      }
    }

    const handlePause = (data: { newsId: string }) => {
      setPausedId(data.newsId)
      setSpeakingId(null)
    }

    const handleResume = (data: { newsId: string }) => {
      setSpeakingId(data.newsId)
      setPausedId(null)
    }

    const handleSwitch = (data: { oldNewsId: string | null; newNewsId: string }) => {
      if (data.oldNewsId) {
        setSpeakingId(null)
        setPausedId(null)
      }
    }

    const handleLoading = (data: { newsId: string }) => {
      setLoadingId(data.newsId)
      setSpeakingId(data.newsId)
      setPausedId(null)
    }

    const unsubStop = onAudioStop(handleStop)
    const unsubStart = onAudioStart(handleStart)

    Taro.eventCenter.on(AUDIO_STOP_EVENT, handleStop)
    Taro.eventCenter.on(AUDIO_START_EVENT, handleStart)
    Taro.eventCenter.on(AUDIO_PAUSE_EVENT, handlePause)
    Taro.eventCenter.on(AUDIO_RESUME_EVENT, handleResume)
    Taro.eventCenter.on(AUDIO_SWITCH_EVENT, handleSwitch)
    Taro.eventCenter.on(AUDIO_LOADING_EVENT, handleLoading)

    return () => {
      unsubStop()
      unsubStart()
      Taro.eventCenter.off(AUDIO_STOP_EVENT, handleStop)
      Taro.eventCenter.off(AUDIO_START_EVENT, handleStart)
      Taro.eventCenter.off(AUDIO_PAUSE_EVENT, handlePause)
      Taro.eventCenter.off(AUDIO_RESUME_EVENT, handleResume)
      Taro.eventCenter.off(AUDIO_SWITCH_EVENT, handleSwitch)
      Taro.eventCenter.off(AUDIO_LOADING_EVENT, handleLoading)
    }
  }, [])

  useEffect(() => {
    filterNews()
  }, [allNews, currentCategory, currentDateFilter, threshold, favorites])

  // ============ 数据加载 ============

  const loadSettings = () => {
    try {
      const raw = Taro.getStorageSync(SETTINGS_STORAGE_KEY)
      if (raw) {
        const s = JSON.parse(raw)
        if (s.threshold !== undefined) setThreshold(s.threshold)
        if (s.voice !== undefined) setVoice(s.voice)
      }
    } catch (_) { /* default */ }
  }

  const loadFavorites = () => {
    try {
      const raw = Taro.getStorageSync(FAV_STORAGE_KEY)
      setFavorites(raw ? JSON.parse(raw) : [])
    } catch (_) { setFavorites([]) }
  }

  const loadNews = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await getNewsList({ limit: 500 })
      if (res.success && Array.isArray(res.data)) {
        setAllNews(res.data)
      } else {
        setError(t('dataError'))
      }
    } catch (e: any) {
      console.error('Load news failed:', e)
      setError(e?.message || t('loadFailed'))
    }
    setLoading(false)
  }

  // ============ 下拉刷新 ============

  const onRefresherRefresh = async () => {
    setRefreshing(true)
    await loadNews()
    setRefreshing(false)
  }

  // ============ 筛选 ============

  const filterNews = () => {
    const result = allNews.filter((item) => {
      if (currentCategory !== 'all' && item.category !== currentCategory) return false
      const dateStr = item.published_at || item.created_at
      if (!isInDateRange(dateStr, currentDateFilter)) return false
      if (item.quality && item.quality.total_100 < threshold) return false
      return true
    })
    setFilteredNews(result)
  }

  // ============ 朗读 ============

  /** 检查用户是否已登录 */
  const isLoggedIn = (): boolean => {
    try { return !!Taro.getStorageSync('auth_token') } catch (_) { return false }
  }

  /** 检查 TTS 实时调用是否已使用 */
  const isTTSUsed = (): boolean => {
    try { return !!Taro.getStorageSync(TTS_USED_KEY) } catch (_) { return false }
  }

  /** 标记 TTS 已使用 */
  const markTTSUsed = () => {
    try { Taro.setStorageSync(TTS_USED_KEY, '1') } catch (_) { /* ignore */ }
  }

  /** 提示用户登录 */
  const promptLogin = () => {
    Taro.showModal({
      title: '需要登录',
      content: '实时语音生成仅限登录用户使用。是否前往登录？',
      confirmText: '去登录',
      cancelText: '稍后',
      success: (res) => {
        if (res.confirm) {
          Taro.switchTab({ url: '/pages/mine/mine' })
        }
      },
    })
  }

  /** 提示 TTS 次数已用完 */
  const promptTTSLimit = () => {
    Taro.showModal({
      title: t('ttsLimitReached'),
      content: t('ttsLimitContent'),
      showCancel: false,
      confirmText: t('gotIt'),
    })
  }

  /** 语音风格切换确认弹窗 */
  const promptVoiceSwitch = (item: NewsItem) => {
    const currentName = VOICE_NAMES[voice] || voice
    // 获取数据库中已有的预生成语音风格名称
    const availableVoices = item.audio ? Object.keys(item.audio) : []
    const availableNames = availableVoices.map(v => VOICE_NAMES[v] || v).join('、')

    Taro.showModal({
      title: t('voiceSwitchTitle'),
      content: `当前设置：${currentName}\n已有预生成：${availableNames || '无'}\n\n选择"切换"将调用实时语音生成（需登录，限一次）`,
      confirmText: '切换风格',
      cancelText: '保持',
      success: (res) => {
        if (res.confirm) {
          // 用户选择切换风格 → 调用 TTS（消耗一次体验）
          requestTTS(item, voice)
        } else {
          // 用户选择保持风格 → 使用默认风格播放，并切换语音设置
          const defaultVoice = 'voice3'
          setVoice(defaultVoice)
          try {
            const raw = Taro.getStorageSync(SETTINGS_STORAGE_KEY)
            const s = raw ? JSON.parse(raw) : {}
            s.voice = defaultVoice
            Taro.setStorageSync(SETTINGS_STORAGE_KEY, JSON.stringify(s))
            // 通知其他页面设置已变更
            Taro.eventCenter.trigger('techecho_settings_changed')
          } catch (_) { /* ignore */ }
          playOtherVoiceAudio(item)
        }
      },
    })
  }

  /** 使用数据库中已有的预生成语音（播放默认风格 voice3） */
  const playOtherVoiceAudio = (item: NewsItem) => {
    if (!item.audio || Object.keys(item.audio).length === 0) {
      Taro.showToast({ title: '无可用语音', icon: 'none' })
      return
    }

    // 优先使用 voice3（温婉女声），其次使用任何可用的预生成语音
    const audioPath = item.audio.voice3 || item.audio.voice1 || item.audio.voice2 || item.audio.voice4
      || Object.values(item.audio)[0]

    if (audioPath) {
      const audioUrl = getAudioUrl(audioPath)
      playAudio(item.id, audioUrl)
    } else {
      Taro.showToast({ title: '无可用语音', icon: 'none' })
    }
  }

  /** 播放音频 */
  const playAudio = (newsId: string, url: string) => {
    const audioUrl = url.startsWith('http') ? url : getAudioUrl(url)
    playNewsAudio(newsId, audioUrl, AUDIO_SOURCE)
  }

  /** 请求 TTS（实时语音生成） */
  const requestTTS = async (item: NewsItem, voiceId: string) => {
    Taro.showToast({ title: t('speakGen'), icon: 'loading', duration: 10000 })

    try {
      if (!isLoggedIn()) {
        Taro.hideToast()
        promptLogin()
        return
      }

      if (isTTSUsed()) {
        Taro.hideToast()
        promptTTSLimit()
        return
      }

      const text = (item.summary_zh || item.content_zh || item.title_zh || '').slice(0, 800)
      const ttsRes = await ttsSpeak(text, voiceId)
      Taro.hideToast()

      if (ttsRes.success && ttsRes.data?.audio_url) {
        markTTSUsed()
        playAudio(item.id, ttsRes.data.audio_url)
      } else {
        Taro.showToast({ title: t('speakFailed'), icon: 'none' })
      }
    } catch (e) {
      console.error('TTS failed:', e)
      Taro.hideToast()
      Taro.showToast({ title: t('speakUnavail'), icon: 'none' })
    }
  }

  const handleSpeak = async (item: NewsItem, e?: any) => {
    if (e) e.stopPropagation?.()

    // 检查是否正在播放/暂停该新闻
    if (speakingId === item.id) {
      // 正在播放 → 停止
      stopAllAudio()
      return
    }

    if (pausedId === item.id) {
      // 正在暂停 → 继续播放（直接调用 audioManager 恢复）
      const playingInfo = getPlayingInfo()
      if (playingInfo.newsId === item.id && playingInfo.isPaused && globalAudioCtx) {
        globalAudioCtx.play()
      }
      return
    }

    // 按钮是播放状态，检查预生成语音
    // 检查当前设置的语音风格是否有预生成语音
    const preGenAudio = item.audio?.[voice]
    if (preGenAudio) {
      // 有预生成语音 → 直接播放
      playAudio(item.id, preGenAudio)
      return
    }

    // 检查数据库是否有其他风格的预生成语音
    const hasOtherVoiceAudio = item.audio && Object.keys(item.audio).length > 0
    if (hasOtherVoiceAudio) {
      // 有其他风格的预生成语音 → 弹窗询问
      promptVoiceSwitch(item)
      return
    }

    // 数据库完全没有预生成语音 → 直接调用 TTS（按限制逻辑）
    requestTTS(item, voice)
  }

  // ============ 收藏 ============

  const toggleFavorite = (id: string, e?: any) => {
    if (e) e.stopPropagation?.()

    const idx = favorites.indexOf(id)
    let updated: string[]
    if (idx === -1) {
      updated = [...favorites, id]
      Taro.showToast({ title: t('addedFav'), icon: 'success', duration: 1500 })
    } else {
      updated = favorites.filter((fid) => fid !== id)
      Taro.showToast({ title: t('removedFav'), icon: 'none', duration: 1500 })
    }
    setFavorites(updated)
    Taro.setStorageSync(FAV_STORAGE_KEY, JSON.stringify(updated))

    // 对标 H5 clearAnalysisState
    try { Taro.removeStorageSync(ANALYSIS_STATE_KEY) } catch (_) { /* ignore */ }
  }

  // ============ 导航 — 底部弹出卡片（对标 H5 modal slideUp）============

  const openDetail = (item: NewsItem) => {
    setDetailItem(item)
  }

  const closeDetail = () => {
    setDetailItem(null)
  }

  // ============ 格式化 ============

  /** 安全解析日期（兼容 iOS 的 RFC 2822 格式） */
  const safeParseDate = (dateStr: string): Date | null => {
    if (!dateStr) return null

    // 优先匹配 ISO 格式（iOS 支持）
    const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (isoMatch) {
      const [, y, m, d] = isoMatch
      return new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
    }

    // 解析 RFC 2822 格式（iOS 不支持，需手动解析）
    // 格式: "Wed, 13 May 2026 07:59:36 +0800"
    const rfcMatch = dateStr.match(/^[A-Za-z]{3},\s+(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/)
    if (rfcMatch) {
      const [, day, monthStr, year, hour, min, sec] = rfcMatch
      const monthMap: Record<string, number> = {
        Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
        Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
      }
      const month = monthMap[monthStr]
      if (month !== undefined) {
        return new Date(parseInt(year), month, parseInt(day), parseInt(hour), parseInt(min), parseInt(sec))
      }
    }

    // 尝试标准解析（兜底）
    try {
      const d = new Date(dateStr)
      if (!isNaN(d.getTime())) return d
    } catch (_) { /* ignore */ }

    return null
  }

  const parseDate = (dateStr: string) => {
    const d = safeParseDate(dateStr)
    if (!d) return dateStr.slice(0, 10)
    const m = d.getMonth() + 1
    const day = d.getDate()
    return `${m}月${day}日`
  }

  // ===== 系统信息 =====
  // navigationStyle: 'custom' — 自定义导航栏，需手动适配状态栏高度
  // 注意: Taro.getSystemInfoSync 在新版本基础库中已废弃，但暂时无影响
  const statusBarHeight = (Taro.getSystemInfoSync?.().statusBarHeight || 20) as number
  const headerPaddingTop = `${statusBarHeight + 8}px`

  // 微信小程序 TabBar 页面无需返回按钮
  // 刷新通过下拉刷新实现（refresherEnabled），无需额外按钮

  // 微信胶囊按钮位置（保留用于其他扩展）
  let menuButtonRight = 0
  try {
    const menuBtn = Taro.getMenuButtonBoundingClientRect()
    if (menuBtn) {
      const systemInfo = Taro.getSystemInfoSync()
      menuButtonRight = systemInfo.windowWidth - (menuBtn.left || 0) + 8
    }
  } catch (_) { /* 降级：不处理 */ }

  // ============ 渲染 ============

  const isFav = (id: string) => favorites.indexOf(id) !== -1
  // 判断是否正在播放（无论是播放中还是暂停中，都显示激活状态）
  const isSpeaking = (id: string) => speakingId === id || pausedId === id

  return (
    <View className={`idx-page${darkMode ? '' : ' idx-light'}`}>
      {/* ===== Header — 对标 H5 L885-911 =====
          微信 TabBar 首页：无需返回/刷新按钮，下拉刷新即可 */}
      <View className="idx-header" style={{ paddingTop: headerPaddingTop }}>
        <View className="idx-header-content">
          {/* Logo — 对标 H5 SVG gradient icon + 科技回声 */}
          <View className="idx-logo-wrap">
            <View className="idx-logo-icon">
              <Text className="idx-logo-icon-text">🎙</Text>
            </View>
            <Text className="idx-logo-text">{t('appName')}</Text>
          </View>
        </View>
      </View>

      {/* ===== Filters — 对标 H5 L913-927 ===== */}
      <View className="idx-filters">

        {/* 日期选择器 — 纯展示，点击选择 */}
        <View className="idx-date-picker">
          <View className="idx-date-inner">
            {dateOptions.map((opt) => {
              const active = currentDateFilter === opt.key
              return (
                <View
                  key={opt.key}
                  className={`idx-date-btn ${active ? 'idx-date-btn--active' : ''}`}
                  onClick={() => selectDate(opt.key)}
                >
                  <Text className="idx-date-btn-label">{opt.label}</Text>
                </View>
              )
            })}
          </View>
        </View>

        {/* 分类 Chips — 对标 H5 category-scroll */}
        <View className="idx-cat-row">
          <ScrollView scrollX className="idx-cat-scroll" showScrollbar={false}>
            <View className="idx-cat-inner">
              {ALL_CATEGORIES.map((cat) => (
                <View
                  key={cat.id}
                  className={`idx-cat-chip ${currentCategory === cat.id ? 'idx-cat-chip--active' : ''}`}
                  onClick={() => setCurrentCategory(cat.id)}
                >
                  <Text className="idx-cat-emoji">{cat.emoji}</Text>
                  <Text className="idx-cat-name">{cat.name}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* 统计栏 — 对标 H5 stats-bar */}
        <View className="idx-stats">
          <View className="idx-stats-inner">
            <Text className="idx-stats-text">
              共 <Text className="idx-stats-num">{filteredNews.length}</Text> 条
            </Text>
          </View>
        </View>
      </View>

      {/* ===== Feed — 对标 H5 L946-948 ===== */}
      {/* 使用 View 包裹内容以避免 scroll-view 的 padding 警告 */}
      <ScrollView
        scrollY
        className="idx-feed"
        refresherEnabled
        refresherTriggered={refreshing}
        onRefresherRefresh={onRefresherRefresh}
      >
        <View className="idx-feed-inner">
        {loading ? (
          <View className="idx-loading">
            <View className="idx-loading-spinner" />
            <Text className="idx-loading-text">{t('loading')}</Text>
          </View>
        ) : error ? (
          <View className="idx-empty">
            <Text className="idx-empty-icon">⚠️</Text>
            <Text className="idx-empty-title">{t('loadFailed')}</Text>
            <Text className="idx-empty-desc">{error}</Text>
            <View className="idx-retry-btn" onClick={loadNews}>
              <Text className="idx-retry-text">{t('retry')}</Text>
            </View>
          </View>
        ) : filteredNews.length === 0 ? (
          <View className="idx-empty">
            <Text className="idx-empty-icon">📭</Text>
            <Text className="idx-empty-title">{t('emptyTitle')}</Text>
            <Text className="idx-empty-desc">{t('emptyText')}</Text>
          </View>
        ) : (
          filteredNews.map((item) => {
            const emoji = CATEGORY_EMOJIS[item.category] || '📰'
            const catName = CATEGORY_NAMES[item.category] || item.category
            const title = getDisplayTitle(item)
            const summary = getDisplaySummary(item)
            const source = getDisplaySource(item)
            const dateStr = item.published_at || item.created_at || ''
            const shortDate = parseDate(dateStr)
            const fav = isFav(item.id)
            const speak = isSpeaking(item.id)

            return (
              <View
                key={item.id}
                className="idx-card"
                onClick={() => openDetail(item)}
              >
                {/* Card Header — 对标 H5 L1617-1626 */}
                <View className="idx-card-hd">
                  <View className="idx-card-emoji">
                    <Text>{emoji}</Text>
                  </View>
                  <View className="idx-card-meta">
                    <View className="idx-card-tags">
                      <Text className="idx-tag idx-tag--cat">{catName}</Text>
                    </View>
                    {/* 来源 — 对标 H5 source-link with ↗ */}
                    <View className="idx-card-source-row">
                      <Text className="idx-card-source">{source}</Text>
                      {item.source_url && <Text className="idx-card-source-link"> ↗</Text>}
                    </View>
                  </View>
                </View>

                {/* Card Body — 对标 H5 L1627-1630 */}
                <View className="idx-card-bd">
                  <Text className="idx-card-title">{title}</Text>
                  <Text className="idx-card-summary">{summary}</Text>
                </View>

                {/* Card Footer — 对标 H5 L1631-1641 */}
                <View className="idx-card-ft">
                  <Text className="idx-card-date">{shortDate}</Text>
                  <View className="idx-card-actions">
                    <View
                      className={`idx-act-btn ${speak ? 'idx-act-btn--active' : ''}`}
                      onClick={(e: any) => handleSpeak(item, e)}
                    >
                      <Text className="idx-act-text">
                        {speakingId === item.id ? t('stopSpeaking') :
                         pausedId === item.id ? '▶️ ' + t('speak') :
                         '🔊 ' + t('speak')}
                      </Text>
                    </View>
                    <View
                      className={`idx-act-btn ${fav ? 'idx-act-btn--active' : ''}`}
                      onClick={(e: any) => toggleFavorite(item.id, e)}
                    >
                      <Text className="idx-act-text">
                        {fav ? t('favorited') : '🤍 ' + t('favorite')}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            )
          })
        )}
        <View className="idx-safe-bottom" />
        </View>
      </ScrollView>

      {/* ===== 详情底部弹出卡片 — 对标 H5 modal slideUp L486-531 ===== */}
      {detailItem && (
        <View className="idx-detail-overlay" onClick={closeDetail} catchMove>
          <View
            className="idx-detail-sheet"
            onClick={(e: any) => e.stopPropagation()}
          >
            {/* 拖拽指示条 */}
            <View className="idx-detail-handle">
              <View className="idx-detail-handle-bar" />
            </View>

            {/* 头部 */}
            <View className="idx-detail-hd">
              <Text className="idx-detail-title">{getDisplayTitle(detailItem)}</Text>
              <View className="idx-detail-meta">
                <Text className="idx-detail-source">{getDisplaySource(detailItem)}</Text>
                <Text className="idx-detail-date">{parseDate(detailItem.published_at || detailItem.created_at || '')}</Text>
              </View>
            </View>

            {/* 正文 — 可滚动 */}
            <View className="idx-detail-body">
              <Text className="idx-detail-content">
                {detailItem.content_zh || detailItem.content_en || detailItem.summary_zh || detailItem.summary_en || '暂无内容'}
              </Text>

              {/* 原文链接 */}
              {detailItem.source_url && (
                <View className="idx-detail-link" onClick={() => {
                  Taro.setClipboardData({ data: detailItem.source_url! })
                  Taro.showToast({ title: '链接已复制', icon: 'success' })
                }}>
                  <Text className="idx-detail-link-label">📎 原文链接</Text>
                  <Text className="idx-detail-link-url">{detailItem.source_url}</Text>
                </View>
              )}
            </View>

            {/* 底部操作栏 */}
            <View className="idx-detail-actions">
              <View
                className={`idx-detail-act ${isSpeaking(detailItem.id) ? 'idx-detail-act--active' : ''}`}
                onClick={(e: any) => handleSpeak(detailItem, e)}
              >
                <Text>{speakingId === detailItem.id ? t('stopSpeaking') : pausedId === detailItem.id ? '▶️ ' + t('speak') : '🔊 ' + t('speak')}</Text>
              </View>
              <View
                className={`idx-detail-act ${isFav(detailItem.id) ? 'idx-detail-act--active' : ''}`}
                onClick={(e: any) => toggleFavorite(detailItem.id, e)}
              >
                <Text>{isFav(detailItem.id) ? '❤️' : '🤍'}</Text>
                <Text>{isFav(detailItem.id) ? t('favorited') : t('favorite')}</Text>
              </View>
              <View className="idx-detail-act idx-detail-act--primary" onClick={closeDetail}>
                <Text>✓</Text>
                <Text>已读</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
