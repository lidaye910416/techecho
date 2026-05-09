/**
 * 首页 — 完整对标 H5 (index.html)
 * 
 * 功能：
 * - 渐变色 Logo 头部 + 语言切换 + 刷新按钮
 * - 毛玻璃日期滚动选择器
 * - 分类 Chip 横向滚动
 * - 统计栏（共 N 条）
 * - 新闻卡片（朗读/收藏）
 * - 详情弹窗
 * - 报告视图（AI分析）
 */

import { useState, useEffect } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import {
  getNewsList,
  ttsSpeak,
  analyzeFavorites,
  NewsItem,
  CATEGORY_EMOJIS,
  isInDateRange,
} from '../../api'
import { t, Lang } from '../../i18n'
import './index.scss'

// ============ 常量 ============

const FAV_STORAGE_KEY = 'techecho_favorites'
const SETTINGS_STORAGE_KEY = 'techecho_settings'
const ANALYSIS_STATE_KEY = 'techecho_analysis_state'

// ============ 类型 ============

interface AnalysisState {
  exists: boolean
  articleHtml?: string
  metaHtml?: string
  badgeText?: string
  audioUrl?: string
  audioDuration?: number
  newsCount?: number
  mode?: string
  timestamp?: string
}

// ============ 组件 ============

