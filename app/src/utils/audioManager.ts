/**
 * 全局音频管理器
 *
 * 核心策略：
 * 1. 明确区分播放/暂停/停止状态
 * 2. pause/resume 用于同一条新闻的暂停/继续
 * 3. 停止/切换新闻时 destroy 并重建
 * 4. 支持云存储 fileID（cloud:// 格式）直接播放
 * 5. 降级使用 wx.cloud.callContainer 下载音频
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

// 云存储 fileID 类型
export type CloudFileId = string // 格式: cloud://{env}/{bucket}/{path}

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
 * 下载音频文件（支持多种音频源）
 *
 * 策略:
 * 1. MiniMax OSS 预签名 URL（https:// 开头）- 使用 wx.downloadFile 直接下载
 * 2. 微信云存储（cloud:// 开头）- 使用 wx.cloud.downloadFile 或 API 获取临时 URL
 * 3. 本地文件路径（/data/audio/ 开头）- 使用云托管 API（GET 方法）
 */
async function downloadAudio(urlOrFileId: string, newsId: string): Promise<string> {
  console.log('[Audio] downloadAudio called:', {
    urlOrFileId,
    newsId,
    CLOUD_ENV: CLOUD_ENV ? 'configured' : 'empty',
    CLOUD_SERVICE: CLOUD_SERVICE ? 'configured' : 'empty'
  })

  // 检查 URL 格式
  const isHttp = urlOrFileId.startsWith('http://') || urlOrFileId.startsWith('https://')
  const isCloud = urlOrFileId.startsWith('cloud://')
  const isLocal = urlOrFileId.startsWith('/data/audio/')
  console.log('[Audio] URL format check:', { isHttp, isCloud, isLocal, urlLength: urlOrFileId.length })

  // ========== 情况1: MiniMax OSS 预签名 URL（https:// 开头）==========
  if (isHttp) {
    console.log('[Audio] === Branch 1: Downloading from OSS URL ===')
    console.log('[Audio] URL preview:', urlOrFileId.substring(0, 100))
    return downloadFromUrl(urlOrFileId, newsId)
  }

  // ========== 情况2: 微信云存储（cloud:// 开头）==========
  if (urlOrFileId.startsWith('cloud://')) {
    return downloadFromCloudStorage(urlOrFileId, newsId)
  }

  // ========== 情况3: 本地文件路径（/data/audio/ 开头）==========
  if (urlOrFileId.startsWith('/data/audio/')) {
    return downloadViaCallContainer(urlOrFileId, newsId)
  }

  // ========== 未知格式 - 尝试云托管 API ==========
  console.warn('[Audio] Unknown format, trying callContainer:', urlOrFileId)
  return downloadViaCallContainer(urlOrFileId, newsId)
}

/**
 * 使用 wx.cloud.downloadFile 从云存储下载
 * 参考: https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloudrun/src/development/storage/miniapp/download.html
 */
async function downloadFromCloudStorage(cloudFileId: string, newsId: string): Promise<string> {
  console.log('[Audio] Downloading from cloud storage:', cloudFileId)

  try {
    // wx.cloud.downloadFile 会自动处理 cloud:// 格式的 fileID
    const res = await wx.cloud.downloadFile({
      fileID: cloudFileId,
    })

    console.log('[Audio] wx.cloud.downloadFile response:', {
      statusCode: res.statusCode,
      tempFilePath: res.tempFilePath,
    })

    if (res.statusCode !== 200 || !res.tempFilePath) {
      throw new Error(`Download failed: ${res.statusCode}`)
    }

    console.log('[Audio] Downloaded from cloud storage:', res.tempFilePath)
    return res.tempFilePath

  } catch (err) {
    console.error('[Audio] Cloud storage download failed, falling back to callContainer:', err)
    // 下载失败时，尝试从 API 获取临时链接
    return downloadViaApiTempUrl(cloudFileId, newsId)
  }
}

/**
 * 从 API 获取云存储文件的临时链接后下载
 */
async function downloadViaApiTempUrl(cloudFileId: string, newsId: string): Promise<string> {
  console.log('[Audio] Getting temp URL from API for:', cloudFileId)

  try {
    // 调用后端 API 获取临时链接
    const res = await wx.cloud.callContainer({
      config: { env: CLOUD_ENV },
      path: `/api/news/${newsId}/cloud-file`,
      method: 'GET',
      header: { 'X-WX-SERVICE': CLOUD_SERVICE },
    })

    if (res?.data?.temp_url) {
      // 使用临时链接下载
      const tempUrl = res.data.temp_url
      console.log('[Audio] Got temp URL:', tempUrl)

      // 下载到本地
      const tempFilePath = await downloadFromUrl(tempUrl, newsId)
      return tempFilePath
    }

    throw new Error('No temp URL in response')

  } catch (err) {
    console.error('[Audio] Get temp URL failed:', err)
    throw err
  }
}

/**
 * 从 URL 下载文件（使用 wx.downloadFile）
 * 微信小程序中 wx.downloadFile 不支持指定 filePath，必须使用返回的 tempFilePath
 */
async function downloadFromUrl(url: string, newsId: string): Promise<string> {
  const fs = wx.getFileSystemManager()

  console.log('[Audio] downloadFromUrl start:', { url: url.substring(0, 80), newsId })

  // 注意：微信小程序中 wx.downloadFile 不能指定 filePath，必须使用返回的 tempFilePath
  // tempFilePath 格式为 wxfile://usr/xxx.mp3
  const result = await new Promise<{ statusCode: number; tempFilePath?: string }>((resolve, reject) => {
    wx.downloadFile({
      url,
      success: (res) => {
        console.log('[Audio] wx.downloadFile success:', res)
        resolve(res)
      },
      fail: (err) => {
        console.error('[Audio] wx.downloadFile fail:', err)
        reject(err)
      }
    })
  })

  if (result.statusCode !== 200 || !result.tempFilePath) {
    throw new Error(`Download failed: ${result.statusCode}, tempFilePath: ${result.tempFilePath}`)
  }

  const finalPath = result.tempFilePath
  console.log('[Audio] Download completed:', finalPath)
  return finalPath
}

/**
 * 使用云托管 API 下载本地文件（GET 方法）
 * 本地文件路径格式: /data/audio/xxx.mp3
 */
async function downloadViaCallContainer(path: string, newsId: string): Promise<string> {
  console.log('[Audio] Downloading via callContainer:', path)

  // 如果是本地文件路径，使用 GET 方法获取文件流
  const apiPath = path.startsWith('/data/audio/')
    ? `/api/news/read${path}`
    : path

  const res = await wx.cloud.callContainer({
    config: {
      env: CLOUD_ENV,
    },
    path: apiPath,
    method: 'GET',
    header: {
      'X-WX-SERVICE': CLOUD_SERVICE,
    },
    responseType: 'arraybuffer',
  })

  console.log('[Audio] cloud.callContainer response:', {
    statusCode: res.statusCode,
    hasBuffer: !!res.buffer,
    bufferLength: res.buffer?.byteLength,
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
  console.log('[Audio] playReportAudio called:', {
    url: url?.substring(0, 100),
    urlLength: url?.length,
    urlPrefix: url?.substring(0, 30)
  })

  destroyAudioCtx()
  currentNewsId = null
  currentAudioUrl = null
  isPaused = false
  notifyStop()

  setTimeout(() => {
    const ctx = Taro.createInnerAudioContext()
    globalReportCtx = ctx
    isReportPlaying = true

    console.log('[Audio] playReportAudio: setting ctx.src =', url?.substring(0, 80))
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
