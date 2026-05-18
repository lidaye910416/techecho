/**
 * 全局音频管理器
 *
 * 核心策略：
 * 1. 明确区分播放/暂停/停止状态
 * 2. pause/resume 用于同一条新闻的暂停/继续
 * 3. 停止/切换新闻时 destroy 并重建
 */

import Taro from '@tarojs/taro'

export const AUDIO_STOP_EVENT = 'techecho_audio_stop_all'
export const AUDIO_START_EVENT = 'techecho_audio_start'
export const AUDIO_PAUSE_EVENT = 'techecho_audio_pause'
export const AUDIO_RESUME_EVENT = 'techecho_audio_resume'
export const AUDIO_SWITCH_EVENT = 'techecho_audio_switch'
export const AUDIO_LOADING_EVENT = 'techecho_audio_loading'
export const AUDIO_REPORT_PAUSE_EVENT = 'techecho_audio_report_pause'
export const AUDIO_REPORT_RESUME_EVENT = 'techecho_audio_report_resume'

export interface AudioItem {
  newsId: string
  url: string
  source: string
}

// 全局状态
let currentNewsId: string | null = null
let currentAudioUrl: string | null = null
// 全局音频上下文（导出供外部访问）
export let globalAudioCtx: Taro.InnerAudioContext | null = null
export let globalReportCtx: Taro.InnerAudioContext | null = null
let isReportPlaying = false
let isPaused = false

// 回调函数
type StopCallback = () => void
type StartCallback = (item: AudioItem) => void
let stopCallbacks: StopCallback[] = []
let startCallbacks: StartCallback[] = []

export function onAudioStop(callback: StopCallback) {
  stopCallbacks.push(callback)
  return () => { stopCallbacks = stopCallbacks.filter(cb => cb !== callback) }
}

export function onAudioStart(callback: StartCallback) {
  startCallbacks.push(callback)
  return () => { startCallbacks = startCallbacks.filter(cb => cb !== callback) }
}

function notifyStop() {
  stopCallbacks.forEach(cb => cb())
  Taro.eventCenter.trigger(AUDIO_STOP_EVENT)
}

function notifyStart(item: AudioItem) {
  startCallbacks.forEach(cb => cb(item))
  Taro.eventCenter.trigger(AUDIO_START_EVENT, item)
}

function notifyPause(newsId: string) {
  Taro.eventCenter.trigger(AUDIO_PAUSE_EVENT, { newsId })
}

function notifyResume(newsId: string) {
  Taro.eventCenter.trigger(AUDIO_RESUME_EVENT, { newsId })
}

function notifySwitch(oldNewsId: string | null, newNewsId: string) {
  Taro.eventCenter.trigger(AUDIO_SWITCH_EVENT, { oldNewsId, newNewsId })
}

function notifyLoading(newsId: string) {
  Taro.eventCenter.trigger(AUDIO_LOADING_EVENT, { newsId })
}

function notifyReportPause() {
  Taro.eventCenter.trigger(AUDIO_REPORT_PAUSE_EVENT)
}

function notifyReportResume() {
  Taro.eventCenter.trigger(AUDIO_REPORT_RESUME_EVENT)
}

/** 销毁音频上下文 */
function destroyAudioCtx() {
  if (globalAudioCtx) {
    try {
      globalAudioCtx.stop()
    } catch (e) { /* ignore */ }
    try {
      globalAudioCtx.destroy()
    } catch (e) { /* ignore */ }
    globalAudioCtx = null
  }
  isPaused = false
}

/**
 * 停止所有音频
 */
export function stopAllAudio() {
  destroyAudioCtx()
  currentNewsId = null
  currentAudioUrl = null
  isPaused = false
  notifyStop()
}

/**
 * 播放新闻音频
 * 策略：
 * 1. 先下载音频到本地
 * 2. 播放本地文件（避免跨域和认证问题）
 */
