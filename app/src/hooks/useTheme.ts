import { useState, useCallback, useEffect } from 'react'
import Taro from '@tarojs/taro'

const SETTINGS_KEY = 'techecho_settings'
const THEME_CHANGE_EVENT = 'techecho_theme_changed'

interface Settings { voice?: string; threshold?: number; darkMode?: boolean }

function readDarkMode(): boolean {
  try {
    const raw = Taro.getStorageSync(SETTINGS_KEY)
    if (raw) {
      const s: Settings = JSON.parse(raw)
      return s.darkMode !== false
    }
  } catch (_) {}
  return true
}

/**
 * 跨页面主题 hook — 通过 Taro.eventCenter 实现多页面同步
 * 同时更新微信导航栏和 TabBar 颜色
 *
 * 用法：
 *   const { darkMode, toggleTheme } = useTheme()
 *   <View className={`page${darkMode ? '' : ' page-light'}`}>
 *
 * 当「我的」页面切换深色模式后，本 hook 通过事件通道自动同步到所有页面。
 */
export function useTheme() {
  const [darkMode, setDarkMode] = useState<boolean>(readDarkMode)

  // 同步 TabBar 颜色（使用 custom navigationStyle，无需 setNavigationBarColor）
  const applyNativeTheme = useCallback((isDark: boolean) => {
    if (isDark) {
      Taro.setTabBarStyle({
        color: '#86868B',
        selectedColor: '#6366f1',
        backgroundColor: '#0f0f1a',
        borderStyle: 'black',
      })
    } else {
      Taro.setTabBarStyle({
        color: '#86868B',
        selectedColor: '#6366f1',
        backgroundColor: '#ffffff',
        borderStyle: 'white',
      })
    }
  }, [])

  // 初始应用 + 主题变化时应用
  useEffect(() => {
    applyNativeTheme(darkMode)
  }, [darkMode, applyNativeTheme])

  // 监听来自其他页面的主题变更事件
  useEffect(() => {
    const handler = () => {
      const next = readDarkMode()
      setDarkMode(next)
    }
    Taro.eventCenter.on(THEME_CHANGE_EVENT, handler)
    return () => {
      Taro.eventCenter.off(THEME_CHANGE_EVENT, handler)
    }
  }, [])

  const toggleTheme = useCallback(() => {
    const next = !darkMode
    setDarkMode(next)
    try {
      const raw = Taro.getStorageSync(SETTINGS_KEY)
      const s: Settings = raw ? JSON.parse(raw) : {}
      s.darkMode = next
      Taro.setStorageSync(SETTINGS_KEY, JSON.stringify(s))
    } catch (_) {}
    // 通知所有已挂载的页面更新主题
    Taro.eventCenter.trigger(THEME_CHANGE_EVENT)
  }, [darkMode])

  return { darkMode, toggleTheme }
}
