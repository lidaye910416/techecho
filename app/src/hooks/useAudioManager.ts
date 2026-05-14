/**
 * 全局音频管理器 - 跨页面统一管理音频播放
 * 
 * 问题：当首页和收藏页各自维护音频上下文时，
 *       可能出现两个页面同时播放的问题。
 * 
 * 解决：使用全局单例 + 事件通知，确保整个应用只有一个音频在播放
 */

import Taro from '@tarojs/taro'
import { useState, useEffect, useCallback, useRef } from 'react'

// 全局事件
const AUDIO_STOP_EVENT = 'techecho_audio_stop'
const AUDIO_START_EVENT = 'techecho_audio_start'

export interface AudioInfo {
  newsId: string | null
  url: string | null
  playing: boolean
  reportPlaying?: boolean
  reportUrl?: string | null
}

// 全局音频上下文引用（模块级单例）
let globalAudioCtx: Taro.InnerAudioContext | null = null
let globalPlayingId: string | null = null
let globalReportCtx: Taro.InnerAudioContext | null = null

/**
 * 跨页面音频管理 hook
 * 
 * 用法：
 *   const { audioInfo, playNews, stopAll, audioCtxRef } = useAudioManager()
 * 
 * - 所有页面共享同一个音频实例
 * - 播放新音频时自动停止之前的
 * - 通过事件通知其他页面状态变化
 */
export function useAudioManager() {
  const [audioInfo, setAudioInfo] = useState<AudioInfo>({
    newsId: null,
    url: null,
    playing: false,
    reportPlaying: false,
    reportUrl: null,
  })

  // 本地引用（用于当前页面的音频控制）
  const audioCtxRef = useRef<Taro.InnerAudioContext | null>(null)
  const reportAudioCtxRef = useRef<Taro.InnerAudioContext | null>(null)

  // 停止全局音频
  const stopGlobalAudio = useCallback(() => {
    if (globalAudioCtx) {
      try {
        globalAudioCtx.stop()
        globalAudioCtx.destroy()
      } catch (e) { /* ignore */ }
      globalAudioCtx = null
    }
    globalPlayingId = null
  }, [])

  // 停止报告音频
  const stopReportAudio = useCallback(() => {
    if (globalReportCtx) {
      try {
        globalReportCtx.stop()
        globalReportCtx.destroy()
      } catch (e) { /* ignore */ }
      globalReportCtx = null
    }
  }, [])

  // 停止所有音频
  const stopAll = useCallback(() => {
    stopGlobalAudio()
    stopReportAudio()
    setAudioInfo(prev => ({
      ...prev,
      newsId: null,
      url: null,
      playing: false,
      reportPlaying: false,
    }))
    // 通知其他页面
    Taro.eventCenter.trigger(AUDIO_STOP_EVENT)
  }, [stopGlobalAudio, stopReportAudio])

  // 播放新闻音频
  const playNews = useCallback((newsId: string, url: string) => {
    // 1. 先停止当前播放（包括报告音频）
    stopAll()

    // 2. 延迟创建新上下文
    setTimeout(() => {
      const ctx = Taro.createInnerAudioContext()
      globalAudioCtx = ctx
      globalPlayingId = newsId

      ctx.src = url
      ctx.autoplay = true
      ctx.volume = 1.0
      ctx.obeyMuteSwitch = false

      ctx.onPlay(() => {
        setAudioInfo(prev => ({ ...prev, newsId, url, playing: true }))
        audioCtxRef.current = ctx
        // 通知其他页面
        Taro.eventCenter.trigger(AUDIO_START_EVENT, { newsId, url })
      })

      ctx.onEnded(() => {
        globalAudioCtx = null
        globalPlayingId = null
        setAudioInfo(prev => ({ ...prev, newsId: null, url: null, playing: false }))
        audioCtxRef.current = null
        Taro.eventCenter.trigger(AUDIO_STOP_EVENT)
      })

      ctx.onStop(() => {
        globalAudioCtx = null
        globalPlayingId = null
        setAudioInfo(prev => ({ ...prev, newsId: null, url: null, playing: false }))
        audioCtxRef.current = null
        Taro.eventCenter.trigger(AUDIO_STOP_EVENT)
      })

      ctx.onError(() => {
        globalAudioCtx = null
        globalPlayingId = null
        setAudioInfo(prev => ({ ...prev, newsId: null, url: null, playing: false }))
        audioCtxRef.current = null
        Taro.eventCenter.trigger(AUDIO_STOP_EVENT)
      })
    }, 50)
  }, [stopAll])

  // 播放报告音频
  const playReport = useCallback((url: string) => {
    // 停止新闻音频（不停止报告音频本身）
    if (globalAudioCtx) {
      try {
        globalAudioCtx.stop()
        globalAudioCtx.destroy()
      } catch (e) { /* ignore */ }
      globalAudioCtx = null
      globalPlayingId = null
      setAudioInfo(prev => ({ ...prev, playing: false }))
    }

    setTimeout(() => {
      const ctx = Taro.createInnerAudioContext()
      globalReportCtx = ctx

      ctx.src = url
      ctx.autoplay = true
      ctx.obeyMuteSwitch = false

      ctx.onPlay(() => {
        setAudioInfo(prev => ({ ...prev, reportPlaying: true, reportUrl: url }))
        reportAudioCtxRef.current = ctx
      })

      ctx.onEnded(() => {
        globalReportCtx = null
        setAudioInfo(prev => ({ ...prev, reportPlaying: false, reportUrl: null }))
        reportAudioCtxRef.current = null
      })

      ctx.onStop(() => {
        globalReportCtx = null
        setAudioInfo(prev => ({ ...prev, reportPlaying: false, reportUrl: null }))
        reportAudioCtxRef.current = null
      })

      ctx.onError(() => {
        globalReportCtx = null
        setAudioInfo(prev => ({ ...prev, reportPlaying: false, reportUrl: null }))
        reportAudioCtxRef.current = null
      })
    }, 50)
  }, [])

  // 暂停/继续报告
  const toggleReport = useCallback(() => {
    const ctx = globalReportCtx
    if (!ctx) return

    if (audioInfo.reportPlaying) {
      ctx.pause()
      setAudioInfo(prev => ({ ...prev, reportPlaying: false }))
    } else {
      ctx.play()
      setAudioInfo(prev => ({ ...prev, reportPlaying: true }))
    }
  }, [audioInfo.reportPlaying])

  // 监听来自其他页面的事件
  useEffect(() => {
    const handleStop = () => {
      setAudioInfo(prev => ({
        ...prev,
        newsId: null,
        url: null,
        playing: false,
      }))
    }

    const handleStart = (data: { newsId: string; url: string }) => {
      setAudioInfo(prev => ({
        ...prev,
        newsId: data.newsId,
        url: data.url,
        playing: true,
      }))
    }

    Taro.eventCenter.on(AUDIO_STOP_EVENT, handleStop)
    Taro.eventCenter.on(AUDIO_START_EVENT, handleStart)

    return () => {
      Taro.eventCenter.off(AUDIO_STOP_EVENT, handleStop)
      Taro.eventCenter.off(AUDIO_START_EVENT, handleStart)
    }
  }, [])

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      audioCtxRef.current = null
      reportAudioCtxRef.current = null
    }
  }, [])

  return {
    audioInfo,
    playNews,
    stopAll,
    playReport,
    toggleReport,
    audioCtxRef,
    reportAudioCtxRef,
  }
}
