/**
 * TechEcho Pro - React Version
 * 
 * This is a pure React implementation that mirrors index.html exactly.
 * Can be compiled by Taro to both H5 and WeChat Mini Program.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import './styles/global.scss'

// ============ Types ============

interface NewsItem {
  id: string
  title_zh: string
  title_en: string
  summary_zh: string
  summary_en: string
  content_zh: string
  content_en: string
  source_zh: string
  source_en: string
  source_url: string
  lang: 'zh' | 'en' | 'both'
  category: string
  published_at: string
  created_at: string
  quality?: {
    total_100: number
    grade: string
    scores: Record<string, number>
  }
  audio?: Record<string, string>
}

interface AnalysisState {
  exists: boolean
  articleHtml?: string
  metaHtml?: string
  badgeText?: string
  audioUrl?: string
  audioDuration?: number
  newsCount?: number
  mode?: string
}

// ============ i18n ============

const i18n = {
  zh: {
    appName: '科技回声',
    dateToday: '今天',
    dateYesterday: '昨天',
    dateWeek: '本周',
    dateMonth: '本月',
    dateAll: '全部',
    navHome: '首页',
    navFav: '收藏',
    navSettings: '设置',
    read: '阅读',
    speak: '朗读',
    stopSpeaking: '⏸️ 停止',
    favorite: '收藏',
    favorited: '已收藏',
    emptyFavTitle: '暂无收藏',
    emptyFavText: '点击新闻卡片的收藏按钮添加收藏',
    emptyTitle: '暂无内容',
    emptyText: '尝试切换日期或分类',
    loading: '加载中...',
    refreshing: '正在刷新...',
    stopped: '已停止',
    addedFav: '已添加收藏',
    removedFav: '已取消收藏',
    voiceSettings: '语音风格',
    thresholdTitle: '新闻分值阈值',
    thresholdUnit: '分',
    displaySettings: '显示设置',
    darkMode: '深色模式',
    detailTitle: '资讯详情',
    speaking: '正在朗读...',
    noSupport: '浏览器不支持语音功能',
    speechFailed: '语音播放失败',
    langZh: '中文',
    langEn: 'EN',
    statTotal: '共',
    statItems: '条',
    catRecommend: '推荐',
    catAI: 'AI',
    catTools: '工具',
    catNews: '动态',
    catProduct: '产品',
    // AI Analysis
    aiAnalysis: 'AI 智能播报',
    aiDesc: '基于你的收藏，生成深度科技分析',
    startAnalysis: '开始分析',
    reAnalyze: '重新分析',
    analyzing: '分析中...',
    aiMode: 'AI 分析',
    offlineMode: '离线模式',
    backToFav: '← 返回收藏',
    basedOn: '基于',
    items: '条收藏',
    reportPlay: '▶ 播报',
    reportPause: '⏸ 暂停',
    retry: '重试',
    incomplete: '内容不完整，建议重新分析',
  },
  en: {
    appName: 'TechEcho',
    dateToday: 'Today',
    dateYesterday: 'Yesterday',
    dateWeek: 'Week',
    dateMonth: 'Month',
    dateAll: 'All',
    navHome: 'Home',
    navFav: 'Favorites',
    navSettings: 'Settings',
    read: 'Read',
    speak: 'Speak',
    stopSpeaking: '⏸️ Stop',
    favorite: 'Fav',
    favorited: 'Favorited',
    emptyFavTitle: 'No Favorites',
    emptyFavText: 'Tap the favorite button on news cards',
    emptyTitle: 'No Content',
    emptyText: 'Try switching date or category',
    loading: 'Loading...',
    refreshing: 'Refreshing...',
    stopped: 'Stopped',
    addedFav: 'Added to Favorites',
    removedFav: 'Removed from Favorites',
    voiceSettings: 'Voice Style',
    thresholdTitle: 'Score Threshold',
    thresholdUnit: 'pts',
    displaySettings: 'Display Settings',
    darkMode: 'Dark Mode',
    detailTitle: 'News Details',
    speaking: 'Speaking...',
    noSupport: 'Speech not supported',
    speechFailed: 'Speech failed',
    langZh: '中',
    langEn: 'EN',
    statTotal: '',
    statItems: 'items',
    catRecommend: 'Featured',
    catAI: 'AI',
    catTools: 'Tools',
    catNews: 'News',
    catProduct: 'Products',
    // AI Analysis
    aiAnalysis: 'AI Smart Podcast',
    aiDesc: 'Deep tech analysis based on your favorites',
    startAnalysis: 'Start Analysis',
    reAnalyze: 'Re-analyze',
    analyzing: 'Analyzing...',
    aiMode: 'AI Analysis',
    offlineMode: 'Offline',
    backToFav: '← Back to Favorites',
    basedOn: 'Based on',
    items: 'favorites',
    reportPlay: '▶ Play',
    reportPause: '⏸ Pause',
    retry: 'Retry',
    incomplete: 'Content incomplete',
  }
}

type Lang = 'zh' | 'en'
const t = (lang: Lang, key: keyof typeof i18n.zh) => i18n[lang][key]

// ============ Constants ============

const API_BASE = 'http://localhost:8001'
const FAV_STORAGE_KEY = 'techecho_favorites'
const SETTINGS_STORAGE_KEY = 'techecho_settings'
const ANALYSIS_STATE_KEY = 'techecho_analysis_state'

const CATEGORY_EMOJIS: Record<string, string> = {
  ai: '🤖',
  tools: '🔧',
  news: '📰',
  product: '💡'
}

const VOICES = [
  { id: 'voice3', icon: '👩', name: '温婉女声', nameEn: 'Warm Female', desc: '知性柔和，适合行业洞察', descEn: 'Professional & Soothing' },
  { id: 'voice1', icon: '👨', name: '沉稳男声', nameEn: 'Deep Male', desc: '低音磁性，适合深度长文', descEn: 'Authoritative & Calm' },
  { id: 'voice2', icon: '🧑', name: '清朗男声', nameEn: 'Bright Male', desc: '明亮有力，适合科技快讯', descEn: 'Energetic & Clear' },
  { id: 'voice4', icon: '👩‍🦰', name: '清新女声', nameEn: 'Fresh Female', desc: '甜美自然，适合轻松播报', descEn: 'Sweet & Natural' },
]

// ============ Utility Functions ============

function parseDate(dateStr: string): string {
  if (!dateStr) return ''
  // Handle YYYY-MM-DD format
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
    return dateStr.slice(0, 10)
  }
  return dateStr
}

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function getDisplayTitle(item: NewsItem, lang: Lang): string {
  return lang === 'zh' ? (item.title_zh || item.title_en) : (item.title_en || item.title_zh)
}

function getDisplayContent(item: NewsItem, lang: Lang): string {
  return lang === 'zh' ? (item.content_zh || item.content_en) : (item.content_en || item.content_zh)
}

function getDisplaySource(item: NewsItem, lang: Lang): string {
  return lang === 'zh' ? (item.source_zh || item.source_en) : (item.source_en || item.source_zh)
}

function getCategoryNames(lang: Lang): Record<string, string> {
  if (lang === 'en') {
    return { ai: 'AI', tools: 'Tools', news: 'News', product: 'Products' }
  }
  return { ai: 'AI', tools: '工具', news: '动态', product: '产品' }
}

// ============ API Functions ============

async function fetchNews(): Promise<NewsItem[]> {
  const res = await fetch(`${API_BASE}/api/news?limit=500`)
  const data = await res.json()
  return data.data || []
}

async function analyzeFavorites(newsIds: string[], limit: number = 10) {
  const res = await fetch(`${API_BASE}/api/favorites/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ news_ids: newsIds, limit })
  })
  return res.json()
}

async function ttsSpeak(text: string, voice: string) {
  const res = await fetch(`${API_BASE}/api/favorites/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice })
  })
  return res.json()
}

// ============ Components ============

function Header({ lang, onLangChange, onRefresh }: {
  lang: Lang
  onLangChange: (lang: Lang) => void
  onRefresh: () => void
}) {
  return (
    <header className="header">
      <div className="header-content">
        <div className="logo">
          <div className="logo-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5"/>
              <path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          <span className="logo-text">{t(lang, 'appName')}</span>
        </div>

        <div className="header-actions">
          <div className="lang-toggle">
            <button
              className={`lang-btn ${lang === 'zh' ? 'active' : ''}`}
              onClick={() => onLangChange('zh')}
            >
              {t(lang, 'langZh')}
            </button>
            <button
              className={`lang-btn ${lang === 'en' ? 'active' : ''}`}
              onClick={() => onLangChange('en')}
            >
              {t(lang, 'langEn')}
            </button>
          </div>
          <button className="action-btn" onClick={onRefresh}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6"/>
              <path d="M1 20v-6h6"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
          </button>
        </div>
      </div>
    </header>
  )
}

function DatePicker({ value, onChange, lang }: {
  value: string
  onChange: (filter: string) => void
  lang: Lang
}) {
  const options = [
    { key: 'day6', label: '', value: '' },
    { key: 'day5', label: '', value: '' },
    { key: 'day4', label: '', value: '' },
    { key: 'day3', label: '', value: '' },
    { key: 'day2', label: '', value: '' },
    { key: 'yesterday', label: t(lang, 'dateYesterday'), value: '' },
    { key: 'today', label: t(lang, 'dateToday'), value: '' },
    { key: 'week', label: t(lang, 'dateWeek'), value: '7' },
    { key: 'month', label: t(lang, 'dateMonth'), value: '' },
    { key: 'all', label: t(lang, 'dateAll'), value: '∞' },
  ]

  const today = new Date()
  for (let i = 6; i >= 2; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    options[6 - i].value = String(d.getDate())
    options[6 - i].label = ''
  }
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  options[5].value = String(yesterday.getDate())
  options[6].value = String(today.getDate())
  const month = new Date(today)
  options[8].value = String(month.getDate())

  return (
    <div className="date-picker-wrapper">
      <div className="date-picker-track">
        {options.map(opt => (
          <div
            key={opt.key}
            className={`date-item ${value === opt.key ? 'center-item' : ''}`}
            onClick={() => onChange(opt.key)}
          >
            {opt.label && <span className="date-label">{opt.label}</span>}
            <span className="date-value">{opt.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CategoryChips({ value, onChange, lang }: {
  value: string
  onChange: (cat: string) => void
  lang: Lang
}) {
  const categories = lang === 'en' ? [
    { id: 'all', name: 'Featured', emoji: '✨' },
    { id: 'ai', name: 'AI', emoji: '🤖' },
    { id: 'tools', name: 'Tools', emoji: '🔧' },
    { id: 'news', name: 'News', emoji: '📰' },
    { id: 'product', name: 'Products', emoji: '💡' },
  ] : [
    { id: 'all', name: '推荐', emoji: '✨' },
    { id: 'ai', name: 'AI', emoji: '🤖' },
    { id: 'tools', name: '工具', emoji: '🔧' },
    { id: 'news', name: '动态', emoji: '📰' },
    { id: 'product', name: '产品', emoji: '💡' },
  ]

  return (
    <div className="category-scroll">
      {categories.map(cat => (
        <button
          key={cat.id}
          className={`category-chip ${value === cat.id ? 'active' : ''}`}
          onClick={() => onChange(cat.id)}
        >
          {cat.emoji} {cat.name}
        </button>
      ))}
    </div>
  )
}

function NewsCard({ item, lang, favorites, onSpeak, onFavorite, onClick }: {
  item: NewsItem
  lang: Lang
  favorites: string[]
  onSpeak: (item: NewsItem) => void
  onFavorite: (id: string) => void
  onClick: () => void
}) {
  const emoji = CATEGORY_EMOJIS[item.category] || '📰'
  const catNames = getCategoryNames(lang)
  const catName = catNames[item.category] || item.category
  const title = getDisplayTitle(item, lang)
  const content = item.summary_zh || item.summary_en || ''
  const source = getDisplaySource(item, lang)
  const dateStr = item.published_at || item.created_at || ''
  const shortDate = parseDate(dateStr)
  const isChinese = item.lang === 'zh' || (!item.lang && !!item.title_zh)
  const isFav = favorites.includes(item.id)

  return (
    <div className="news-card" onClick={onClick}>
      <div className="card-header">
        <div className="card-emoji">{emoji}</div>
        <div className="card-meta">
          <div className="card-tags">
            <span className={`tag ${isChinese ? 'tag-zh' : 'tag-en'}`}>
              {isChinese ? '中文' : 'EN'}
            </span>
            <span className="tag tag-cat">{catName}</span>
          </div>
          <div className="card-source">
            <a href={item.source_url || '#'} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
              {source} ↗
            </a>
          </div>
        </div>
      </div>
      <div className="card-body">
        <div className="card-title">{title}</div>
        <div className="card-summary">{content}</div>
      </div>
      <div className="card-footer" onClick={e => e.stopPropagation()}>
        <span className="card-date">{shortDate}</span>
        <div className="card-actions">
          <button className="action-btn" onClick={() => onSpeak(item)}>
            🔊 {t(lang, 'speak')}
          </button>
          <button
            className={`action-btn ${isFav ? 'active' : ''}`}
            onClick={() => onFavorite(item.id)}
          >
            {isFav ? t(lang, 'favorited') : t(lang, 'favorite')}
          </button>
        </div>
      </div>
    </div>
  )
}

function DetailModal({ item, lang, onClose, onSpeak, onFavorite }: {
  item: NewsItem
  lang: Lang
  onClose: () => void
  onSpeak: () => void
  onFavorite: () => void
}) {
  const title = getDisplayTitle(item, lang)
  const source = getDisplaySource(item, lang)
  const content = getDisplayContent(item, lang)
  const dateStr = item.published_at || item.created_at || ''
  const displayContent = content.length > 2000 ? content.slice(0, 2000) + '...' : content

  return (
    <div className="modal show" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{t(lang, 'detailTitle')}</span>
          <button className="modal-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="modal-body">
          <div className="detail-modal-card">
            <div className="detail-modal-header">
              <h1 className="detail-title">{title}</h1>
              <div className="detail-meta">
                <span className="detail-source-name">{source}</span>
                <span className="detail-date">{dateStr}</span>
              </div>
            </div>
            <div className="detail-modal-body">
              <div className="detail-section">
                <div className="detail-full-content">{displayContent}</div>
              </div>
            </div>
            {item.source_url && (
              <div className="detail-source-link">
                <div className="detail-source-link-label">📎 原文链接</div>
                <div className="detail-source-link-url">{item.source_url}</div>
              </div>
            )}
            <div className="detail-actions">
              <div className="detail-action-btn" onClick={onSpeak}>
                <span className="detail-action-icon">🔊</span>
                <span className="detail-action-text">{t(lang, 'speak')}</span>
              </div>
              <div className="detail-action-btn primary" onClick={onClose}>
                <span className="detail-action-icon">✓</span>
                <span className="detail-action-text">{lang === 'zh' ? '已读' : 'Done'}</span>
              </div>
              <div className="detail-action-btn" onClick={onFavorite}>
                <span className="detail-action-icon">❤️</span>
                <span className="detail-action-text">{t(lang, 'favorite')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SettingsPanel({ lang, settings, onSettingsChange }: {
  lang: Lang
  settings: { voice: string; threshold: number; darkMode: boolean }
  onSettingsChange: (settings: typeof settings) => void
}) {
  const voices = lang === 'en' ? VOICES.map(v => ({
    ...v,
    name: v.nameEn,
    desc: v.descEn
  })) : VOICES

  return (
    <div className="settings-page">
      <div className="settings-section">
        <div className="settings-title">{t(lang, 'voiceSettings')}</div>
        <div className="voice-grid">
          {voices.map(v => (
            <div
              key={v.id}
              className={`voice-option ${settings.voice === v.id ? 'selected' : ''}`}
              onClick={() => onSettingsChange({ ...settings, voice: v.id })}
            >
              <div className="voice-icon">{v.icon}</div>
              <div className="voice-name">{v.name}</div>
              <div className="voice-desc">{v.desc}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="settings-section">
        <div className="settings-title">
          {t(lang, 'thresholdTitle')} (≥{settings.threshold} {t(lang, 'thresholdUnit')})
        </div>
        <div className="slider-container">
          <input
            type="range"
            className="slider"
            min="0"
            max="100"
            value={settings.threshold}
            onChange={e => onSettingsChange({ ...settings, threshold: parseInt(e.target.value) })}
          />
          <span className="slider-value">{settings.threshold}</span>
        </div>
      </div>
      <div className="settings-section">
        <div className="settings-title">{t(lang, 'displaySettings')}</div>
        <div className="toggle-container">
          <span className="toggle-label">{t(lang, 'darkMode')}</span>
          <div
            className={`toggle ${settings.darkMode ? 'active' : ''}`}
            onClick={() => onSettingsChange({ ...settings, darkMode: !settings.darkMode })}
          />
        </div>
      </div>
    </div>
  )
}

function AnalysisHero({ lang, favorites, onAnalyze }: {
  lang: Lang
  favorites: string[]
  onAnalyze: () => void
}) {
  if (favorites.length === 0) return null

  return (
    <div className="analysis-hero">
      <div className="analysis-hero-inner">
        <div className="analysis-hero-icon">🎙️</div>
        <div className="analysis-hero-content">
          <div className="analysis-hero-title">{t(lang, 'aiAnalysis')}</div>
          <div className="analysis-hero-desc">{t(lang, 'aiDesc')}</div>
        </div>
        <button className="analysis-hero-btn" onClick={onAnalyze}>
          {t(lang, 'startAnalysis')}
        </button>
      </div>
    </div>
  )
}

function ReportView({ analysisState, onClose, onReanalyze, onTogglePlay, onSpeedChange, playbackSpeed, isPlaying }: {
  analysisState: AnalysisState
  onClose: () => void
  onReanalyze: () => void
  onTogglePlay: () => void
  onSpeedChange: (speed: number) => void
  playbackSpeed: number
  isPlaying: boolean
}) {
  const articleLines = analysisState.articleHtml?.split('\n') || []
  const title = articleLines[0] || ''
  const summary = articleLines[1] || ''
  const bodyLines = articleLines.slice(2, -1) || []
  const conclusion = articleLines[articleLines.length - 1] || ''

  return (
    <div id="reportView">
      <div className="report-topbar">
        <span className="report-back" onClick={onClose}>← 返回收藏</span>
        <span className="report-badge">{analysisState.badgeText || 'AI 分析'}</span>
        <span className="report-close" onClick={onClose}>✕</span>
      </div>
      <div className="report-meta" dangerouslySetInnerHTML={{ __html: analysisState.metaHtml || '' }} />
      <div className="report-article">
        <div className="rp-title-line">{title}</div>
        {summary && <div className="rp-summary">{summary}</div>}
        {bodyLines.map((line, i) => <div key={i} className="rp-para">{line}</div>)}
        {conclusion && <div className="rp-conclusion">{conclusion}</div>}
      </div>
      {analysisState.audioUrl && (
        <div id="reportPlayer" className="report-player">
          <div className="rp-progress">
            <div className="rp-progress-fill" />
          </div>
          <div className="rp-time">
            <span>0:00</span>
            <span>{formatTime(analysisState.audioDuration || 300)}</span>
          </div>
        </div>
      )}
      <div className="report-actions">
        <button className="ra-reanalyze" onClick={onReanalyze}>
          {t('zh', 'reAnalyze')}
        </button>
        <button
          className="ra-play"
          disabled={!analysisState.audioUrl}
          onClick={onTogglePlay}
        >
          {isPlaying ? t('zh', 'reportPause') : t('zh', 'reportPlay')}
        </button>
        {[0.8, 1.0, 1.15, 1.5].map(speed => (
          <button
            key={speed}
            className={`ra-speed ${playbackSpeed === speed ? 'active' : ''}`}
            onClick={() => onSpeedChange(speed)}
          >
            {speed}x
          </button>
        ))}
        {analysisState.audioUrl && (
          <button className="ra-download" onClick={() => {
            const a = document.createElement('a')
            a.href = analysisState.audioUrl!
            a.download = 'techecho-analysis.mp3'
            a.click()
          }}>
            ⬇
          </button>
        )}
      </div>
    </div>
  )
}

function BottomNav({ currentPage, onSwitch, lang }: {
  currentPage: string
  onSwitch: (page: string) => void
  lang: Lang
}) {
  return (
    <div className="bottom-nav">
      <div className="nav-inner">
        <button className={`nav-item ${currentPage === 'home' ? 'active' : ''}`} onClick={() => onSwitch('home')}>
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
          <span>{t(lang, 'navHome')}</span>
        </button>
        <button className={`nav-item ${currentPage === 'collection' ? 'active' : ''}`} onClick={() => onSwitch('collection')}>
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
          </svg>
          <span>{t(lang, 'navFav')}</span>
        </button>
        <button className={`nav-item ${currentPage === 'settings' ? 'active' : ''}`} onClick={() => onSwitch('settings')}>
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          <span>{t(lang, 'navSettings')}</span>
        </button>
      </div>
    </div>
  )
}

function Toast({ message }: { message: string }) {
  if (!message) return null
  return <div className="toast show">{message}</div>
}

// ============ Main App ============

export default function App() {
  const [allNews, setAllNews] = useState<NewsItem[]>([])
  const [filteredNews, setFilteredNews] = useState<NewsItem[]>([])
  const [favorites, setFavorites] = useState<string[]>([])
  const [settings, setSettings] = useState({
    voice: 'voice3',
    threshold: 55,
    darkMode: true
  })
  const [lang, setLang] = useState<Lang>('zh')
  const [currentDateFilter, setCurrentDateFilter] = useState('today')
  const [currentCategory, setCurrentCategory] = useState('all')
  const [currentPage, setCurrentPage] = useState('home')
  const [detailItem, setDetailItem] = useState<NewsItem | null>(null)
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(true)
  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null)

  // Analysis state
  const [analysisState, setAnalysisState] = useState<AnalysisState | null>(null)
  const [showReport, setShowReport] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisAudio, setAnalysisAudio] = useState<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0)

  // Initialize
  useEffect(() => {
    loadSettings()
    loadFavorites()
    loadNews()
    restoreAnalysisState()
  }, [])

  useEffect(() => {
    applyTheme()
    filterNews()
  }, [allNews, lang, currentCategory, currentDateFilter, settings.threshold, favorites])

  const loadSettings = () => {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
      if (raw) {
        setSettings(JSON.parse(raw))
      }
    } catch (_) { /* default */ }
  }

  const saveSettings = (s: typeof settings) => {
    setSettings(s)
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(s))
  }

  const loadFavorites = () => {
    try {
      const raw = localStorage.getItem(FAV_STORAGE_KEY)
      setFavorites(raw ? JSON.parse(raw) : [])
    } catch (_) { setFavorites([]) }
  }

  const loadNews = async () => {
    setLoading(true)
    try {
      const data = await fetchNews()
      setAllNews(data)
    } catch (e) {
      console.error('Failed to load news:', e)
      showToast('加载失败，请确认后端已启动')
    }
    setLoading(false)
  }

  const restoreAnalysisState = () => {
    try {
      const raw = localStorage.getItem(ANALYSIS_STATE_KEY)
      if (raw) {
        const state = JSON.parse(raw)
        if (state.exists) {
          setAnalysisState(state)
        }
      }
    } catch (_) { /* ignore */ }
  }

  const applyTheme = () => {
    document.body.classList.toggle('light-theme', !settings.darkMode)
  }

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2000)
  }

  const filterNews = () => {
    const result = allNews.filter(item => {
      // Language filter
      if (item.lang !== lang && item.lang !== 'both') {
        const hasZh = item.title_zh || item.content_zh
        const hasEn = item.title_en || item.content_en
        if (lang === 'zh' && !hasZh) return false
        if (lang === 'en' && !hasEn) return false
      }
      if (currentCategory !== 'all' && item.category !== currentCategory) return false
      const dateStr = item.published_at || item.created_at || ''
      if (!isInDateRange(dateStr, currentDateFilter)) return false
      if (item.quality && item.quality.total_100 < settings.threshold) return false
      return true
    })
    setFilteredNews(result)
  }

  const isInDateRange = (dateStr: string, filter: string): boolean => {
    if (filter === 'all') return true
    if (!dateStr) return true

    const datePart = dateStr.slice(0, 10)
    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10)
    const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10)
    const monthStart = today.slice(0, 7) + '-01'

    if (filter === 'today') return datePart === today
    if (filter === 'yesterday') return datePart === yesterday
    if (filter === 'week') return datePart >= weekAgo && datePart <= today
    if (filter === 'month') return datePart >= monthStart && datePart <= today

    if (filter.startsWith('day')) {
      const daysAgo = parseInt(filter.substring(3))
      const targetDate = new Date(now.getTime() - daysAgo * 86400000).toISOString().slice(0, 10)
      return datePart === targetDate
    }

    return true
  }

  const handleLangChange = (newLang: Lang) => {
    setLang(newLang)
    clearAnalysisState()
  }

  const handleSpeak = (item: NewsItem) => {
    if (speakingId === item.id) {
      // Stop
      if (currentAudio) {
        currentAudio.pause()
        setCurrentAudio(null)
      }
      if ('speechSynthesis' in window) {
        speechSynthesis.cancel()
      }
      setSpeakingId(null)
      showToast(t(lang, 'stopped'))
      return
    }

    // Stop current
    if (currentAudio) {
      currentAudio.pause()
      setCurrentAudio(null)
    }
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel()
    }

    showToast(t(lang, 'speaking'))

    const text = getDisplayContent(item, lang).slice(0, 500)

    // Try pre-generated audio first
    const preGenAudio = item.audio?.[settings.voice]
    if (preGenAudio) {
      const audio = new Audio(preGenAudio)
      audio.play()
      setCurrentAudio(audio)
      setSpeakingId(item.id)
      audio.onended = () => {
        setSpeakingId(null)
        setCurrentAudio(null)
      }
      return
    }

    // Try backend TTS
    ttsSpeak(text, settings.voice)
      .then(res => {
        if (res.success && res.data?.audio_url) {
          const audio = new Audio(res.data.audio_url)
          audio.play()
          setCurrentAudio(audio)
          setSpeakingId(item.id)
          audio.onended = () => {
            setSpeakingId(null)
            setCurrentAudio(null)
          }
        } else {
          // Fallback to browser TTS
          playBrowserTTS(item)
        }
      })
      .catch(() => playBrowserTTS(item))
  }

  const playBrowserTTS = (item: NewsItem) => {
    if ('speechSynthesis' in window) {
      const text = getDisplayContent(item, lang).slice(0, 500)
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = lang === 'en' ? 'en-US' : 'zh-CN'
      utterance.onstart = () => setSpeakingId(item.id)
      utterance.onend = () => setSpeakingId(null)
      utterance.onerror = () => {
        setSpeakingId(null)
        showToast(t(lang, 'speechFailed'))
      }
      speechSynthesis.speak(utterance)
    } else {
      showToast(t(lang, 'noSupport'))
    }
  }

  const toggleFavorite = (id: string) => {
    const idx = favorites.indexOf(id)
    let updated: string[]
    if (idx === -1) {
      updated = [...favorites, id]
      showToast(t(lang, 'addedFav'))
    } else {
      updated = favorites.filter(fid => fid !== id)
      showToast(t(lang, 'removedFav'))
    }
    setFavorites(updated)
    localStorage.setItem(FAV_STORAGE_KEY, JSON.stringify(updated))
    clearAnalysisState()
  }

  const clearAnalysisState = () => {
    setAnalysisState(null)
    localStorage.removeItem(ANALYSIS_STATE_KEY)
  }

  const handleAnalyze = async () => {
    if (analyzing) return

    const favNews = allNews.filter(item => favorites.includes(item.id))
    if (favNews.length === 0) {
      showToast(t(lang, 'noFavsTip'))
      return
    }

    if (analysisState?.exists) {
      setShowReport(true)
      return
    }

    setAnalyzing(true)
    try {
      const res = await analyzeFavorites(favorites, 10)
      if (!res.success || !res.data?.raw_text) {
        throw new Error('分析失败')
      }

      const rawText = res.data.raw_text
      const lines = rawText.split('\n').filter((l: string) => l.trim().length >= 8)

      if (lines.length < 2) {
        showToast(t(lang, 'incomplete'))
        setAnalyzing(false)
        return
      }

      const html = lines.join('\n')
      const now = new Date()
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      const metaHtml = `${t(lang, 'basedOn')} <strong>${res.data.news_count}</strong> ${t(lang, 'items')} · ${timeStr}`
      const badgeText = res.data.mode === 'rule_based' ? t(lang, 'offlineMode') : t(lang, 'aiMode')

      const newState: AnalysisState = {
        exists: true,
        articleHtml: html,
        metaHtml,
        badgeText,
        newsCount: res.data.news_count,
        mode: res.data.mode,
        timestamp: now.toISOString(),
      }

      // Auto TTS
      if (rawText) {
        try {
          const ttsRes = await ttsSpeak(rawText.slice(0, 2500), settings.voice)
          if (ttsRes.success && ttsRes.data?.audio_url) {
            newState.audioUrl = ttsRes.data.audio_url
            newState.audioDuration = ttsRes.data.duration
          }
        } catch (_) { /* optional */ }
      }

      setAnalysisState(newState)
      localStorage.setItem(ANALYSIS_STATE_KEY, JSON.stringify(newState))
      setShowReport(true)
    } catch (e: any) {
      console.error('Analysis error:', e)
      showToast(t(lang, 'networkError'))
    }
    setAnalyzing(false)
  }

  const toggleReportPlay = () => {
    if (!analysisState?.audioUrl) return

    if (analysisAudio) {
      if (isPlaying) {
        analysisAudio.pause()
        setIsPlaying(false)
      } else {
        analysisAudio.play()
        setIsPlaying(true)
      }
      return
    }

    const audio = new Audio(analysisState.audioUrl)
    audio.playbackRate = playbackSpeed
    audio.play()
    setAnalysisAudio(audio)
    setIsPlaying(true)
    audio.onended = () => {
      setIsPlaying(false)
      setAnalysisAudio(null)
    }
  }

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed)
    if (analysisAudio) {
      analysisAudio.playbackRate = speed
    }
  }

  const getDisplayNews = () => {
    if (currentPage === 'collection') {
      return filteredNews.filter(item => favorites.includes(item.id))
    }
    return filteredNews
  }

  const displayNews = getDisplayNews()

  return (
    <div className={`app ${settings.darkMode ? '' : 'light-theme'}`}>
      {currentPage !== 'settings' && (
        <>
          <Header lang={lang} onLangChange={handleLangChange} onRefresh={loadNews} />
          <DatePicker value={currentDateFilter} onChange={setCurrentDateFilter} lang={lang} />
          <CategoryChips value={currentCategory} onChange={setCurrentCategory} lang={lang} />
          <div className="stats-bar">
            <span>
              <strong>{filteredNews.length}</strong> {t(lang, 'statItems')}
            </span>
          </div>
        </>
      )}

      <div className="feed">
        {loading ? (
          <div className="loading">
            <div className="loading-spinner" />
            <span>{t(lang, 'loading')}</span>
          </div>
        ) : displayNews.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <div className="empty-title">
              {currentPage === 'collection' ? t(lang, 'emptyFavTitle') : t(lang, 'emptyTitle')}
            </div>
            <div className="empty-text">
              {currentPage === 'collection' ? t(lang, 'emptyFavText') : t(lang, 'emptyText')}
            </div>
          </div>
        ) : (
          <>
            {currentPage === 'collection' && (
              <AnalysisHero lang={lang} favorites={favorites} onAnalyze={handleAnalyze} />
            )}
            {displayNews.map(item => (
              <NewsCard
                key={item.id}
                item={item}
                lang={lang}
                favorites={favorites}
                onSpeak={handleSpeak}
                onFavorite={toggleFavorite}
                onClick={() => setDetailItem(item)}
              />
            ))}
          </>
        )}
      </div>

      {currentPage === 'settings' && (
        <SettingsPanel lang={lang} settings={settings} onSettingsChange={saveSettings} />
      )}

      <BottomNav currentPage={currentPage} onSwitch={setCurrentPage} lang={lang} />
      <Toast message={toast} />

      {detailItem && (
        <DetailModal
          item={detailItem}
          lang={lang}
          onClose={() => setDetailItem(null)}
          onSpeak={() => handleSpeak(detailItem)}
          onFavorite={() => toggleFavorite(detailItem.id)}
        />
      )}

      {showReport && analysisState && (
        <ReportView
          analysisState={analysisState}
          onClose={() => setShowReport(false)}
          onReanalyze={handleAnalyze}
          onTogglePlay={toggleReportPlay}
          onSpeedChange={handleSpeedChange}
          playbackSpeed={playbackSpeed}
          isPlaying={isPlaying}
        />
      )}
    </div>
  )
}
