import { useState, useEffect } from 'react'
import { View, Text, ScrollView, Switch, Slider, Button, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { wechatLogin, getNewsList, LoginResult } from '../../api'
import { t } from '../../i18n'
import './mine.scss'

// ===== 类型定义 =====

interface UserInfo {
  token: string
  user_id: string
  nickname: string
  avatar_url: string
  is_new_user: boolean
}

interface AppSettings {
  voice: string
  threshold: number
  darkMode: boolean
}

// ===== 四声线配置 =====

const VOICES = [
  { id: 'voice3', icon: '👩', name: '温婉女声', desc: '知性柔和，适合行业洞察', gender: 'female' },
  { id: 'voice1', icon: '👨', name: '沉稳男声', desc: '低音磁性，适合深度长文', gender: 'male' },
  { id: 'voice2', icon: '🧑', name: '清朗男声', desc: '明亮有力，适合科技快讯', gender: 'male' },
  { id: 'voice4', icon: '👩‍🦰', name: '清新女声', desc: '甜美自然，适合轻松播报', gender: 'female' },
]

const DEFAULT_SETTINGS: AppSettings = {
  voice: 'voice3',
  threshold: 55,
  darkMode: true,
}

type PageView = 'main' | 'preferences'

export default function Mine() {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [loggingIn, setLoggingIn] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [pageView, setPageView] = useState<PageView>('main')
  const [favCount, setFavCount] = useState(0)

  useEffect(() => { loadPersistedState() }, [])

  // 计算有效收藏数量（只统计新闻列表中存在的收藏）
  const calculateValidFavCount = async () => {
    try {
      const favs = Taro.getStorageSync('techecho_favorites')
      const favList: string[] = favs ? JSON.parse(favs) : []
      if (favList.length === 0) {
        setFavCount(0)
        return
      }
      // 获取新闻列表，检查哪些收藏ID仍然有效
      const res = await getNewsList({ limit: 500 })
      if (res.success && Array.isArray(res.data)) {
        const validIds = new Set(res.data.map((n: any) => n.id))
        const validCount = favList.filter(id => validIds.has(id)).length
        setFavCount(validCount)
        // 如果有效数量为0，清除过期的收藏ID
        if (validCount === 0) {
          Taro.removeStorageSync('techecho_favorites')
        }
      } else {
        setFavCount(favList.length)
      }
    } catch (_) { /* ignore */ }
  }

  // Tab 切换回"我的"页面时刷新收藏数
  useDidShow(() => {
    calculateValidFavCount()
  })

  // 监听收藏数据变化（实时更新徽章数量）
  useEffect(() => {
    const favChangeHandler = () => {
      console.log('[Mine] 收到收藏变化事件')
      calculateValidFavCount()
    }
    Taro.eventCenter.on('techecho_favorites_changed', favChangeHandler)
    return () => {
      Taro.eventCenter.off('techecho_favorites_changed', favChangeHandler)
    }
  }, [])

  // 监听来自其他页面的主题变更和设置变更
  useEffect(() => {
    const themeHandler = () => {
      try {
        const saved = Taro.getStorageSync('techecho_settings')
        if (saved) setSettings((prev) => ({ ...prev, ...JSON.parse(saved) }))
      } catch (_) {}
    }

    const settingsHandler = () => {
      try {
        const saved = Taro.getStorageSync('techecho_settings')
        if (saved) setSettings((prev) => ({ ...prev, ...JSON.parse(saved) }))
      } catch (_) {}
    }

    Taro.eventCenter.on('techecho_theme_changed', themeHandler)
    Taro.eventCenter.on('techecho_settings_changed', settingsHandler)
    return () => {
      Taro.eventCenter.off('techecho_theme_changed', themeHandler)
      Taro.eventCenter.off('techecho_settings_changed', settingsHandler)
    }
  }, [])

  function loadPersistedState() {
    try {
      const token = Taro.getStorageSync('auth_token')
      const uid = Taro.getStorageSync('user_id')
      const nickname = Taro.getStorageSync('user_nickname')
      const avatar = Taro.getStorageSync('user_avatar')
      if (token && uid) {
        setUser({
          token, user_id: uid,
          nickname: nickname || '科技爱好者',
          avatar_url: avatar || '',
          is_new_user: false,
        })
      }
    } catch (_) { /* 未登录 */ }

    try {
      const saved = Taro.getStorageSync('techecho_settings')
      if (saved) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) })
    } catch (_) { /* default */ }

    try {
      const favs = Taro.getStorageSync('techecho_favorites')
      if (favs) setFavCount(JSON.parse(favs).length)
    } catch (_) { /* empty */ }
  }

  async function handleWechatLogin() {
    setLoggingIn(true)
    setLoginError('')
    try {
      const loginRes = await Taro.login()
      if (!loginRes.code) {
        setLoginError('获取登录凭证失败')
        setLoggingIn(false)
        return
      }

      let nickname = ''
      let avatarUrl = ''
      try {
        const profileRes = await Taro.getUserProfile({ desc: '用于展示用户昵称' })
        if (profileRes.userInfo) {
          nickname = profileRes.userInfo.nickName || ''
          avatarUrl = profileRes.userInfo.avatarUrl || ''
        }
      } catch (e) { console.log('[Mine] 用户拒绝授权用户信息') }

      const result: LoginResult = await wechatLogin(loginRes.code, nickname, avatarUrl)
      if (result.success) {
        const userInfo: UserInfo = {
          token: result.token, user_id: result.user_id,
          nickname: result.nickname || '科技爱好者',
          avatar_url: result.avatar_url || '',
          is_new_user: result.is_new_user,
        }
        Taro.setStorageSync('auth_token', result.token)
        Taro.setStorageSync('user_id', result.user_id)
        Taro.setStorageSync('user_nickname', result.nickname || '')
        Taro.setStorageSync('user_avatar', result.avatar_url || '')
        setUser(userInfo)
        Taro.showToast({ title: result.is_new_user ? '欢迎加入！' : '登录成功', icon: 'success', duration: 1500 })
      } else {
        setLoginError(result.message || t('loginFailed'))
      }
    } catch (e: any) {
      console.error('[Mine] 登录异常:', e)
      setLoginError(e?.message || t('networkError'))
    }
    setLoggingIn(false)
  }

  function handleLogout() {
    Taro.showModal({
      title: t('logout'),
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          try {
            Taro.removeStorageSync('auth_token')
            Taro.removeStorageSync('user_id')
            Taro.removeStorageSync('user_nickname')
            Taro.removeStorageSync('user_avatar')
          } catch (_) { /* ignore */ }
          setUser(null)
          Taro.showToast({ title: '已退出', icon: 'none' })
        }
      },
    })
  }

  function selectVoice(voiceId: string) {
    const newSettings = { ...settings, voice: voiceId }
    setSettings(newSettings)
    saveSettings(newSettings)
  }

  function setThreshold(value: number) {
    const newSettings = { ...settings, threshold: value }
    setSettings(newSettings)
    saveSettings(newSettings)
  }

  function toggleDarkMode() {
    const newSettings = { ...settings, darkMode: !settings.darkMode }
    setSettings(newSettings)
    saveSettings(newSettings)
    // 通知其他页面同步主题
    Taro.eventCenter.trigger('techecho_theme_changed')
  }

  function saveSettings(s: AppSettings) {
    try { Taro.setStorageSync('techecho_settings', JSON.stringify(s)) } catch (_) { /* ignore */ }
  }

  function goToFavorites() { Taro.switchTab({ url: '/pages/news/news' }) }
  function goToHistory() { Taro.showToast({ title: '播放历史（开发中）', icon: 'none' }) }
  function goToHelp() {
    Taro.showModal({
      title: '帮助与反馈',
      content: 'Tech Echo Pro — 智能科技资讯平台\n\n版本：0.3.0',
      showCancel: false,
    })
  }

  // ===== 系统信息 =====
  // navigationStyle: 'custom' — 自定义导航栏，需手动适配状态栏高度
  const statusBarHeight = (Taro.getSystemInfoSync?.().statusBarHeight || 20) as number
  const headerPaddingTop = `${statusBarHeight + 8}px`

  // --- 偏好设置子页 ---
  if (pageView === 'preferences') {
    return (
      <View className={`mine-page${settings.darkMode ? '' : ' mine-light'}`}>
        <View className="mine-sub-navbar" style={{ paddingTop: headerPaddingTop }}>
          <View className="mine-sub-back" onClick={() => setPageView('main')}>
            <Text className="mine-back-arrow">←</Text>
            <Text className="mine-back-label">返回</Text>
          </View>
          <Text className="mine-sub-title">{t('preferences')}</Text>
          <View style={{ width: '60px' }} />
        </View>

        <ScrollView scrollY className="mine-sub-content">
          {/* 质量阈值 — 对标 H5 slider */}
          <View className="mine-pref-card">
            <View className="mine-pref-header">
              <Text className="mine-pref-label">📊 {t('thresholdTitle')}</Text>
              <Text className="mine-pref-value">{settings.threshold} {t('thresholdUnit')}</Text>
            </View>
            <Text className="mine-pref-desc">低于此分数的新闻将不显示</Text>
            <View className="mine-slider-wrap">
              <Text className="mine-slider-min">0</Text>
              <Slider
                className="mine-pref-slider"
                min={0} max={100} step={5}
                value={settings.threshold}
                activeColor="#6366f1" backgroundColor="#2a2a3e"
                blockSize={20}
                onChange={(e) => setThreshold(e.detail.value)}
              />
              <Text className="mine-slider-max">100</Text>
            </View>
          </View>

          {/* 语音风格 */}
          <View className="mine-section-header" style={{ marginTop: 4 }}>
            <Text className="mine-section-label">🎙️ 播客风格四声线</Text>
            <Text className="mine-section-hint">选择你喜欢的播报声音</Text>
          </View>

          <View className="mine-voice-grid mine-voice-grid--pref">
            {VOICES.map((v) => (
              <View
                key={v.id}
                className={`mine-voice-card ${settings.voice === v.id ? 'selected' : ''}`}
                onClick={() => selectVoice(v.id)}
              >
                <Text className="mine-voice-icon">{v.icon}</Text>
                <Text className="mine-voice-name">{v.name}</Text>
                <Text className="mine-voice-desc">{v.desc}</Text>
                {settings.voice === v.id && (
                  <View className="mine-voice-check">
                    <Text>✓</Text>
                  </View>
                )}
              </View>
            ))}
          </View>

          {/* 深色模式 — 对标 H5 L390 */}
          <View className="mine-pref-card">
            <View className="mine-pref-row">
              <View className="mine-pref-info">
                <Text className="mine-pref-label">🌙 {t('darkMode')}</Text>
                <Text className="mine-pref-desc">使用深色背景，更护眼</Text>
              </View>
              <Switch
                checked={settings.darkMode}
                color="#6366f1"
                onChange={toggleDarkMode}
              />
            </View>
          </View>
        </ScrollView>
      </View>
    )
  }

  // --- 主页 — 对标 H5 settings page L364-478 ---
  return (
    <View className={`mine-page${settings.darkMode ? '' : ' mine-light'}`}>
      <ScrollView scrollY className="mine-scroll">
        {/* Header — 与首页一致 */}
        <View className="mine-header" style={{ paddingTop: headerPaddingTop }}>
          <View className="mine-header-content">
            <View className="mine-logo-wrap">
              <View className="mine-logo-icon">
                <Text className="mine-logo-icon-text">🎙</Text>
              </View>
              <Text className="mine-logo-text">{t('appName')}</Text>
            </View>
          </View>
        </View>

        {/* 用户区域 */}
        <View className="mine-user-section">
          {user ? (
            <View className="mine-user-card">
              <View className="mine-avatar-wrap">
                {user.avatar_url ? (
                  <Image className="mine-avatar-img" src={user.avatar_url} mode="aspectFill" />
                ) : (
                  <View className="mine-avatar-placeholder">
                    <Text className="mine-avatar-emoji">👤</Text>
                  </View>
                )}
              </View>
              <Text className="mine-user-name">{user.nickname}</Text>
              <Text className="mine-user-tag">科技资讯爱好者</Text>

              <View className="mine-user-stats">
                <View className="mine-stat-col">
                  <Text className="mine-stat-num">{favCount}</Text>
                  <Text className="mine-stat-label">收藏</Text>
                </View>
                <View className="mine-stat-divider" />
                <View className="mine-stat-col">
                  <Text className="mine-stat-num">7</Text>
                  <Text className="mine-stat-label">天活跃</Text>
                </View>
              </View>
            </View>
          ) : (
            <View className="mine-login-section">
              <View className="mine-login-avatar-lg">
                <Text className="mine-login-emoji-lg">👤</Text>
              </View>
              <Text className="mine-login-title">登录 Tech Echo</Text>
              <Text className="mine-login-desc">同步收藏和偏好设置</Text>
              <Button
                className="mine-wechat-login-btn"
                loading={loggingIn}
                disabled={loggingIn}
                onClick={handleWechatLogin}
                hoverClass="mine-wechat-login-btn--hover"
              >
                <Text className="mine-wx-icon">💬</Text>
                <Text className="mine-wx-login-text">
                  {loggingIn ? t('loggingIn') : t('login')}
                </Text>
              </Button>
              {loginError && <Text className="mine-login-error">{loginError}</Text>}
            </View>
          )}
        </View>

        {/* 菜单列表 — 对标 H5 settings */}
        <View className="mine-menu-section">
          <View className="mine-menu-group">
            <View className="mine-menu-item" onClick={goToFavorites}>
              <Text className="mine-menu-icon">⭐</Text>
              <View className="mine-menu-info">
                <Text className="mine-menu-text">我的收藏</Text>
                {favCount > 0 && (
                  <View className="mine-menu-badge">
                    <Text className="mine-badge-text">{favCount}</Text>
                  </View>
                )}
              </View>
              <Text className="mine-menu-arrow">›</Text>
            </View>

            <View className="mine-menu-item" onClick={goToHistory}>
              <Text className="mine-menu-icon">🕐</Text>
              <Text className="mine-menu-text">播放历史</Text>
              <Text className="mine-menu-arrow">›</Text>
            </View>
          </View>

          <View className="mine-menu-group">
            <View className="mine-menu-item" onClick={() => setPageView('preferences')}>
              <Text className="mine-menu-icon">⚙️</Text>
              <View className="mine-menu-info">
                <Text className="mine-menu-text">{t('preferences')}</Text>
                <Text className="mine-menu-sub">
                  {VOICES.find(v => v.id === settings.voice)?.name || '温婉女声'} · {t('thresholdTitle')} {settings.threshold}
                </Text>
              </View>
              <Text className="mine-menu-arrow">›</Text>
            </View>
          </View>

          <View className="mine-menu-group">
            {user && (
              <View className="mine-menu-item mine-menu-item--logout" onClick={handleLogout}>
                <Text className="mine-menu-icon">🚪</Text>
                <Text className="mine-menu-text mine-menu-text--logout">{t('logout')}</Text>
                <Text className="mine-menu-arrow">›</Text>
              </View>
            )}
            <View className="mine-menu-item" onClick={goToHelp}>
              <Text className="mine-menu-icon">❓</Text>
              <Text className="mine-menu-text">帮助与反馈</Text>
              <Text className="mine-menu-arrow">›</Text>
            </View>
          </View>
        </View>

        {/* 关于 — 对标首页 logo */}
        <View className="mine-about-section">
          <View className="mine-about-logo-wrap">
            <View className="mine-about-logo-icon">
              <Text className="mine-about-logo-icon-text">🎙</Text>
            </View>
            <Text className="mine-about-logo-text">{t('appName')}</Text>
          </View>
          <Text className="mine-about-version">Version 0.3.0</Text>
          <Text className="mine-about-desc">智能科技资讯 · 有声播报</Text>
          <Text className="mine-about-copy">© 2026 Tech Echo Pro</Text>
        </View>

        <View style={{ height: 'calc(60px + env(safe-area-inset-bottom))' }} />
      </ScrollView>
    </View>
  )
}
