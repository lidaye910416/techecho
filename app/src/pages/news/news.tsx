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

import { useState, useEffect, useRef } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import {
  getNewsList,
  ttsSpeak,
  getAudioUrl,
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
import {
  playNewsAudio,
  playReportAudio,
  stopAllAudio,
  toggleReportPlay as toggleReportPlayGlobal,
  pauseReport,
  resumeReport,
  onAudioStop,
  onAudioStart,
  AUDIO_STOP_EVENT,
  AUDIO_START_EVENT,
  AUDIO_PAUSE_EVENT,
  AUDIO_RESUME_EVENT,
  AUDIO_SWITCH_EVENT,
  AUDIO_LOADING_EVENT,
  AUDIO_REPORT_PAUSE_EVENT,
  AUDIO_REPORT_RESUME_EVENT,
  getPlayingInfo,
  getReportPlaying,
  globalAudioCtx,
  globalReportCtx,
} from '../../utils/audioManager'
import './news.scss'

// ============ 常量 ============

const FAV_STORAGE_KEY = 'techecho_favorites'
const SETTINGS_STORAGE_KEY = 'techecho_settings'
const ANALYSIS_STATE_KEY = 'techecho_analysis_state'
const TTS_USED_KEY = 'techecho_tts_used'  // TTS 使用标记（一次性）
const TTS_CACHE_KEY = 'techecho_tts_cache'  // TTS 音频缓存

// 语音风格名称映射
const VOICE_NAMES: Record<string, string> = {
  voice1: '沉稳男声',
  voice2: '清朗男声',
  voice3: '温婉女声',
  voice4: '清新女声',
}

// 全局音频标识
const AUDIO_SOURCE = 'fav'

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
  const [pausedId, setPausedId] = useState<string | null>(null)  // 暂停的新闻ID
  const [loadingId, setLoadingId] = useState<string | null>(null)  // 正在加载的新闻ID

  // 判断是否正在播放（包括播放中或暂停中）
  const isSpeaking = (id: string) => speakingId === id || pausedId === id

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

  // 监听全局音频状态
  useEffect(() => {
    const handleStop = () => {
      setSpeakingId(null)
      setPausedId(null)
      setLoadingId(null)
      setReportPlaying(false)
      setReportCurrentTime(0)
      clearReportTimer()
    }

    const handleStart = (item: { newsId: string; source: string }) => {
      // 如果是来自其他页面的播放，停止当前页面的新闻播放
      if (item.source !== AUDIO_SOURCE && item.newsId !== '__report__') {
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

    // 切换音频：旧音频被停止，新音频开始加载
    const handleSwitch = (data: { oldNewsId: string | null; newNewsId: string }) => {
      if (data.oldNewsId) {
        setSpeakingId(null)
        setPausedId(null)
      }
    }

    // 新音频正在加载
    const handleLoading = (data: { newsId: string }) => {
      setLoadingId(data.newsId)
      setSpeakingId(data.newsId)
      setPausedId(null)
    }

    // 报告暂停
    const handleReportPause = () => {
      setReportPlaying(false)
    }

    // 报告继续播放
    const handleReportResume = () => {
      setReportPlaying(true)
    }

    // 使用回调方式监听
    const unsubStop = onAudioStop(handleStop)
    const unsubStart = onAudioStart(handleStart)

    // 也监听事件
    Taro.eventCenter.on(AUDIO_STOP_EVENT, handleStop)
    Taro.eventCenter.on(AUDIO_START_EVENT, handleStart)
    Taro.eventCenter.on(AUDIO_PAUSE_EVENT, handlePause)
    Taro.eventCenter.on(AUDIO_RESUME_EVENT, handleResume)
    Taro.eventCenter.on(AUDIO_SWITCH_EVENT, handleSwitch)
    Taro.eventCenter.on(AUDIO_LOADING_EVENT, handleLoading)
    Taro.eventCenter.on(AUDIO_REPORT_PAUSE_EVENT, handleReportPause)
    Taro.eventCenter.on(AUDIO_REPORT_RESUME_EVENT, handleReportResume)

    return () => {
      unsubStop()
      unsubStart()
      Taro.eventCenter.off(AUDIO_STOP_EVENT, handleStop)
      Taro.eventCenter.off(AUDIO_START_EVENT, handleStart)
      Taro.eventCenter.off(AUDIO_PAUSE_EVENT, handlePause)
      Taro.eventCenter.off(AUDIO_RESUME_EVENT, handleResume)
      Taro.eventCenter.off(AUDIO_SWITCH_EVENT, handleSwitch)
      Taro.eventCenter.off(AUDIO_LOADING_EVENT, handleLoading)
      Taro.eventCenter.off(AUDIO_REPORT_PAUSE_EVENT, handleReportPause)
      Taro.eventCenter.off(AUDIO_REPORT_RESUME_EVENT, handleReportResume)
    }
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

  /** 检查是否已有该新闻的 TTS 缓存 */
  const getCachedAudio = (newsId: string, voiceId: string): string | null => {
    try {
      const raw = Taro.getStorageSync(TTS_CACHE_KEY)
      if (!raw) return null
      const cache: Record<string, Record<string, string>> = JSON.parse(raw)
      return cache[newsId]?.[voiceId] || null
    } catch (_) { return null }
  }

  /** 缓存 TTS 音频 */
  const cacheAudio = (newsId: string, voiceId: string, audioUrl: string) => {
    try {
      const raw = Taro.getStorageSync(TTS_CACHE_KEY)
      const cache: Record<string, Record<string, string>> = raw ? JSON.parse(raw) : {}
      if (!cache[newsId]) cache[newsId] = {}
      cache[newsId][voiceId] = audioUrl
      Taro.setStorageSync(TTS_CACHE_KEY, JSON.stringify(cache))
    } catch (_) { /* ignore */ }
  }

  /** 检查用户是否已登录 */
  const isLoggedIn = (): boolean => {
    try { return !!Taro.getStorageSync('auth_token') } catch (_) { return false }
  }

  /** 检查 TTS 是否已使用（一次性机会） */
  const isTTSUsed = (): boolean => {
    try { return !!Taro.getStorageSync(TTS_USED_KEY) } catch (_) { return false }
  }

  /** 标记 TTS 已使用 */
  const markTTSUsed = () => {
    try { Taro.setStorageSync(TTS_USED_KEY, '1') } catch (_) { /* ignore */ }
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

  /** 提示用户登录 */
  const promptLogin = () => {
    Taro.showModal({
      title: t('needLogin'),
      content: t('needLoginContent'),
      confirmText: t('goToLogin'),
      cancelText: t('later'),
      success: (res) => {
        if (res.confirm) {
          Taro.switchTab({ url: '/pages/mine/mine' })
        }
      },
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
      playSingleAudio(item.id, audioUrl)
    } else {
      Taro.showToast({ title: '无可用语音', icon: 'none' })
    }
  }

  /** 播放音频 */
  const playSingleAudio = (newsId: string, url: string) => {
    const audioUrl = url.startsWith('http') ? url : getAudioUrl(url)
    console.log('[Fav] playSingleAudio:', newsId, 'url:', audioUrl)

    // 使用全局音频管理器
    playNewsAudio(newsId, audioUrl, AUDIO_SOURCE)

    // 更新本地状态
    setSpeakingId(newsId)
  }

  /** 请求 TTS（实时语音生成）- 登录用户只有一次机会）*/
  const requestTTS = async (item: NewsItem, voiceId: string) => {
    if (!isLoggedIn()) {
      promptLogin()
      return
    }

    // 检查是否已有缓存（同一新闻可直接播放）
    const cached = getCachedAudio(item.id, voiceId)
    if (cached) {
      playSingleAudio(item.id, cached)
      return
    }

    // 检查 TTS 机会是否已用完
    if (isTTSUsed()) {
      promptTTSLimit()
      return
    }

    Taro.showToast({ title: t('speakGen'), icon: 'loading', duration: 10000 })

    try {
      const text = (item.summary_zh || item.content_zh || item.title_zh || '').slice(0, 800)
      const ttsRes = await ttsSpeak(text, voiceId)
      Taro.hideToast()

      if (ttsRes.success && ttsRes.data?.audio_url) {
        // 缓存音频 URL
        cacheAudio(item.id, voiceId, ttsRes.data.audio_url)
        // 标记 TTS 已用完
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
      playSingleAudio(item.id, preGenAudio)
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

  /** 安全解析日期字符串（兼容 iOS 和各种格式） */
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
    return `${d.getMonth() + 1}月${d.getDate()}日`
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
    // 使用全局音频管理器停止报告音频
    if (globalReportCtx) {
      try {
        globalReportCtx.stop()
        globalReportCtx.destroy()
      } catch (e) { /* ignore */ }
    }
    clearReportTimer()
    setReportPlaying(false)
    setReportCurrentTime(0)
    setReportDuration(0)
    setReportError('')
    setReportLoading(false)
    setAnalysisResult(null)
    // 回到列表视图，Hero 卡片保留 analysisMeta 显示两个按钮
  }

  // ============ 报告 TTS 生成（仅限一次）============

  /** 检查用户是否已登录 */
  const isReportLoggedIn = (): boolean => {
    try { return !!Taro.getStorageSync('auth_token') } catch (_) { return false }
  }

  /** 检查报告 TTS 实时调用是否已使用 */
  const isReportTTSUsed = (): boolean => {
    try { return !!Taro.getStorageSync('techecho_report_tts_used') } catch (_) { return false }
  }

  /** 标记报告 TTS 已使用 */
  const markReportTTSUsed = () => {
    try { Taro.setStorageSync('techecho_report_tts_used', '1') } catch (_) { /* ignore */ }
  }

  /** 提示报告需要登录微信 */
  const promptReportLogin = () => {
    Taro.showModal({
      title: t('needLogin'),
      content: '实时语音生成仅限登录用户使用。是否前往登录？',
      confirmText: t('goToLogin'),
      cancelText: t('later'),
      success: (res) => {
        if (res.confirm) {
          Taro.switchTab({ url: '/pages/mine/mine' })
        }
      },
    })
  }

  /** 提示报告 TTS 次数已用完 */
  const promptReportTTSLimit = () => {
    Taro.showModal({
      title: t('ttsLimitReached'),
      content: t('ttsLimitContent'),
      showCancel: false,
      confirmText: t('gotIt'),
    })
  }

  // 报告音频进度定时器
  const reportTimerRef = useRef<number | null>(null)

  // 清理报告进度定时器
  const clearReportTimer = () => {
    if (reportTimerRef.current !== null) {
      clearInterval(reportTimerRef.current)
      reportTimerRef.current = null
    }
  }

  // 启动报告音频进度更新
  const startReportTimer = () => {
    clearReportTimer()
    reportTimerRef.current = setInterval(() => {
      const ctx = globalReportCtx
      if (ctx && ctx.duration) {
        setReportCurrentTime(ctx.currentTime || 0)
        setReportDuration(ctx.duration || 0)
      }
    }, 500) as unknown as number
  }

  // 监听报告音频事件，更新进度
  useEffect(() => {
    if (!analysisResult) return

    const handleReportPlay = () => {
      setReportPlaying(true)
      startReportTimer()
    }

    const handleReportStop = () => {
      setReportPlaying(false)
      setReportCurrentTime(0)
      clearReportTimer()
    }

    Taro.eventCenter.on(AUDIO_START_EVENT, handleReportPlay)
    Taro.eventCenter.on(AUDIO_STOP_EVENT, handleReportStop)
    Taro.eventCenter.on(AUDIO_REPORT_PAUSE_EVENT, handleReportStop)
    Taro.eventCenter.on(AUDIO_REPORT_RESUME_EVENT, handleReportPlay)

    return () => {
      Taro.eventCenter.off(AUDIO_START_EVENT, handleReportPlay)
      Taro.eventCenter.off(AUDIO_STOP_EVENT, handleReportStop)
      Taro.eventCenter.off(AUDIO_REPORT_PAUSE_EVENT, handleReportStop)
      Taro.eventCenter.off(AUDIO_REPORT_RESUME_EVENT, handleReportPlay)
      clearReportTimer()
    }
  }, [analysisResult])

  /**
   * 报告播放/暂停切换
   * 对标首页 handleSpeak 的播放逻辑
   */
  const toggleReportPlay = () => {
    if (!analysisResult?.audio_url) return

    const isCurrentlyPlaying = getReportPlaying()

    if (isCurrentlyPlaying) {
      // 正在播放 → 暂停（调用全局管理器，会触发 AUDIO_REPORT_PAUSE_EVENT）
      toggleReportPlayGlobal()
      // reportPlaying 状态会在 handleReportPause 中更新
    } else if (globalReportCtx) {
      // 暂停中 → 继续播放
      resumeReport()
      // reportPlaying 状态会在 handleReportResume 中更新
    } else {
      // 还没有播放过 → 开始播放
      playReport(analysisResult.audio_url)
    }
  }

  /**
   * 播放报告音频
   * 先停止新闻音频，再播放报告
   */
  const playReport = (url: string) => {
    // 先停止新闻音频（保持与首页一致的逻辑）
    stopAllAudio()

    // 更新本地新闻播放状态
    setSpeakingId(null)
    setPausedId(null)

    // 播放报告音频
    playReportAudio(url)
    setReportPlaying(true)
    startReportTimer()
  }

  /**
   * 请求报告 TTS 语音生成
   * 分析报告的 TTS 只有一次限制
   */
  const requestReportTTS = async () => {
    if (!analysisResult) return

    Taro.showToast({ title: t('speakGen'), icon: 'loading', duration: 15000 })

    // 检查登录状态
    if (!isReportLoggedIn()) {
      Taro.hideToast()
      promptReportLogin()
      return
    }

    // 检查 TTS 次数限制（分析报告只有一次）
    if (isReportTTSUsed()) {
      Taro.hideToast()
      promptReportTTSLimit()
      return
    }

    try {
      const rawText = analysisResult.raw_text || ''
      const ttsRes = await ttsSpeak(rawText.slice(0, 2500), voice)
      Taro.hideToast()

      if (ttsRes.success && ttsRes.data?.audio_url) {
        // 标记 TTS 已使用（仅限一次）
        markReportTTSUsed()

        // 更新 analysisResult 的 audio_url
        setAnalysisResult(prev => prev ? { ...prev, audio_url: ttsRes.data!.audio_url } : null)

        // 同时更新缓存
        try {
          const raw = Taro.getStorageSync(ANALYSIS_STATE_KEY)
          if (raw) {
            const cached = JSON.parse(raw)
            cached.audioUrl = ttsRes.data.audio_url
            Taro.setStorageSync(ANALYSIS_STATE_KEY, JSON.stringify(cached))
          }
        } catch (_) { /* ignore */ }

        // 播放生成的音频
        playReport(ttsRes.data.audio_url)
      } else {
        Taro.showToast({ title: t('speakFailed'), icon: 'none' })
      }
    } catch (e) {
      console.error('Report TTS failed:', e)
      Taro.hideToast()
      Taro.showToast({ title: t('speakUnavail'), icon: 'none' })
    }
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
          {(reportPlaying || globalReportCtx) && analysisResult.audio_url && (
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

          {/* 操作栏 — 对标首页 handleSpeak 逻辑 */}
          <View className="fav-report-actions">
            <View className="fav-ra-btn fav-ra-btn--primary" onClick={handleAnalyze}>
              <Text className="fav-ra-text">{t('reAnalyze')}</Text>
            </View>

            {/* 报告播放按钮 — 对标首页播放逻辑 */}
            {analysisResult.audio_url ? (
              <View
                className={`fav-ra-btn fav-ra-btn--play ${reportPlaying ? 'fav-ra-btn--playing' : ''}`}
                onClick={toggleReportPlay}
              >
                <Text className="fav-ra-text">
                  {reportPlaying ? t('reportPause') : t('reportPlay')}
                </Text>
              </View>
            ) : isReportTTSUsed() ? (
              // TTS 次数已用完，显示禁用状态
              <View className="fav-ra-btn fav-ra-btn--disabled">
                <Text className="fav-ra-text">{t('reportPlay')}</Text>
              </View>
            ) : (
              // 未生成过语音，显示生成按钮
              <View
                className="fav-ra-btn fav-ra-btn--play"
                onClick={requestReportTTS}
              >
                <Text className="fav-ra-text">🎙 {t('reportGenVoice')}</Text>
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
            const speak = speakingId === item.id || pausedId === item.id

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
                        {speakingId === item.id ? t('stopSpeaking') :
                         pausedId === item.id ? '▶️ ' + t('speak') :
                         '🔊 ' + t('speak')}
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
                className={`idx-detail-act ${isSpeaking(detailItem.id) ? 'idx-detail-act--active' : ''}`}
                onClick={(e: any) => handleSpeak(detailItem, e)}
              >
                <Text>{speakingId === detailItem.id ? '⏹' : pausedId === detailItem.id ? '▶️' : '🔊'}</Text>
                <Text>{speakingId === detailItem.id ? t('stopSpeaking') : pausedId === detailItem.id ? t('speak') : t('speak')}</Text>
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