export function playNewsAudio(newsId: string, url: string, source: string) {
  const audioUrl = url.startsWith('http') ? url : url

  // 情况1: 同一条新闻暂停中 → 继续播放
  if (currentNewsId === newsId && isPaused && globalAudioCtx) {
    isPaused = false
    try {
      globalAudioCtx.play()
    } catch (e) {
      destroyAudioCtx()
    }
    notifyResume(newsId)
    return
  }

  // 情况2: 同一条新闻播放中 → 暂停
  if (currentNewsId === newsId && !isPaused && globalAudioCtx) {
    isPaused = true
    try {
      globalAudioCtx.pause()
    } catch (e) { /* ignore */ }
    notifyPause(newsId)
    return
  }

  // 情况3: 不同新闻 → 停止旧音频，播放新音频
  const oldNewsId = currentNewsId

  // 立即更新状态
  currentNewsId = newsId
  currentAudioUrl = audioUrl
  isPaused = false

  // 通知旧音频被停止
  if (oldNewsId && oldNewsId !== newsId) {
    notifySwitch(oldNewsId, newsId)
  }

  // 通知新音频正在加载
  notifyLoading(newsId)

  // 销毁旧音频
  destroyAudioCtx()

  // 下载音频文件到本地，再播放（避免直接播放远程URL的问题）
  downloadAndPlay(newsId, audioUrl)
}

/**
 * 下载音频文件到本地，然后播放
 */
function downloadAndPlay(newsId: string, url: string) {
  // 如果是相对路径，跳过下载直接播放
  if (!url.startsWith('http')) {
    playDirectly(newsId, url)
    return
  }

  wx.downloadFile({
    url: url,
    success: (res) => {
      if (res.statusCode === 200 && res.tempFilePath) {
        playDirectly(newsId, res.tempFilePath)
      } else {
        console.error('[Audio] download failed:', res)
        notifyStop()
      }
    },
    fail: (err) => {
      console.error('[Audio] download error:', err)
      // 下载失败时尝试直接播放（某些URL可能可以直接播放）
      playDirectly(newsId, url)
    }
  })
}

/**
 * 直接播放音频（本地路径或远程URL）
 */
function playDirectly(newsId: string, path: string) {
  setTimeout(() => {
    if (currentNewsId !== newsId) return

    const ctx = Taro.createInnerAudioContext()
    globalAudioCtx = ctx

    ctx.volume = 1.0
    ctx.obeyMuteSwitch = false
    ctx.src = path

    ctx.onPlay(() => {
      isPaused = false
    })

    ctx.onEnded(() => {
      isPaused = false
      currentNewsId = null
      currentAudioUrl = null
      globalAudioCtx = null
      notifyStop()
    })

    ctx.onStop(() => {
      // ignore
    })

    ctx.onError(() => {
      console.error('[Audio] play error for:', path)
      isPaused = false
      currentNewsId = null
      globalAudioCtx = null
      notifyStop()
    })

    // 延迟播放
    setTimeout(() => {
      if (globalAudioCtx === ctx && currentNewsId === newsId) {
        try {
          ctx.play()
        } catch (e) { /* ignore */ }
      }
    }, 100)
  }, 50)
}

/**
 * 获取当前播放状态
 */
export function getPlayingInfo() {
  return {
    newsId: currentNewsId,
    source: null,
    isPlaying: !!currentNewsId && !isPaused,
    isPaused: isPaused,
  }
}

export function getReportPlaying(): boolean {
  return isReportPlaying
}

/**
 * 播放报告音频
 */
export function playReportAudio(url: string) {
  destroyAudioCtx()
  currentNewsId = null
  currentAudioUrl = null
  isPaused = false
  notifyStop()

  setTimeout(() => {
    const ctx = Taro.createInnerAudioContext()
    globalReportCtx = ctx
    isReportPlaying = true

    ctx.src = url
    ctx.autoplay = true
    ctx.obeyMuteSwitch = false

    ctx.onPlay(() => {
      notifyStart({ newsId: '__report__', url, source: 'report' })
    })

    ctx.onEnded(() => {
      globalReportCtx = null
      isReportPlaying = false
      notifyStop()
    })

    ctx.onStop(() => {
      globalReportCtx = null
      isReportPlaying = false
    })

    ctx.onError(() => {
      globalReportCtx = null
      isReportPlaying = false
      notifyStop()
    })
  }, 0)
}

/**
 * 暂停/继续报告
 */
export function toggleReportPlay() {
  const ctx = globalReportCtx
  if (!ctx) return

  if (isReportPlaying) {
    ctx.pause()
    isReportPlaying = false
    notifyReportPause()
  } else {
    ctx.play()
    isReportPlaying = true
    notifyReportResume()
  }
}

/**
 * 暂停报告
 */
export function pauseReport() {
  const ctx = globalReportCtx
  if (!ctx || !isReportPlaying) return
  ctx.pause()
  isReportPlaying = false
  notifyReportPause()
}

/**
 * 继续播放报告
 */
export function resumeReport() {
  const ctx = globalReportCtx
  if (!ctx || isReportPlaying) return
  ctx.play()
  isReportPlaying = true
  notifyReportResume()
}
