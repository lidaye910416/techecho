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
import Taro from '@tarojs/taro'
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
import './news.scss'

// ============ 常量 ============

const FAV_STORAGE_KEY = 'techecho_favorites'
const SETTINGS_STORAGE_KEY = 'techecho_settings'
const ANALYSIS_STATE_KEY = 'techecho_analysis_state'

// ============ 组件 ============

export default function News() {
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
      const raw = Taro.getStorageSync(ANALYSIS_STATE_KEY)
      if (!raw) return
      const cached = JSON.parse(raw)
      if (!cached || !cached.exists) return
      if (!cached.articleParas || cached.articleParas.length === 0) return

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

  // ============ 朗读单条 ============

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
        playSingleAudio(item.id, preGenAudio)
        return
      }

      const text = (item.summary_zh || item.content_zh || item.title_zh || '').slice(0, 800)
      const ttsRes = await ttsSpeak(text, voice)
      Taro.hideToast()

      if (ttsRes.success && ttsRes.data?.audio_url) {
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

    // 对标 H5 clearAnalysisState
    if (analysisResult) {
      if (reportAudioCtx) { reportAudioCtx.stop(); reportAudioCtx.destroy(); setReportAudioCtx(null) }
      setReportPlaying(false)
      setAnalysisResult(null)
      setReportCurrentTime(0)
      setReportDuration(0)
    }
    try { Taro.removeStorageSync(ANALYSIS_STATE_KEY) } catch (_) { /* ignore */ }
  }

  // ============ 导航 ============

  const openDetail = (item: NewsItem) => {
    Taro.navigateTo({ url: `/pages/read/read?id=${item.id}` })
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
    setReportLoading(true)
    setReportError('')
    setAnalysisResult({
      raw_text: '',
      news_count: 0,
      mode: '',
      article_paras: [],
      meta_html: t('analyzing'),
    })

    try {
      const res = await analyzeFavorites(favorites, 10)

      if (!res.success || !res.data?.raw_text) {
        setReportError(t('analysisFailed'))
        setAnalyzing(false)
        setReportLoading(false)
        return
      }

      const rawText = res.data.raw_text

      // 清理 + 分段 — 对标 H5 文本过滤
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

      setReportLoading(false)
      setAnalysisResult({
        raw_text: rawText,
        news_count: res.data.news_count,
        mode: res.data.mode,
        audio_url: res.data.audio_url,
        article_paras: articleParas,
        meta_html: metaHtml,
      })

      if (articleParas.length < 2) {
        setReportError(t('incomplete'))
      }

      // 持久化 — 对标 H5 localStorage
      Taro.setStorageSync(ANALYSIS_STATE_KEY, JSON.stringify({
        exists: true,
        articleParas,
        metaHtml,
        newsCount: res.data.news_count,
        mode: res.data.mode,
        audioUrl: res.data.audio_url,
        timestamp: now.toISOString(),
      }))

      // 自动 TTS
      if (!res.data.audio_url && rawText) {
        Taro.showToast({ title: t('speakGen'), icon: 'loading', duration: 20000 })
        try {
          const ttsRes = await ttsSpeak(rawText.slice(0, 2500), voice)
          Taro.hideToast()
          if (ttsRes.success && ttsRes.data?.audio_url) {
            setAnalysisResult((prev) => prev ? { ...prev, audio_url: ttsRes.data!.audio_url } : null)
            const st = Taro.getStorageSync(ANALYSIS_STATE_KEY)
            if (st) {
              const parsed = JSON.parse(st)
              parsed.audioUrl = ttsRes.data.audio_url
              Taro.setStorageSync(ANALYSIS_STATE_KEY, JSON.stringify(parsed))
            }
          }
        } catch (_) { Taro.hideToast() }
      }
    } catch (e: any) {
      console.error('Analysis error:', e)
      setReportError(e?.message || t('networkError'))
      setReportLoading(false)
    }
    setAnalyzing(false)
  }

  const closeReport = () => {
    if (reportAudioCtx) { reportAudioCtx.stop(); reportAudioCtx.destroy(); setReportAudioCtx(null) }
    setReportPlaying(false)
    setReportCurrentTime(0)
    setReportDuration(0)
    setReportError('')
    setReportLoading(false)
    setAnalysisResult(null)
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

  // ============ 报告视图 ============

  if (analysisResult) {
    return (
      <View className="fav-page">
        {/* 报告顶栏 — 对标 H5 L953-957 */}
        <View className="fav-report-topbar">
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
    <View className="fav-page">
      {/* Header — 与首页一致 */}
      <View className="fav-header">
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
          <View className="fav-hero-inner">
            <Text className="fav-hero-icon">🎙️</Text>
            <View className="fav-hero-content">
              <Text className="fav-hero-title">{t('aiAnalysis')}</Text>
              <Text className="fav-hero-desc">{t('aiDesc')}</Text>
            </View>
            <View
              className={`fav-hero-btn ${analyzing ? 'fav-hero-btn--loading' : ''}`}
              onClick={handleAnalyze}
            >
              <Text className="fav-hero-btn-text">
                {analyzing ? t('analyzing') : t('startAnalysis')}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* 收藏列表 — 对标 H5 card 样式 */}
      <ScrollView scrollY className="fav-list">
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
      </ScrollView>
    </View>
  )
}