export default function Index() {
  // 状态
  const [allNews, setAllNews] = useState<NewsItem[]>([])
  const [filteredNews, setFilteredNews] = useState<NewsItem[]>([])
  const [favorites, setFavorites] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 语言
  const [currentLang, setCurrentLang] = useState<Lang>('zh')

  // 筛选
  const [currentCategory, setCurrentCategory] = useState('all')
  const [currentDateFilter, setCurrentDateFilter] = useState('today')

  // 设置
  const [threshold, setThreshold] = useState(55)
  const [voice, setVoice] = useState('voice3')
  const [darkMode, setDarkMode] = useState(true)

  // 播放
  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const [audioCtx, setAudioCtx] = useState<Taro.InnerAudioContext | null>(null)

  // 详情弹窗
  const [detailItem, setDetailItem] = useState<NewsItem | null>(null)

  // 报告视图
  const [showReport, setShowReport] = useState(false)
  const [analysisState, setAnalysisState] = useState<AnalysisState | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [reportAudioCtx, setReportAudioCtx] = useState<Taro.InnerAudioContext | null>(null)
  const [reportPlaying, setReportPlaying] = useState(false)
  const [reportCurrentTime, setReportCurrentTime] = useState(0)
  const [reportDuration, setReportDuration] = useState(0)
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0)

  // 下拉刷新
  const [refreshing, setRefreshing] = useState(false)

  // ============ 初始化 ============

  useEffect(() => {
    loadSettings()
    loadFavorites()
    loadNews()
    restoreAnalysisState()
  }, [])

  useEffect(() => {
    filterNews()
  }, [allNews, currentLang, currentCategory, currentDateFilter, threshold, favorites])

  // ============ 数据加载 ============

  const loadSettings = () => {
    try {
      const raw = Taro.getStorageSync(SETTINGS_STORAGE_KEY)
      if (raw) {
        const s = JSON.parse(raw)
        if (s.threshold !== undefined) setThreshold(s.threshold)
        if (s.voice) setVoice(s.voice)
        if (s.darkMode !== undefined) setDarkMode(s.darkMode)
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

  const restoreAnalysisState = () => {
    try {
      const raw = Taro.getStorageSync(ANALYSIS_STATE_KEY)
      if (raw) {
        const state = JSON.parse(raw)
        if (state.exists) {
          setAnalysisState(state)
        }
      }
    } catch (_) { /* ignore */ }
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
      // 语言过滤
      if (item.lang !== currentLang && item.lang !== 'both') {
        const hasZh = item.title_zh || item.content_zh
        const hasEn = item.title_en || item.content_en
        if (currentLang === 'zh' && !hasZh) return false
        if (currentLang === 'en' && !hasEn) return false
      }
      if (currentCategory !== 'all' && item.category !== currentCategory) return false
      const dateStr = item.published_at || item.created_at
      if (!isInDateRange(dateStr, currentDateFilter)) return false
      if (item.quality && item.quality.total_100 < threshold) return false
      return true
    })
    setFilteredNews(result)
  }

  // ============ 语言切换 ============

  const handleLangChange = (lang: Lang) => {
    setCurrentLang(lang)
    clearAnalysisState()
  }

  // ============ 朗读 ============

  const handleSpeak = async (item: NewsItem, e?: any) => {
    if (e) e.stopPropagation?.()

    if (speakingId === item.id) {
      if (audioCtx) { audioCtx.stop(); audioCtx.destroy(); setAudioCtx(null) }
      setSpeakingId(null)
      Taro.showToast({ title: t('stopped'), icon: 'none', duration: 1500 })
      return
    }

    if (audioCtx) { audioCtx.stop(); audioCtx.destroy(); setAudioCtx(null) }

    Taro.showToast({ title: t('speakGen'), icon: 'loading', duration: 10000 })

    try {
      const preGenAudio = item.audio?.[voice]
      if (preGenAudio) {
        Taro.hideToast()
        playAudio(item.id, preGenAudio)
        return
      }

      const text = (item.content_zh || item.content_en || item.title_zh || item.title_en || '').slice(0, 800)
      const ttsRes = await ttsSpeak(text, voice)
      Taro.hideToast()

      if (ttsRes.success && ttsRes.data?.audio_url) {
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

  const playAudio = (newsId: string, url: string) => {
    const ctx = Taro.createInnerAudioContext()
    ctx.src = url
    ctx.autoplay = true
    ctx.onPlay(() => { setSpeakingId(newsId); setAudioCtx(ctx) })
    ctx.onEnded(() => { setSpeakingId(null); setAudioCtx(null); ctx.destroy() })
    ctx.onStop(() => { setSpeakingId(null); setAudioCtx(null); ctx.destroy() })
    ctx.onError(() => {
      setSpeakingId(null); setAudioCtx(null); ctx.destroy()
      Taro.showToast({ title: t('playFailed'), icon: 'none' })
    })
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
    clearAnalysisState()
  }

  const clearAnalysisState = () => {
    setAnalysisState(null)
    Taro.removeStorageSync(ANALYSIS_STATE_KEY)
  }

  // ============ 详情 ============

  const openDetail = (item: NewsItem) => {
    setDetailItem(item)
  }

  const closeDetail = () => {
    setDetailItem(null)
  }

  // ============ AI 分析 ============

  const handleAnalyze = async (force = false) => {
    if (analyzing) return

    const favNews = allNews.filter(item => favorites.includes(item.id))
    if (favNews.length === 0) {
      Taro.showToast({ title: t('noFavsTip'), icon: 'none' })
      return
    }

    if (analysisState?.exists && !force) {
      setShowReport(true)
      return
    }

    setAnalyzing(true)
    try {
      const res = await analyzeFavorites(favorites, 10)

      if (!res.success || !res.data?.raw_text) {
        Taro.showToast({ title: t('analysisFailed'), icon: 'none' })
        setAnalyzing(false)
        return
      }

      const rawText = res.data.raw_text
      const lines = rawText.split('\n').filter((l: string) => l.trim().length >= 8)

      if (lines.length < 2) {
        Taro.showToast({ title: t('incomplete'), icon: 'none' })
        setAnalyzing(false)
        return
      }

      const title = lines[0]
      const summary = lines[1]
      const bodyLines = lines.slice(2, -1)
      const conclusion = lines[lines.length - 1]

      const now = new Date()
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      const metaHtml = `${t('basedOn')} <strong>${res.data.news_count}</strong> ${t('items')} · ${timeStr}`
      const badgeText = res.data.mode === 'rule_based' ? t('offlineMode') : t('aiMode')

      const newState: AnalysisState = {
        exists: true,
        articleHtml: lines.join('\n'),
        metaHtml,
        badgeText,
        newsCount: res.data.news_count,
        mode: res.data.mode,
        timestamp: now.toISOString(),
      }

      setAnalysisState(newState)
      Taro.setStorageSync(ANALYSIS_STATE_KEY, JSON.stringify(newState))

      // 自动 TTS
      if (rawText) {
        try {
          const ttsRes = await ttsSpeak(rawText.slice(0, 2500), voice)
          if (ttsRes.success && ttsRes.data?.audio_url) {
            newState.audioUrl = ttsRes.data.audio_url
            newState.audioDuration = ttsRes.data.duration
            setAnalysisState({ ...newState })
            Taro.setStorageSync(ANALYSIS_STATE_KEY, JSON.stringify(newState))
          }
        } catch (_) { /* TTS optional */ }
      }

      setShowReport(true)
    } catch (e: any) {
      console.error('Analysis error:', e)
      Taro.showToast({ title: t('networkError'), icon: 'none' })
    }
    setAnalyzing(false)
  }

  const closeReport = () => {
    stopReportAudio()
    setShowReport(false)
  }

  const stopReportAudio = () => {
    if (reportAudioCtx) {
      reportAudioCtx.stop()
      reportAudioCtx.destroy()
      setReportAudioCtx(null)
    }
    setReportPlaying(false)
    setReportCurrentTime(0)
    setReportDuration(0)
  }

  const toggleReportPlay = () => {
    if (!analysisState?.audioUrl) return

    if (reportAudioCtx) {
      if (reportPlaying) {
        reportAudioCtx.pause()
        setReportPlaying(false)
      } else {
        reportAudioCtx.play()
        setReportPlaying(true)
      }
      return
    }

    const ctx = Taro.createInnerAudioContext()
    ctx.src = analysisState.audioUrl
    ctx.autoplay = true
    ctx.playbackRate = playbackSpeed

    ctx.onPlay(() => {
      setReportAudioCtx(ctx)
      setReportPlaying(true)
      setTimeout(() => {
        if (ctx.duration > 0) setReportDuration(ctx.duration)
      }, 500)
    })

    ctx.onTimeUpdate(() => {
      if (ctx.duration > 0) {
        setReportCurrentTime(ctx.currentTime)
        setReportDuration(ctx.duration)
      }
    })

    ctx.onEnded(() => {
      setReportPlaying(false)
      setReportAudioCtx(null)
      setReportCurrentTime(0)
      ctx.destroy()
    })

    ctx.onError(() => {
      setReportPlaying(false)
      setReportAudioCtx(null)
      ctx.destroy()
    })
  }

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed)
    if (reportAudioCtx) {
      reportAudioCtx.playbackRate = speed
    }
  }

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00'
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }

  // ============ 格式化 ============

  const parseDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr)
      return `${d.getMonth() + 1}月${d.getDate()}日`
    } catch (_) { return dateStr.slice(0, 10) }
  }

  const getDateOptions = () => {
    const today = new Date()
    const options = []

    for (let i = 6; i >= 2; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      options.push({
        key: `day${i}`,
        label: '',
        value: String(d.getDate()),
        month: d.getMonth() + 1,
      })
    }

    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    options.push({
      key: 'yesterday',
      label: currentLang === 'zh' ? '昨天' : 'Yesterday',
      value: String(yesterday.getDate()),
      month: yesterday.getMonth() + 1,
    })

    options.push({
      key: 'today',
      label: currentLang === 'zh' ? '今天' : 'Today',
      value: String(today.getDate()),
      month: today.getMonth() + 1,
    })

    options.push({
      key: 'week',
      label: currentLang === 'zh' ? '本周' : 'Week',
      value: '7',
      month: null,
    })

    options.push({
      key: 'month',
      label: currentLang === 'zh' ? '本月' : 'Month',
      value: String(today.getDate()),
      month: today.getMonth() + 1,
    })

    options.push({
      key: 'all',
      label: currentLang === 'zh' ? '全部' : 'All',
      value: '∞',
      month: null,
    })

    return options
  }

  const getCategories = () => {
    if (currentLang === 'en') {
      return [
        { id: 'all', name: 'Featured', emoji: '✨' },
        { id: 'ai', name: 'AI', emoji: '🤖' },
        { id: 'tools', name: 'Tools', emoji: '🔧' },
        { id: 'news', name: 'News', emoji: '📰' },
        { id: 'product', name: 'Products', emoji: '💡' },
      ]
    }
    return [
      { id: 'all', name: '推荐', emoji: '✨' },
      { id: 'ai', name: 'AI', emoji: '🤖' },
      { id: 'tools', name: '工具', emoji: '🔧' },
      { id: 'news', name: '动态', emoji: '📰' },
      { id: 'product', name: '产品', emoji: '💡' },
    ]
  }

  const getCategoryNames = () => {
    if (currentLang === 'en') {
      return { ai: 'AI', tools: 'Tools', news: 'News', product: 'Products' }
    }
    return { ai: 'AI', tools: '工具', news: '动态', product: '产品' }
  }

  const getDisplayTitle = (item: NewsItem) => {
    return currentLang === 'en' ? (item.title_en || item.title_zh) : (item.title_zh || item.title_en)
  }

  const getDisplaySummary = (item: NewsItem) => {
    return currentLang === 'en' ? (item.summary_en || item.summary_zh) : (item.summary_zh || item.summary_en)
  }

  const getDisplaySource = (item: NewsItem) => {
    return currentLang === 'en' ? (item.source_en || item.source_zh) : (item.source_zh || item.source_en)
  }

  const getDisplayContent = (item: NewsItem) => {
    return currentLang === 'en' ? (item.content_en || item.content_zh) : (item.content_zh || item.content_en)
  }

  // ============ 渲染 ============

  const isFav = (id: string) => favorites.indexOf(id) !== -1
  const isSpeaking = (id: string) => speakingId === id
  const categories = getCategories()
  const categoryNames = getCategoryNames()
  const dateOptions = getDateOptions()

  return (
    <View className={`idx-page ${darkMode ? '' : 'light-theme'}`}>
      {/* ===== Header ===== */}
      <View className="idx-header">
        <View className="idx-header-content">
          <View className="idx-logo-wrap">
            <View className="idx-logo-icon">
              <Text className="idx-logo-icon-text">🎙</Text>
            </View>
            <Text className="idx-logo-text">{currentLang === 'zh' ? '科技回声' : 'TechEcho'}</Text>
          </View>

          <View className="idx-header-actions">
            {/* 语言切换 */}
            <View className="idx-lang-toggle">
              <View
                className={`idx-lang-btn ${currentLang === 'zh' ? 'active' : ''}`}
                onClick={() => handleLangChange('zh')}
              >
                <Text>中文</Text>
              </View>
              <View
                className={`idx-lang-btn ${currentLang === 'en' ? 'active' : ''}`}
                onClick={() => handleLangChange('en')}
              >
                <Text>EN</Text>
              </View>
            </View>

            <View className="idx-refresh-btn" onClick={loadNews}>
              <Text className="idx-refresh-icon">↻</Text>
            </View>
          </View>
        </View>
      </View>

      {/* ===== Filters ===== */}
      <View className="idx-filters">
        {/* 日期选择器 */}
        <View className="idx-date-picker">
          <ScrollView scrollX className="idx-date-track" showScrollbar={false}>
            <View className="idx-date-inner">
              {dateOptions.map((d) => {
                const active = currentDateFilter === d.key
                return (
                  <View
                    key={d.key}
                    className={`idx-date-item ${active ? 'center-item' : ''}`}
                    onClick={() => setCurrentDateFilter(d.key)}
                  >
                    {d.label && <Text className="idx-date-label">{d.label}</Text>}
                    <Text className="idx-date-value">{d.value}</Text>
                  </View>
                )
              })}
            </View>
          </ScrollView>
          <View className="idx-date-edge idx-date-edge--left" />
          <View className="idx-date-edge idx-date-edge--right" />
        </View>

        {/* 分类 Chips */}
        <View className="idx-cat-row">
          <ScrollView scrollX className="idx-cat-scroll" showScrollbar={false}>
            <View className="idx-cat-inner">
              {categories.map((cat) => (
                <View
                  key={cat.id}
                  className={`idx-cat-chip ${currentCategory === cat.id ? 'active' : ''}`}
                  onClick={() => setCurrentCategory(cat.id)}
                >
                  <Text className="idx-cat-emoji">{cat.emoji}</Text>
                  <Text className="idx-cat-name">{cat.name}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* 统计栏 */}
        <View className="idx-stats">
          <Text className="idx-stats-text">
            {currentLang === 'zh' ? '共 ' : ''}<Text className="idx-stats-num">{filteredNews.length}</Text>{currentLang === 'zh' ? ' 条' : ' items'}
          </Text>
        </View>
      </View>

      {/* ===== Feed ===== */}
      <ScrollView
        scrollY
        className="idx-feed"
        refresherEnabled
        refresherTriggered={refreshing}
        onRefresherRefresh={onRefresherRefresh}
      >
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
            const catName = categoryNames[item.category] || item.category
            const title = getDisplayTitle(item)
            const summary = getDisplaySummary(item)
            const source = getDisplaySource(item)
            const dateStr = item.published_at || item.created_at || ''
            const shortDate = parseDate(dateStr)
            const isChinese = item.lang === 'zh' || (!item.lang && !!item.title_zh)
            const fav = isFav(item.id)
            const speak = isSpeaking(item.id)

            return (
              <View
                key={item.id}
                className="idx-card"
                onClick={() => openDetail(item)}
              >
                <View className="idx-card-hd">
                  <View className="idx-card-emoji">
                    <Text>{emoji}</Text>
                  </View>
                  <View className="idx-card-meta">
                    <View className="idx-card-tags">
                      {isChinese ? (
                        <Text className="idx-tag idx-tag--zh">中文</Text>
                      ) : (
                        <Text className="idx-tag idx-tag--en">EN</Text>
                      )}
                      <Text className="idx-tag idx-tag--cat">{catName}</Text>
                    </View>
                    <View className="idx-card-source-row">
                      <Text className="idx-card-source">{source}</Text>
                      {item.source_url && <Text className="idx-card-source-link"> ↗</Text>}
                    </View>
                  </View>
                </View>

                <View className="idx-card-bd">
                  <Text className="idx-card-title">{title}</Text>
                  <Text className="idx-card-summary">{summary}</Text>
                </View>

                <View className="idx-card-ft" onClick={(e) => e.stopPropagation()}>
                  <Text className="idx-card-date">{shortDate}</Text>
                  <View className="idx-card-actions">
                    <View
                      className={`idx-act-btn ${speak ? 'idx-act-btn--active' : ''}`}
                      onClick={(e: any) => handleSpeak(item, e)}
                    >
                      <Text className="idx-act-text">
                        {speak ? t('stopSpeaking') : '🔊 ' + t('speak')}
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
      </ScrollView>

      {/* ===== 详情弹窗 ===== */}
      {detailItem && (
        <View className="idx-detail-modal" onClick={closeDetail}>
          <View className="idx-modal-content" onClick={(e) => e.stopPropagation()}>
            <View className="idx-modal-header">
              <Text className="idx-modal-title">{currentLang === 'zh' ? '资讯详情' : 'News Details'}</Text>
              <View className="idx-modal-close" onClick={closeDetail}>
                <Text>✕</Text>
              </View>
            </View>

            <ScrollView scrollY className="idx-modal-body">
              <View className="idx-detail-card">
                <View className="idx-detail-header">
                  <Text className="idx-detail-title">{getDisplayTitle(detailItem)}</Text>
                  <View className="idx-detail-meta">
                    <Text className="idx-detail-source">{getDisplaySource(detailItem)}</Text>
                    <Text className="idx-detail-date">{detailItem.published_at || detailItem.created_at}</Text>
                  </View>
                </View>

                <View className="idx-detail-content">
                  <Text className="idx-detail-text">
                    {getDisplayContent(detailItem)?.slice(0, 2000) || ''}
                  </Text>
                </View>

                {detailItem.source_url && (
                  <View className="idx-detail-source-link">
                    <Text className="idx-detail-link-label">📎 {currentLang === 'zh' ? '原文链接' : 'Source Link'}</Text>
                    <Text className="idx-detail-link-url">{detailItem.source_url}</Text>
                  </View>
                )}
              </View>
            </ScrollView>

            <View className="idx-detail-actions">
              <View className="idx-detail-action" onClick={(e: any) => handleSpeak(detailItem, e)}>
                <Text className="idx-detail-action-icon">🔊</Text>
                <Text className="idx-detail-action-text">{t('speak')}</Text>
              </View>
              <View className="idx-detail-action primary" onClick={closeDetail}>
                <Text className="idx-detail-action-icon">✓</Text>
                <Text className="idx-detail-action-text">{currentLang === 'zh' ? '已读' : 'Done'}</Text>
              </View>
              <View className="idx-detail-action" onClick={() => toggleFavorite(detailItem.id)}>
                <Text className="idx-detail-action-icon">❤️</Text>
                <Text className="idx-detail-action-text">{t('favorite')}</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* ===== 报告视图 ===== */}
      {showReport && analysisState && (
        <View className="idx-report-view">
          <View className="idx-report-topbar">
            <View className="idx-report-back" onClick={closeReport}>
              <Text>← {currentLang === 'zh' ? '返回' : 'Back'}</Text>
            </View>
            <View className="idx-report-badge">
              <Text>{analysisState.badgeText || t('aiMode')}</Text>
            </View>
            <View className="idx-report-close" onClick={closeReport}>
              <Text>✕</Text>
            </View>
          </View>

          <View className="idx-report-meta">
            <Text>{analysisState.metaHtml || ''}</Text>
          </View>

          <ScrollView scrollY className="idx-report-body">
            <View className="idx-report-article">
              {analysisState.articleHtml?.split('\n').map((line, idx) => {
                if (idx === 0) {
                  return <Text key={idx} className="rp-title-line">{line}</Text>
                }
                if (idx === 1) {
                  return <Text key={idx} className="rp-summary">{line}</Text>
                }
                if (idx === analysisState.articleHtml!.split('\n').length - 1) {
                  return <Text key={idx} className="rp-conclusion">{line}</Text>
                }
                return <Text key={idx} className="rp-para">{line}</Text>
              })}
            </View>

            {/* 播放器 */}
            {analysisState.audioUrl && (
              <View className="idx-report-player">
                <View className="idx-player-progress">
                  <View
                    className="idx-player-progress-fill"
                    style={{ width: `${reportDuration > 0 ? (reportCurrentTime / reportDuration) * 100 : 0}%` }}
                  />
                </View>
                <View className="idx-player-time">
                  <Text>{formatTime(reportCurrentTime)}</Text>
                  <Text>{formatTime(reportDuration)}</Text>
                </View>
              </View>
            )}

            {/* 操作栏 */}
            <View className="idx-report-actions">
              <View
                className={`idx-ra-btn ${analyzing ? 'loading' : ''}`}
                onClick={() => handleAnalyze(true)}
              >
                <Text className="idx-ra-text">{t('reAnalyze')}</Text>
              </View>

              {analysisState.audioUrl ? (
                <View
                  className={`idx-ra-btn idx-ra-btn--play ${reportPlaying ? 'playing' : ''}`}
                  onClick={toggleReportPlay}
                >
                  <Text className="idx-ra-text">
                    {reportPlaying ? t('reportPause') : t('reportPlay')}
                  </Text>
                </View>
              ) : (
                <View className="idx-ra-btn idx-ra-btn--disabled">
                  <Text className="idx-ra-text">{t('reportPlay')}</Text>
                </View>
              )}

              {[0.8, 1.0, 1.15, 1.5].map(speed => (
                <View
                  key={speed}
                  className={`idx-ra-speed ${playbackSpeed === speed ? 'active' : ''}`}
                  onClick={() => handleSpeedChange(speed)}
                >
                  <Text>{speed}x</Text>
                </View>
              ))}
            </View>

            <View className="idx-safe-bottom" />
          </ScrollView>
        </View>
      )}
    </View>
  )
}
