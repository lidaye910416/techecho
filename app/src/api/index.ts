/**
 * Tech Echo API 接口 — 适配微信小程序 (Taro.request)
 *
 * H5 开发环境使用 fetch，小程序编译后自动使用 Taro.request
 */

import Taro from '@tarojs/taro'

// 基础配置 — 小程序正式环境需替换为生产域名
const BASE_URL = process.env.TARO_APP_API_BASE || 'http://localhost:8001'

// ============ 通用请求封装 ============

async function request<T = any>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  data?: any,
  options?: { header?: Record<string, string> }
): Promise<T> {
  // 检查 token（微信登录后存于 storage）
  let token = ''
  try {
    token = Taro.getStorageSync('auth_token') || ''
  } catch (_) {
    /* 未登录 */
  }

  const header: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.header || {}),
  }
  if (token) {
    header['Authorization'] = `Bearer ${token}`
  }

  try {
    const res = await Taro.request({
      url: `${BASE_URL}${path}`,
      method,
      data,
      header,
      timeout: 30000,
    })

    if (res.statusCode === 200) {
      return res.data as T
    }

    // 401 → 清除过期 token
    if (res.statusCode === 401) {
      try {
        Taro.removeStorageSync('auth_token')
      } catch (_) {
        /* ignore */
      }
    }

    throw new Error(`HTTP ${res.statusCode}: ${JSON.stringify(res.data)}`)
  } catch (err: any) {
    // 开发阶段 H5 降级到 fetch（Taro.request 在 H5 也有效，此处为兜底）
    if (err?.errMsg?.includes?.('request:fail') && typeof fetch !== 'undefined') {
      console.warn('[API] Taro.request 失败，降级到 fetch:', err.errMsg)
      return fallbackFetch(method, path, data, header)
    }
    throw err
  }
}

/** H5 环境 fallback — 使用原生 fetch */
async function fallbackFetch<T>(
  method: string,
  path: string,
  data?: any,
  header?: Record<string, string>
): Promise<T> {
  const fetchOptions: RequestInit = {
    method,
    headers: header,
  }
  if (data && method !== 'GET') {
    fetchOptions.body = JSON.stringify(data)
  }
  const res = await fetch(`${BASE_URL}${path}`, fetchOptions)
  return res.json()
}

// ============ 类型定义 ============

interface ApiResponse<T = any> {
  success: boolean
  data: T
  message?: string
  total?: number
}

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
  audio?: Record<string, string>
}

// ============ 认证 API ============

export interface LoginResult {
  success: boolean
  token: string
  user_id: string
  nickname: string
  avatar_url: string
  is_new_user: boolean
  message: string
}

/** 微信小程序登录 */
export async function wechatLogin(code: string, nickname?: string, avatarUrl?: string): Promise<LoginResult> {
  return request<LoginResult>('POST', '/api/auth/wechat-login', {
    code,
    nickname,
    avatar_url: avatarUrl,
  })
}

/** 获取用户信息 */
export async function getUserInfo(token: string): Promise<ApiResponse<{
  user_id: string
  nickname: string
  avatar_url: string
  created_at: string
  last_login_at: string
  login_count: number
}>> {
  return request('GET', `/api/auth/user-info?token=${token}`)
}

// ============ 资讯 API ============

export async function getNewsList(params: {
  lang?: string
  category?: string
  date?: string
  min_quality?: number
  limit?: number
}): Promise<ApiResponse<NewsItem[]>> {
  const query: string[] = []
  if (params.lang) query.push(`lang=${params.lang}`)
  if (params.category) query.push(`category=${params.category}`)
  if (params.date) query.push(`date=${params.date}`)
  if (params.min_quality) query.push(`min_quality=${String(params.min_quality)}`)
  if (params.limit) query.push(`limit=${String(params.limit)}`)

  const qs = query.length > 0 ? `?${query.join('&')}` : ''
  const json = await request<any>('GET', `/api/news${qs}`)

  if (json.success && json.data && json.data.items) {
    return { ...json, data: json.data.items }
  }
  return json
}

export async function getNewsStats(): Promise<ApiResponse<{
  lastUpdate: string
  totalCount: number
  stats: Record<string, number>
  categories: string[]
}>> {
  return request('GET', '/api/news/stats')
}

export async function getNewsDetail(id: string): Promise<ApiResponse<NewsItem>> {
  return request('GET', `/api/news/${id}`)
}

export async function readNewsAloud(
  id: string,
  voiceId: string = 'female-tianmei'
): Promise<ApiResponse<{ audio_url: string }>> {
  return request('POST', `/api/news/${id}/read?voice_id=${voiceId}`)
}

export async function markAsRead(id: string): Promise<ApiResponse> {
  return request('PUT', `/api/news/${id}/read`)
}

export async function triggerCollect(targetDate?: string): Promise<ApiResponse> {
  return request('POST', '/api/news/collect', { target_date: targetDate })
}

// ============ 语音 API ============

export interface VoiceOption {
  id: string
  name: string
  gender: string
  age: string
  available: boolean
}

export async function getVoices(): Promise<{ voices: VoiceOption[] }> {
  return request('GET', '/api/voices')
}

// ============ 收藏 & TTS API ============

export interface TTSResult {
  success: boolean
  data?: {
    audio_url: string
    duration: number
    text_length: number
  }
}

/** 文本转语音 */
export async function ttsSpeak(text: string, voice?: string): Promise<TTSResult> {
  return request('POST', '/api/favorites/tts', { text, voice })
}

export interface AnalysisResult {
  success: boolean
  data?: {
    raw_text: string
    news_count: number
    mode: 'ai' | 'rule_based'
    audio_url?: string
  }
}

/** AI 分析收藏的新闻 */
export async function analyzeFavorites(newsIds: string[], limit?: number): Promise<AnalysisResult> {
  return request('POST', '/api/favorites/analyze', { news_ids: newsIds, limit: limit || 10 })
}

// ============ 辅助函数 ============

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

/** 分类 Emoji 映射 */
export const CATEGORY_EMOJIS: Record<string, string> = {
  ai: '🤖', tools: '🔧', news: '📰', product: '💡'
}

/** 分类中文名 */
export const CATEGORY_NAMES: Record<string, string> = {
  ai: 'AI', tools: '工具', news: '动态', product: '产品'
}

/** 日期筛选选项 */
export const DATE_FILTERS = [
  { key: 'today', label: '今天' },
  { key: 'yesterday', label: '昨天' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
  { key: 'all', label: '全部' },
]

/** 根据日期筛选 key 判断新闻是否在范围内 */
export function isInDateRange(dateStr: string | undefined, filter: string): boolean {
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

  // 支持 day2, day3, ... day6 格式
  if (filter.startsWith('day')) {
    const daysAgo = parseInt(filter.substring(3))
    const targetDate = new Date(now.getTime() - daysAgo * 86400000).toISOString().slice(0, 10)
    return datePart === targetDate
  }

  return true
}

export type { NewsItem, QualityScore, ApiResponse }
