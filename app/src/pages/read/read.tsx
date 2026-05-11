import { useState, useEffect } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { getNewsDetail, readNewsAloud, markAsRead, NewsItem, getDisplayTitle } from '../../api'
import { useTheme } from '../../hooks/useTheme'
import './read.scss'

const CATEGORY_LABELS: Record<string, string> = {
  ai: '人工智能',
  tools: '工具推荐',
  news: '科技动态',
  product: '产品发布'
}

export default function Read() {
  const { darkMode } = useTheme()
  // navigationStyle: 'custom' — 自定义导航栏，需手动适配状态栏高度
  const statusBarHeight = (Taro.getSystemInfoSync?.().statusBarHeight || 20) as number
  const headerPaddingTop = `${statusBarHeight + 8}px`
  const [news, setNews] = useState<NewsItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [showFullContent, setShowFullContent] = useState(false)

  useEffect(() => {
    const page = Taro.getCurrentInstance()
    const id = page.router?.params?.id
    if (id) {
      loadNews(id)
    }
  }, [])

  const loadNews = async (id: string) => {
    setLoading(true)
    try {
      const res = await getNewsDetail(id)
      if (res.success && res.data) {
        setNews(res.data)
        await markAsRead(id)
      }
    } catch (e) {
      console.error('Load news failed:', e)
    }
    setLoading(false)
  }

  const handleReadAloud = async () => {
    if (!news) return

    if (audioUrl) {
      setIsPlaying(!isPlaying)
      return
    }

    setIsGenerating(true)
    try {
      const res = await readNewsAloud(news.id)
      if (res.success && res.data?.audio_url) {
        setAudioUrl(res.data.audio_url)
        setIsPlaying(true)
      }
    } catch (e) {
      console.error('Generate audio failed:', e)
      Taro.showToast({ title: '生成失败', icon: 'none' })
    }
    setIsGenerating(false)
  }

  const handleOpenSource = () => {
    if (news?.source_url) {
      Taro.setClipboardData({ data: news.source_url })
      Taro.showToast({ title: '链接已复制', icon: 'success' })
    }
  }

  const handleBack = () => {
    Taro.navigateBack()
  }

  if (loading) {
    return (
      <View className="read-page">
        <View className="loading-state">
          <View className="loading-spinner" />
          <Text className="loading-text">加载中...</Text>
        </View>
      </View>
    )
  }

  if (!news) {
    return (
      <View className="read-page">
        <View className="error-state">
          <Text className="error-icon">📭</Text>
          <Text className="error-text">资讯不存在</Text>
        </View>
      </View>
    )
  }

  const title = getDisplayTitle(news)
  const summary = news.summary_zh || news.summary_en || ''
  const content = news.content_zh || news.content_en || ''
  const source = news.source_zh || news.source_en || ''
  const categoryLabel = CATEGORY_LABELS[news.category] || news.category

  // 处理内容显示（限制字数）
  const maxContentLength = 500
  const isLongContent = content.length > maxContentLength
  const displayContent = showFullContent || !isLongContent
    ? content
    : content.slice(0, maxContentLength) + '...'

  return (
    <View className={`read-page${darkMode ? '' : ' read-light'}`}>
      {/* 顶部导航栏 */}
      <View className="navbar" style={{ paddingTop: headerPaddingTop }}>
        <View className="navbar-back" onClick={handleBack}>
          <Text className="back-icon">←</Text>
          <Text className="back-text">返回</Text>
        </View>
        <View className="navbar-actions">
          <View className="share-btn">
            <Text>🔗</Text>
          </View>
        </View>
      </View>

      {/* 主内容区 */}
      <View className="content-wrapper">
        {/* 头部卡片 */}
        <View className="header-card">
          {/* 标签行 */}
          <View className="tags-row">
            <View className="tag category-tag">
              <Text className="tag-text">{categoryLabel}</Text>
            </View>
            <View className="tag lang-tag">
              <Text className="tag-text">{news.lang === 'zh' ? '中文' : 'EN'}</Text>
            </View>
          </View>

          {/* 标题 */}
          <Text className="article-title">{title}</Text>

          {/* 元信息 */}
          <View className="meta-info">
            <View className="source-badge">
              <Text className="source-name">{source}</Text>
            </View>
            <Text className="pub-date">{news.published_at?.slice(0, 16)}</Text>
          </View>
        </View>

        {/* 摘要卡片 */}
        {summary && (
          <View className="summary-card">
            <View className="card-header">
              <Text className="card-title">📝 摘要</Text>
            </View>
            <Text className="summary-text">{summary}</Text>
          </View>
        )}

        {/* 正文卡片 */}
        <View className="content-card">
          <View className="card-header">
            <Text className="card-title">📄 正文</Text>
          </View>
          <Text className="content-text">{displayContent}</Text>
          {isLongContent && (
            <View className="expand-btn" onClick={() => setShowFullContent(!showFullContent)}>
              <Text className="expand-text">
                {showFullContent ? '收起' : '展开全文'}
              </Text>
            </View>
          )}
        </View>

        {/* 原文链接 */}
        {news.source_url && (
          <View className="source-link-card">
            <Text className="link-label">📎 原文链接</Text>
            <Text className="link-url" onClick={handleOpenSource}>{news.source_url}</Text>
          </View>
        )}
      </View>

      {/* 底部操作栏 */}
      <View className="action-bar">
        <View className="action-btn secondary" onClick={handleOpenSource}>
          <Text className="action-icon">🔗</Text>
          <Text className="action-text">复制链接</Text>
        </View>

        <View className="action-btn primary" onClick={handleReadAloud}>
          <Text className="action-icon">{audioUrl ? (isPlaying ? '⏸️' : '▶️') : '🔊'}</Text>
          <Text className="action-text">
            {isGenerating ? '生成中...' : (audioUrl ? (isPlaying ? '暂停' : '朗读') : '生成语音')}
          </Text>
        </View>

        <View className="action-btn secondary" onClick={() => Taro.showModal({ title: '功能开发中', content: '数字人播报功能正在开发中，敬请期待！', showCancel: false })}>
          <Text className="action-icon">🎬</Text>
          <Text className="action-text">数字人</Text>
        </View>
      </View>
    </View>
  )
}
