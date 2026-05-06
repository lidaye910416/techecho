/**
 * Tech Echo API 接口
 */

// 基础配置
const BASE_URL = 'http://localhost:8001'

// API 响应格式
interface ApiResponse<T = any> {
  success: boolean
  data: T
  message?: string
  total?: number
}

// 质量评分
interface QualityScore {
  total_100: number
  weighted_total: number
  grade: 'A+' | 'A' | 'B' | 'C' | 'D'
  scores: {
    completeness: number
    language: number
    title: number
    source_credibility: number
    info_density: number
    actionability: number
    impact: number
    originality: number
  }
  issues: string[]
}

// 新闻条目 - 与后端数据结构对齐
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
  quality: QualityScore
  is_read?: boolean
  is_favorited?: boolean
  audio_url?: string
}

// 新闻集合响应
interface NewsListResponse {
  items: NewsItem[]
  total: number
}

// 获取资讯列表
export async function getNewsList(params: {
  lang?: string
  category?: string
  date?: string  // YYYY-MM-DD 格式
  min_quality?: number
  limit?: number
}): Promise<ApiResponse<NewsItem[]>> {
  const query = new URLSearchParams()
  if (params.lang) query.set('lang', params.lang)
  if (params.category) query.set('category', params.category)
  if (params.date) query.set('date', params.date)
  if (params.min_quality) query.set('min_quality', String(params.min_quality))
  if (params.limit) query.set('limit', String(params.limit))

  const res = await fetch(`${BASE_URL}/api/news?${query}`)
  const json = await res.json()

  // 兼容处理：后端返回 {success, data: {items: [...]}} 或 {success, data: [...]}
  if (json.success && json.data && json.data.items) {
    return { ...json, data: json.data.items }
  }
  return json
}

// 获取新闻统计数据
export async function getNewsStats(): Promise<ApiResponse<{
  lastUpdate: string
  totalCount: number
  stats: Record<string, number>
  categories: string[]
}>> {
  const res = await fetch(`${BASE_URL}/api/news/stats`)
  return res.json()
}

// 获取新闻详情
export async function getNewsDetail(id: string): Promise<ApiResponse<NewsItem>> {
  const res = await fetch(`${BASE_URL}/api/news/${id}`)
  return res.json()
}

// 朗读新闻
export async function readNewsAloud(
  id: string,
  voiceId: string = 'female-tianmei'
): Promise<ApiResponse<{ audio_url: string }>> {
  const res = await fetch(
    `${BASE_URL}/api/news/${id}/read?voice_id=${voiceId}`,
    { method: 'POST' }
  )
  return res.json()
}

// 标记已读
export async function markAsRead(id: string): Promise<ApiResponse> {
  const res = await fetch(`${BASE_URL}/api/news/${id}/read`, {
    method: 'PUT'
  })
  return res.json()
}

// 手动触发收集
export async function triggerCollect(targetDate?: string): Promise<ApiResponse> {
  const res = await fetch(`${BASE_URL}/api/news/collect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_date: targetDate })
  })
  return res.json()
}

// 辅助函数：从 NewsItem 获取显示用的标题和来源
export function getDisplayTitle(item: NewsItem): string {
  return item.title_zh || item.title_en || ''
}

export function getDisplaySource(item: NewsItem): string {
  return item.source_zh || item.source_en || ''
}

export function getDisplaySummary(item: NewsItem): string {
  return item.summary_zh || item.summary_en || ''
}

export function getDisplayContent(item: NewsItem): string {
  return item.content_zh || item.content_en || ''
}

export type { NewsItem, QualityScore }
