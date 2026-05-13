/**
 * 收藏页 — 对标 H5 收藏页 (localhost:8080, index.html L929-982, L1975-2276)
 *
 * 功能：
 * - AI 分析 Hero 卡片（对标 H5 analysisHero）
 * - 收藏新闻列表（与首页卡片样式完全一致）
 * - AI 分析报告视图（对标 H5 reportView）
 * - 朗读单条新闻 + 报告 TTS 播报
 * - 取消收藏
 */

import { useState, useEffect } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import {
  getNewsList,
  ttsSpeak,
  analyzeFavorites,
  NewsItem,
  getDisplayTitle,
  getDisplaySummary,
  getDisplaySource,
  CATEGORY_EMOJIS,
  CATEGORY_NAMES,
} from '../../api'
import { t } from '../../i18n'
import { useTheme } from '../../hooks/useTheme'
import './news.scss'

// ============ 常量 ============

const FAV_STORAGE_KEY = 'techecho_favorites'
const SETTINGS_STORAGE_KEY = 'techecho_settings'
const ANALYSIS_STATE_KEY = 'techecho_analysis_state'
const TTS_USED_KEY = 'techecho_tts_used'

// ============ 组件 ============

export default function News() {
  const { darkMode } = useTheme()

  // 数据
  const [allNews, setAllNews] = useState<NewsItem[]>([])
  const [favorites, setFavorites] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  // 设置
  const [voice, setVoice] = useState('voice3')

  // 单条播放
  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const [audioCtx, setAudioCtx] = useState<Taro.InnerAudioContext | null>(null)

  // AI 分析
  const [analyzing, setAnalyzing] = useState(false)
  const [hasCachedAnalysis, setHasCachedAnalysis] = useState(false)
  // 分析完成后 Hero 卡片展示的元信息（不触发报告视图）
  const [analysisMeta, setAnalysisMeta] = useState<{ newsCount: number; time: string; mode: string } | null>(null)
  // 仅当用户点击"查看报告"后才设置，触发报告视图
  const [analysisResult, setAnalysisResult] = useState<{
    raw_text: string
    news_count: number
    mode: string
    audio_url?: string
    article_paras: string[]
    meta_html?: string
  } | null>(null)

  // 报告音频
  const [reportAudioCtx, setReportAudioCtx] = useState<Taro.InnerAudioContext | null>(null)
  const [reportPlaying, setReportPlaying] = useState(false)
  const [reportCurrentTime, setReportCurrentTime] = useState(0)
  const [reportDuration, setReportDuration] = useState(0)

  // 报告加载/错误视图内状态
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState('')

  // ============ 初始化 ============

  useEffect(() => {
    loadSettings()
    loadFavorites()
    loadAllNews()
    restoreAnalysisCache()
  }, [])

  // Tab 切换时重新加载收藏数据（小程序 Tab 页不 remount）
  useDidShow(() => {
    loadFavorites()
    loadAllNews()
    restoreAnalysisCache()
  })

  const loadSettings = () => {
    try {
      const raw = Taro.getStorageSync(SETTINGS_STORAGE_KEY)
      if (raw) {
        const s = JSON.parse(raw)
        if (s.voice) setVoice(s.voice)
      }
    } catch (_) { /* default */ }
  }

  const loadFavorites = () => {
    try {
      const raw = Taro.getStorageSync(FAV_STORAGE_KEY)
      setFavorites(raw ? JSON.parse(raw) : [])
    } catch (_) { setFavorites([]) }
  }

  const loadAllNews = async () => {
    setLoading(true)
    try {
      const res = await getNewsList({ limit: 500 })
      if (res.success && Array.isArray(res.data)) {
        setAllNews(res.data)
      }
    } catch (e) {
      console.error('Load news failed:', e)
    }
    setLoading(false)
  }

  // ============ 派生数据 ============

  const favNews = allNews.filter((item) => favorites.indexOf(item.id) !== -1)
  const hasFavorites = favorites.length > 0

  // ============ 缓存恢复 (路径B) ============

  const restoreAnalysisCache = () => {
    try {
      // 无收藏时不恢复分析缓存（对标 H5: clearAnalysisState on fav change）
      const favs = Taro.getStorageSync(FAV_STORAGE_KEY)
      const favList: string[] = favs ? JSON.parse(favs) : []
      if (favList.length === 0) {
        Taro.removeStorageSync(ANALYSIS_STATE_KEY)
        setHasCachedAnalysis(false)
        return
      }

      const raw = Taro.getStorageSync(ANALYSIS_STATE_KEY)
      if (!raw) { setHasCachedAnalysis(false); return }
      const cached = JSON.parse(raw)
      if (!cached || !cached.exists) { setHasCachedAnalysis(false); return }
      if (!cached.articleParas || cached.articleParas.length === 0) {
        setHasCachedAnalysis(false)
        return
      }

      setHasCachedAnalysis(true)
      // 恢复 Hero 元信息，不自动打开报告
      setAnalysisMeta({
        newsCount: cached.newsCount || 0,
        time: cached.timestamp ? new Date(cached.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '',
        mode: cached.mode || 'cached',
      })
    } catch (_) { /* ignore */ }
  }

  // ============ 朗读单条 ============

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
      title: '体验次数已用完',
      content: '实时语音生成功能每位用户限体验一次。建议收藏感兴趣的新闻，等待后台预生成完整语音。',
      showCancel: false,
      confirmText: '我知道了',
    })
  }

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
      // 优先使用预生成语音（不受登录/次数限制）
      const preGenAudio = item.audio?.[voice]
      if (preGenAudio) {
        Taro.hideToast()
        playSingleAudio(item.id, preGenAudio)
        return
      }

      // 实时 TTS 需要检查登录和次数
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
      const ttsRes = await ttsSpeak(text, voice)
      Taro.hideToast()

      if (ttsRes.success && ttsRes.data?.audio_url) {
        markTTSUsed()
        playSingleAudio(item.id, ttsRes.data.audio_url)
      } else {
        Taro.showToast({ title: t('speakFailed'), icon: 'none' })
      }
    } catch (e) {
      console.error('TTS failed:', e)
      Taro.hideToast()
      Taro.showToast({ title: t('speakUnavail'), icon: 'none' })
    }
  }

  const playSingleAudio = (newsId: string, url: string) => {
    const ctx = Taro.createInnerAudioContext()
    ctx.src = url
    ctx.autoplay = true
    ctx.onPlay(() => { setSpeakingId(newsId); setAudioCtx(ctx) })
    ctx.onEnded(() => { setSpeakingId(null); setAudioCtx(null); ctx.destroy() })
    ctx.onStop(() => { setSpeakingId(null); setAudioCtx(null); ctx.destroy() })
    ctx.onError((err) => {
      console.error('Audio error:', err)
      setSpeakingId(null); setAudioCtx(null); ctx.destroy()
    })
  }

  // ============ 取消收藏 ============

  const removeFavorite = (id: string, e?: any) => {
    if (e) e.stopPropagation?.()

    const updated = favorites.filter((fid) => fid !== id)
    setFavorites(updated)
    Taro.setStorageSync(FAV_STORAGE_KEY, JSON.stringify(updated))
    Taro.showToast({ title: t('removedFav'), icon: 'none', duration: 1500 })

    // 如果正在看报告，关闭它
    if (analysisResult) {
      if (reportAudioCtx) { reportAudioCtx.stop(); reportAudioCtx.destroy(); setReportAudioCtx(null) }
      setReportPlaying(false)
      setAnalysisResult(null)
      setReportCurrentTime(0)
      setReportDuration(0)
    }
    // 不清除 ANALYSIS_STATE_KEY，保留缓存
  }

  // ============ 导航 — 底部弹出卡片（对标首页）============

  const [detailItem, setDetailItem] = useState<NewsItem | null>(null)

  const openDetail = (item: NewsItem) => {
    setDetailItem(item)
  }

  const closeDetail = () => {
    setDetailItem(null)
  }

  // ============ 格式化 ============

  const parseDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr)
      return `${d.getMonth() + 1}月${d.getDate()}日`
    } catch (_) { return dateStr.slice(0, 10) }
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }

  // ============ AI 分析 ============

  const handleAnalyze = async () => {
    if (analyzing) return
    if (!hasFavorites) {
      Taro.showToast({ title: t('noFavsTip'), icon: 'none' })
      return
    }

    setAnalyzing(true)
    setAnalysisMeta(null) // 清除旧 meta，进入 loading

    try {
      const res = await analyzeFavorites(favorites, 10)

      if (!res.success || !res.data?.raw_text) {
        Taro.showToast({ title: t('analysisFailed'), icon: 'none' })
        setAnalyzing(false)
        return
      }

      const rawText = res.data.raw_text

      // 清理 + 分段
      const lines = rawText
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length >= 8)
        .filter((l) => !/^[\d一二三四五六七八九十]+[\.\、\)）]/.test(l))
        .filter((l) => !/^[•\-\*\+]/.test(l))
        .filter((l) => !/^(现状扫描|趋势研判|值得注意|一句话总结|收尾金句)/.test(l))
        .filter((l) => !/^(根据|基于|以下|我来)/.test(l))

      const title = lines.length > 0 ? lines[0] : 'AI 分析报告'
      const body = lines.length > 1 ? lines.slice(1) : []
      const articleParas = [title, ...body]

      const now = new Date()
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      const metaHtml = `${t('basedOn')} ${res.data.news_count} ${t('items')} · ${timeStr}`

      // 保存完整结果到 storage（供"查看报告"使用）
      Taro.setStorageSync(ANALYSIS_STATE_KEY, JSON.stringify({
        exists: true,
        articleParas,
        metaHtml,
        newsCount: res.data.news_count,
        mode: res.data.mode,
        audioUrl: res.data.audio_url,
        timestamp: now.toISOString(),
      }))

      // 更新 Hero 状态：不跳转，显示两个按钮
      setHasCachedAnalysis(true)
      setAnalysisMeta({ newsCount: res.data.news_count, time: timeStr, mode: res.data.mode })
      setAnalyzing(false)

      Taro.showToast({ title: '分析完成', icon: 'success', duration: 1500 })

      // 后台 TTS（不阻塞 UI）
      if (!res.data.audio_url && rawText) {
        try {
          const ttsRes = await ttsSpeak(rawText.slice(0, 2500), voice)
          if (ttsRes.success && ttsRes.data?.audio_url) {
            const st = Taro.getStorageSync(ANALYSIS_STATE_KEY)
            if (st) {
              const parsed = JSON.parse(st)
              parsed.audioUrl = ttsRes.data.audio_url
              Taro.setStorageSync(ANALYSIS_STATE_KEY, JSON.stringify(parsed))
            }
          }
        } catch (_) { /* TTS 静默失败 */ }
      }
    } catch (e: any) {
      console.error('Analysis error:', e)
      Taro.showToast({ title: t('networkError'), icon: 'none' })
      setAnalyzing(false)
    }
  }

  // 从缓存或刚分析完的结果打开报告视图
  const viewReport = () => {
    try {
      const raw = Taro.getStorageSync(ANALYSIS_STATE_KEY)
      if (!raw) return
      const cached = JSON.parse(raw)
      if (!cached?.articleParas?.length) return

      setReportLoading(false)
      setReportError('')
      setAnalysisResult({
        raw_text: cached.articleParas.join('\n'),
        news_count: cached.newsCount || 0,
        mode: cached.mode || 'cached',
        audio_url: cached.audioUrl || undefined,
        article_paras: cached.articleParas,
        meta_html: cached.metaHtml || '',
      })
    } catch (_) { /* ignore */ }
  }

  const closeReport = () => {
    if (reportAudioCtx) { reportAudioCtx.stop(); reportAudioCtx.destroy(); setReportAudioCtx(null) }
    setReportPlaying(false)
    setReportCurrentTime(0)
    setReportDuration(0)
    setReportError('')
    setReportLoading(false)
    setAnalysisResult(null)
    // 回到列表视图，Hero 卡片保留 analysisMeta 显示两个按钮
  }


  const toggleReportPlay = () => {
    if (!analysisResult?.audio_url) return

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
    ctx.src = analysisResult.audio_url
    ctx.autoplay = true

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
      setReportPlaying(false); setReportAudioCtx(null)
      setReportCurrentTime(0); setReportDuration(0)
      ctx.destroy()
    })

    ctx.onStop(() => {
      setReportPlaying(false); setReportAudioCtx(null)
      setReportCurrentTime(0); setReportDuration(0)
      ctx.destroy()
    })

    ctx.onError((err) => {
      console.error('Report audio error:', err)
      setReportPlaying(false); setReportAudioCtx(null)
      setReportCurrentTime(0); setReportDuration(0)
      ctx.destroy()
    })
  }

  // ===== 系统信息 =====
  // navigationStyle: 'custom' — 自定义导航栏，需手动适配状态栏高度
  const statusBarHeight = (Taro.getSystemInfoSync?.().statusBarHeight || 20) as number
  const headerPaddingTop = `${statusBarHeight + 8}px`

  // ============ 报告视图 ============

  if (analysisResult) {
    return (
      <View className={`fav-page${darkMode ? '' : ' fav-light'}`}>
        {/* 报告顶栏 — 对标 H5 L953-957 */}
        <View className="fav-report-topbar" style={{ paddingTop: headerPaddingTop }}>
          <View className="fav-report-back" onClick={closeReport}>
            <Text>{t('backToFav')}</Text>
          </View>
          <View className="fav-report-badge">
            <Text>{analysisResult.mode === 'rule_based' ? t('offlineMode') : t('aiMode')}</Text>
          </View>
          <View className="fav-report-close" onClick={closeReport}>
            <Text>✕</Text>
          </View>
        </View>

        {/* 报告元信息 — 对标 H5 L958 */}
        <View className="fav-report-meta">
          <Text>{analysisResult.meta_html || ''}</Text>
        </View>

        {/* 报告正文 — 对标 H5 L959-963 */}
        <ScrollView scrollY className="fav-report-body">
          <View className="fav-report-article">
            {/* 加载态 — 对标 H5 L959-962 */}
            {reportLoading && (
              <View className="fav-rp-loading">
                <View className="fav-rp-loading-spinner" />
                <Text className="fav-rp-loading-text">{t('analysisLoading')}</Text>
              </View>
            )}

            {/* 错误态 — 对标 H5 报告内错误 */}
            {!reportLoading && reportError && (
              <View className="fav-rp-error">
                <Text className="fav-rp-error-text">{reportError}</Text>
              </View>
            )}

            {/* 正常内容 — 对标 H5 L963 + reportArticle 渲染 */}
            {!reportLoading && analysisResult.article_paras.map((para, idx) => {
              if (idx === 0) {
                return <Text key={idx} className="fav-rp-title">{para}</Text>
              }
              if (idx === 1 && analysisResult.article_paras.length > 3) {
                return <Text key={idx} className="fav-rp-summary">{para}</Text>
              }
              if (idx === analysisResult.article_paras.length - 1 && analysisResult.article_paras.length > 3) {
                return <Text key={idx} className="fav-rp-conclusion">{para}</Text>
              }
              return <Text key={idx} className="fav-rp-para">{para}</Text>
            })}
          </View>

          {/* Mini Player — 对标 H5 L964-972 */}
          {(reportAudioCtx || analysisResult.audio_url) && (
            <View className="fav-mini-player">
              <View className="fav-progress-track">
                <View
                  className="fav-progress-fill"
                  style={{
                    width: `${reportDuration > 0 ? (reportCurrentTime / reportDuration) * 100 : 0}%`,
                  }}
                />
              </View>
              <View className="fav-progress-time">
                <Text>{formatTime(reportCurrentTime)}</Text>
                <Text>{formatTime(reportDuration)}</Text>
              </View>
            </View>
          )}

          {/* 操作栏 — 对标 H5 L973-979 */}
          <View className="fav-report-actions">
            <View className="fav-ra-btn fav-ra-btn--primary" onClick={handleAnalyze}>
              <Text className="fav-ra-text">{t('reAnalyze')}</Text>
            </View>
            {analysisResult.audio_url ? (
              <View
                className={`fav-ra-btn fav-ra-btn--play ${reportPlaying ? 'fav-ra-btn--playing' : ''}`}
                onClick={toggleReportPlay}
              >
                <Text className="fav-ra-text">{reportPlaying ? t('reportPause') : t('reportPlay')}</Text>
              </View>
            ) : (
              <View className="fav-ra-btn fav-ra-btn--disabled">
                <Text className="fav-ra-text">{t('reportPlay')}</Text>
              </View>
            )}
          </View>

          <View className="fav-safe-bottom" />
        </ScrollView>
      </View>
    )
  }

  // ============ 列表视图 — 对标 H5 L1604-1642 ============

  return (
    <View className={`fav-page${darkMode ? '' : ' fav-light'}`}>
      {/* Header — 与首页一致 */}
      <View className="fav-header" style={{ paddingTop: headerPaddingTop }}>
        <View className="fav-header-content">
          <View className="fav-logo-wrap">
            <View className="fav-logo-icon">
              <Text className="fav-logo-icon-text">🎙</Text>
            </View>
            <Text className="fav-logo-text">{t('appName')}</Text>
          </View>
        </View>
      </View>

      {/* AI 分析 Hero — 对标 H5 L933-945 */}
      {hasFavorites && (
        <View className="fav-hero">
          <View className={`fav-hero-inner ${darkMode ? '' : 'fav-hero-inner--light'}`}>
            <Text className="fav-hero-icon">🎙️</Text>
            <View className="fav-hero-content">
              <Text className="fav-hero-title">{t('aiAnalysis')}</Text>
              <Text className="fav-hero-desc">
                {analyzing
                  ? `${t('analyzing')}`
                  : analysisMeta
                    ? `${t('basedOn')} ${analysisMeta.newsCount} ${t('items')} · ${analysisMeta.time}`
                    : hasCachedAnalysis
                      ? `${favNews.length} 篇已收藏 · 可查看报告`
                      : t('aiDesc')}
              </Text>
            </View>
            {analyzing ? (
              <View className="fav-hero-btn fav-hero-btn--loading">
                <Text className="fav-hero-btn-text">{t('analyzing')}</Text>
              </View>
            ) : analysisMeta || hasCachedAnalysis ? (
              <View className="fav-hero-actions">
                <View className="fav-hero-btn fav-hero-btn--view" onClick={viewReport}>
                  <Text className="fav-hero-btn-text">{t('viewReport')}</Text>
                </View>
                <View className="fav-hero-btn fav-hero-btn--retry" onClick={handleAnalyze}>
                  <Text className="fav-hero-btn-text">{t('reAnalyze')}</Text>
                </View>
              </View>
            ) : (
              <View className="fav-hero-btn" onClick={handleAnalyze}>
                <Text className="fav-hero-btn-text">{t('startAnalysis')}</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* 收藏列表 — 对标 H5 card 样式 */}
      <ScrollView scrollY className="fav-list">
        <View className="fav-list-inner">
        {loading ? (
          <View className="fav-loading">
            <View className="fav-loading-spinner" />
            <Text className="fav-loading-text">{t('loading')}</Text>
          </View>
        ) : !hasFavorites ? (
          <View className="fav-empty">
            <Text className="fav-empty-icon">📚</Text>
            <Text className="fav-empty-title">{t('emptyFavTitle')}</Text>
            <Text className="fav-empty-desc">{t('emptyFavText')}</Text>
          </View>
        ) : favNews.length === 0 ? (
          <View className="fav-empty">
            <Text className="fav-empty-icon">📭</Text>
            <Text className="fav-empty-title">{t('newsExpired')}</Text>
            <Text className="fav-empty-desc">{t('emptyFavText')}</Text>
          </View>
        ) : (
          favNews.map((item) => {
            const emoji = CATEGORY_EMOJIS[item.category] || '📰'
            const catName = CATEGORY_NAMES[item.category] || item.category
            const title = getDisplayTitle(item)
            const summary = getDisplaySummary(item)
            const source = getDisplaySource(item)
            const dateStr = item.published_at || item.created_at || ''
            const shortDate = parseDate(dateStr)
            const isChinese = item.lang === 'zh' || (!item.lang && (item.title_zh || item.content_zh))
            const speak = speakingId === item.id

            return (
              <View
                key={item.id}
                className="fav-card"
                onClick={() => openDetail(item)}
              >
                {/* Card Header — 对标首页卡片 */}
                <View className="fav-card-hd">
                  <View className="fav-card-emoji">
                    <Text>{emoji}</Text>
                  </View>
                  <View className="fav-card-meta">
                    <View className="fav-card-tags">
                      {isChinese ? (
                        <Text className="fav-tag fav-tag--zh">中文</Text>
                      ) : (
                        <Text className="fav-tag fav-tag--en">EN</Text>
                      )}
                      <Text className="fav-tag fav-tag--cat">{catName}</Text>
                    </View>
                    <View className="fav-card-source-row">
                      <Text className="fav-card-source">{source}</Text>
                      {item.source_url && <Text className="fav-card-source-link"> ↗</Text>}
                    </View>
                  </View>
                </View>

                <View className="fav-card-bd">
                  <Text className="fav-card-title">{title}</Text>
                  <Text className="fav-card-summary">{summary}</Text>
                </View>

                <View className="fav-card-ft">
                  <Text className="fav-card-date">{shortDate}</Text>
                  <View className="fav-card-actions">
                    <View
                      className={`fav-act-btn ${speak ? 'fav-act-btn--active' : ''}`}
                      onClick={(e: any) => handleSpeak(item, e)}
                    >
                      <Text className="fav-act-text">
                        {speak ? t('stopSpeaking') : '🔊 ' + t('speak')}
                      </Text>
                    </View>
                    <View
                      className="fav-act-btn fav-act-btn--remove"
                      onClick={(e: any) => removeFavorite(item.id, e)}
                    >
                      <Text className="fav-act-text">{t('cancelFav')}</Text>
                    </View>
                  </View>
                </View>
              </View>
            )
          })
        )}
        <View className="fav-safe-bottom" />
        </View>
      </ScrollView>

      {/* ===== 详情底部弹出卡片 — 对标首页 idx-detail-overlay ===== */}
      {detailItem && (
        <View className="idx-detail-overlay" onClick={closeDetail} catchMove>
          <View
            className="idx-detail-sheet"
            onClick={(e: any) => e.stopPropagation()}
          >
            <View className="idx-detail-handle">
              <View className="idx-detail-handle-bar" />
            </View>

            <View className="idx-detail-hd">
              <Text className="idx-detail-title">{getDisplayTitle(detailItem)}</Text>
              <View className="idx-detail-meta">
                <Text className="idx-detail-source">{getDisplaySource(detailItem)}</Text>
                <Text className="idx-detail-date">{parseDate(detailItem.published_at || detailItem.created_at || '')}</Text>
              </View>
            </View>

            <View className="idx-detail-body">
              <Text className="idx-detail-content">
                {detailItem.content_zh || detailItem.content_en || detailItem.summary_zh || detailItem.summary_en || '暂无内容'}
              </Text>
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

            <View className="idx-detail-actions">
              <View
                className={`idx-detail-act ${speakingId === detailItem.id ? 'idx-detail-act--active' : ''}`}
                onClick={(e: any) => handleSpeak(detailItem, e)}
              >
                <Text>{speakingId === detailItem.id ? '⏸️' : '🔊'}</Text>
                <Text>{speakingId === detailItem.id ? t('stopSpeaking') : t('speak')}</Text>
              </View>
              <View className="idx-detail-act idx-detail-act--active" onClick={(e: any) => removeFavorite(detailItem.id, e)}>
                <Text>💔</Text>
                <Text>{t('cancelFav')}</Text>
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
