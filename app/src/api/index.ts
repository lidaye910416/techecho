/**
 * Tech Echo API 接口 — 适配微信小程序 (wx.cloud.callContainer)
 *
 * 微信云托管使用 wx.cloud.callContainer 访问后端服务
 */

// 微信云托管环境 ID（从环境变量或 Taro 编译时配置获取）
const CLOUD_ENV = process.env.TARO_APP_CLOUD_ENV || 'prod-d9g7e5osy7b5e7a9c'

// 微信云托管服务名称（从环境变量获取）
const CLOUD_SERVICE = process.env.TARO_APP_CLOUD_SERVICE || 'test1'

/** 获取微信云托管实例 */
function getCloudContainer() {
  if (typeof wx !== 'undefined' && wx.cloud) {
    return wx.cloud
  }
  // H5 环境 fallback
  return null
}

/** 将相对路径转换为完整音频 URL */
export function getAudioUrl(relativePath: string): string {
  if (!relativePath) return ''
  // 如果已经是完整 URL，直接返回
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
    return relativePath
  }
  // 转换为完整 URL（使用云托管内网地址，微信自动路由）
  return relativePath
}

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
    'X-WX-SERVICE': CLOUD_SERVICE, // 云托管服务名称
    ...(options?.header || {}),
  }
  if (token) {
    header['Authorization'] = `Bearer ${token}`
  }

  const cloud = getCloudContainer()
  if (!cloud) {
    // 非微信环境，使用普通 fetch
    return fallbackFetch(method, path, data, header)
  }

  try {
    const res = await cloud.callContainer({
      config: {
        env: CLOUD_ENV,
      },
      path,
      method,
      data,
      header,
      timeout: 15000,
    })

    if (res?.statusCode === 200) {
      return res.data as T
    }

    // 401 → 清除过期 token
    if (res?.statusCode === 401) {
      try {
        Taro.removeStorageSync('auth_token')
      } catch (_) {
        /* ignore */
      }
    }

    throw new Error(`HTTP ${res?.statusCode}: ${JSON.stringify(res?.data)}`)
  } catch (err: any) {
    console.error('[API] cloud.callContainer 失败:', err)
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
  // H5 环境直接使用相对路径，由 dev server 代理
  const res = await fetch(path, fetchOptions)
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

/** 日期选项类型（对标 H5 generateDateOptions） */
export interface DateFilterOption {
  key: string          // 'today' | 'yesterday' | 'day6'..'day2' | 'week' | 'month' | 'all'
  label: string        // 显示标签，如 "今天" "昨天" "本周" 等
  dayLabel: string     // 顶部小标签（TODAY/YDAY/...），空字符串表示无标签
  value: string        // 日期值，如 "7" "∞" 或具体日期数字
  isSpecific: boolean  // 是否为具体某天（dayN / today / yesterday）
}

/**
 * 动态生成日期筛选选项 — 对标 H5 generateDateOptions()
 * 包含：6 天前的逐日 + 昨天 + 今天 + 本周 + 本月 + 全部
 */
export function getDateFilters(labels?: {
  today?: string; yesterday?: string; week?: string; month?: string; all?: string
}): DateFilterOption[] {
  const opts: DateFilterOption[] = []
  const today = new Date()
  const t = labels || {}

  // 左侧：6 天前 → 2 天前（无标签，仅显示日期数字）
  for (let i = 6; i >= 2; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    opts.push({
      key: 'day' + i,
      label: String(d.getDate()),
      dayLabel: '',
      value: String(d.getDate()),
      isSpecific: true,
    })
  }

  // 昨天
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  opts.push({
    key: 'yesterday',
    label: t.yesterday || '昨天',
    dayLabel: 'YDAY',
    value: String(yesterday.getDate()),
    isSpecific: true,
  })

  // 今天 — 中心位置
  opts.push({
    key: 'today',
    label: t.today || '今天',
    dayLabel: 'TODAY',
    value: String(today.getDate()),
    isSpecific: true,
  })

  // 本周
  opts.push({
    key: 'week',
    label: t.week || '本周',
    dayLabel: 'WEEK',
    value: '7',
    isSpecific: false,
  })

  // 本月 — 显示当月天数
  const year = today.getFullYear()
  const month = today.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  opts.push({
    key: 'month',
    label: t.month || '本月',
    dayLabel: 'MON',
    value: String(daysInMonth),
    isSpecific: false,
  })

  return opts
}

/**
 * 安全地从各种日期字符串格式中提取 YYYY-MM-DD
 * 支持: "2026-05-07 10:00:00", "Sat, 09 May 2026 07:20:00 +0800", "2026-05-08 09:31:04  +0800"
 */
function extractDatePart(dateStr: string): string | null {
  if (!dateStr) return null

  // 优先匹配 YYYY-MM-DD 前缀（最快，覆盖 90% 场景）
  const isoMatch = dateStr.match(/^(\d{4}-\d{2}-\d{2})/)
  if (isoMatch) return isoMatch[1]

  // 解析 RFC 2822 格式（iOS 不支持，需手动解析）
  // 格式: "Wed, 13 May 2026 07:59:36 +0800"
  const rfcMatch = dateStr.match(/^[A-Za-z]{3},\s+(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/)
  if (rfcMatch) {
    const [, day, monthStr, year, hour, min, sec] = rfcMatch
    const monthMap: Record<string, string> = {
      Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
      Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
    }
    const month = monthMap[monthStr]
    if (month) {
      return `${year}-${month}-${day.padStart(2, '0')}`
    }
  }

  // 尝试标准 Date 解析（作为兜底）
  try {
    const parsed = new Date(dateStr)
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10)
    }
  } catch (_) { /* ignore */ }

  return null
}

/** 根据日期筛选 key 判断新闻是否在范围内 */
export function isInDateRange(dateStr: string | undefined, filter: string): boolean {
  if (filter === 'all') return true
  if (!dateStr) return true

  const datePart = extractDatePart(dateStr)
  if (!datePart) return true // 无法解析则不过滤

  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10)
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10)
  const monthStart = today.slice(0, 7) + '-01'

  if (filter === 'today') return datePart === today
  if (filter === 'yesterday') return datePart === yesterday
  if (filter === 'week') return datePart >= weekAgo && datePart <= today
  if (filter === 'month') return datePart >= monthStart && datePart <= today

  // 具体某天：day6, day5, ..., day2
  const dayMatch = filter.match(/^day(\d+)$/)
  if (dayMatch) {
    const daysAgo = parseInt(dayMatch[1], 10)
    const target = new Date(now.getTime() - daysAgo * 86400000).toISOString().slice(0, 10)
    return datePart === target
  }

  return true
}

export type { NewsItem, QualityScore, ApiResponse }
