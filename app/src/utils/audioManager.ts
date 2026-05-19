/**
 * 全局音频管理器
 *
 * 核心策略：
 * 1. 明确区分播放/暂停/停止状态
 * 2. pause/resume 用于同一条新闻的暂停/继续
 * 3. 停止/切换新闻时 destroy 并重建
 * 4. 使用 wx.cloud.callContainer 下载音频（云托管模式）
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

// 云托管配置（从编译时常量读取）
const CLOUD_ENV = process.env.TARO_APP_CLOUD_ENV || ''
const CLOUD_SERVICE = process.env.TARO_APP_CLOUD_SERVICE || ''

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
 * 下载音频文件（使用 wx.cloud.callContainer）
 */
async function downloadAudio(path: string, newsId: string): Promise<string> {
  console.log('[Audio] downloadAudio called:', { path, newsId, CLOUD_ENV, CLOUD_SERVICE })

  // 使用 wx.cloud.callContainer 下载音频（PUT 方法）
  const res = await wx.cloud.callContainer({
    config: {
      env: CLOUD_ENV,
    },
    path: path,
    method: 'PUT',
    header: {
      'X-WX-SERVICE': CLOUD_SERVICE,
      'Content-Type': 'application/json',
    },
    responseType: 'arraybuffer',
  })
  
  console.log('[Audio] cloud.callContainer response:', {
    statusCode: res.statusCode,
    dataType: typeof res.data,
    hasBuffer: !!res.buffer,
    bufferLength: res.buffer?.byteLength,
    dataLength: res.data?.byteLength,
  })

  if (res.statusCode !== 200) {
    throw new Error(`API request failed: ${res.statusCode}`)
  }

  const tempFilePath = `${wx.env.USER_DATA_PATH}/${newsId}.mp3`
  const fs = wx.getFileSystemManager()
  const buffer = res.buffer || res.data
  
  if (!buffer) {
    throw new Error('No audio data received')
  }
  
  const base64 = wx.arrayBufferToBase64(buffer)
  console.log('[Audio] Converted to base64, length:', base64.length)

  await new Promise<void>((resolve, reject) => {
    fs.writeFile({
      filePath: tempFilePath,
      data: base64,
      encoding: 'base64',
      success: () => {
        console.log('[Audio] Write file success:', tempFilePath)
        resolve()
      },
      fail: (err) => {
        console.error('[Audio] Write file failed:', err)
        reject(err)
      }
    })
  })

  return tempFilePath
}

/**
 * 播放新闻音频
 * 策略：
 * 1. 同一条新闻暂停中 → resume
 * 2. 同一条新闻播放中 → pause
 * 3. 不同新闻 → stop 后播放
 */
export function playNewsAudio(newsId: string, url: string, source: string) {
  console.log('[Audio] playNewsAudio called:', { newsId, url, source, currentNewsId, isPaused })

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

  currentNewsId = newsId
  currentAudioUrl = url
  isPaused = false

  if (oldNewsId && oldNewsId !== newsId) {
    notifySwitch(oldNewsId, newsId)
  }

  notifyLoading(newsId)
  destroyAudioCtx()

  // 下载音频文件到本地，然后播放
  console.log('[Audio] Downloading audio from:', url)
  downloadAudio(url, newsId)
    .then((localPath) => {
      console.log('[Audio] Audio downloaded to:', localPath)
      if (currentNewsId !== newsId) return

      const ctx = Taro.createInnerAudioContext()
      globalAudioCtx = ctx
      ctx.volume = 1.0
      ctx.obeyMuteSwitch = false
      ctx.src = localPath

      console.log('[Audio] InnerAudioContext created, src:', ctx.src)

      ctx.onPlay(() => {
        console.log('[Audio] onPlay triggered')
        isPaused = false
      })

      ctx.onEnded(() => {
        console.log('[Audio] onEnded triggered')
        isPaused = false
        currentNewsId = null
        currentAudioUrl = null
        globalAudioCtx = null
        notifyStop()
      })

      ctx.onError((err) => {
        console.error('[Audio] onError triggered:', err)
        isPaused = false
        currentNewsId = null
        globalAudioCtx = null
        notifyStop()
      })

      setTimeout(() => {
        if (globalAudioCtx === ctx && currentNewsId === newsId) {
          try {
            console.log('[Audio] Calling ctx.play()...')
            ctx.play()
          } catch (e) {
            console.error('[Audio] ctx.play() failed:', e)
          }
        }
      }, 100)
    })
    .catch((err) => {
      console.error('[Audio] Download failed:', err)
      notifyStop()
    })
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
