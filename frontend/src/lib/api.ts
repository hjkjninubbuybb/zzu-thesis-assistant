import axios from 'axios'
import type {
  KBInfo, KBCreate, DocInfo, UploadParams, SystemConfig, ConfigUpdate,
  FAQItem, FAQCreate, FAQUpdate, FAQSearchResponse, FAQImportResult,
  ConversationInfo, ConversationMessage,
  LoginResponse, UserInfo, UserCreate, UserUpdate, PaginatedUsers,
  StudentProfileCreate, ApiKeyInfo, AnalyticsSummary,
} from '@/types/api'
import { getAccessToken, getRefreshToken, saveAuth, clearAuth } from '@/lib/auth'

const client = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

// ── Request 拦截器：附加 Authorization 头 ──────────────────────

client.interceptors.request.use(config => {
  const token = getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ── Response 拦截器：401 时尝试 refresh，否则跳转登录 ────────────

let _refreshing = false
let _refreshQueue: Array<(token: string) => void> = []

client.interceptors.response.use(
  res => res,
  async error => {
    const original = error.config
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error)
    }
    original._retry = true

    const refreshToken = getRefreshToken()
    if (!refreshToken) {
      clearAuth()
      window.location.href = '/login'
      return Promise.reject(error)
    }

    if (_refreshing) {
      return new Promise(resolve => {
        _refreshQueue.push((token: string) => {
          original.headers.Authorization = `Bearer ${token}`
          resolve(client(original))
        })
      })
    }

    _refreshing = true
    try {
      const { data } = await axios.post<LoginResponse>('/api/auth/refresh', {
        refresh_token: refreshToken,
      })
      saveAuth(data)
      original.headers.Authorization = `Bearer ${data.access_token}`
      _refreshQueue.forEach(cb => cb(data.access_token))
      _refreshQueue = []
      return client(original)
    } catch {
      clearAuth()
      window.location.href = '/login'
      return Promise.reject(error)
    } finally {
      _refreshing = false
    }
  },
)

export function extractError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.detail ?? error.message
  }
  return String(error)
}

// ── 认证 API ──────────────────────────────────────────────

export const authApi = {
  login: (username: string, password: string) => {
    const form = new URLSearchParams()
    form.append('username', username)
    form.append('password', password)
    return axios.post<LoginResponse>('/api/auth/login', form, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }).then(r => r.data)
  },
  refresh: (refreshToken: string) =>
    axios.post<LoginResponse>('/api/auth/refresh', { refresh_token: refreshToken }).then(r => r.data),
  me: () => client.get<UserInfo>('/auth/me').then(r => r.data),
  changePassword: (oldPassword: string, newPassword: string) =>
    client.put<{ message: string }>('/auth/me/password', {
      old_password: oldPassword,
      new_password: newPassword,
    }).then(r => r.data),
}

// ── 用户管理 API ──────────────────────────────────────────

export const userApi = {
  list: (params?: { role?: string; page?: number; page_size?: number }) =>
    client.get<PaginatedUsers>('/users', { params }).then(r => r.data),
  create: (body: UserCreate) =>
    client.post<UserInfo>('/users', body).then(r => r.data),
  get: (id: number) =>
    client.get<UserInfo>(`/users/${id}`).then(r => r.data),
  update: (id: number, body: UserUpdate) =>
    client.put<UserInfo>(`/users/${id}`, body).then(r => r.data),
  updateStudentProfile: (id: number, body: StudentProfileCreate) =>
    client.put(`/users/${id}/profile`, { student_profile: body }).then(r => r.data),
  delete: (id: number) =>
    client.delete<{ message: string }>(`/users/${id}`).then(r => r.data),
  resetPassword: (id: number, newPassword: string) =>
    client.put<{ message: string }>(`/users/${id}/reset-password`, { new_password: newPassword }).then(r => r.data),
  downloadTemplate: () => {
    client.get('/users/students/template', { responseType: 'blob' }).then(r => {
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      a.href = url
      a.download = '学生账号导入模板.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    })
  },
  exportStudents: () => {
    client.get('/users/students/export', { responseType: 'blob' }).then(r => {
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `学生账号_${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    })
  },
  importStudents: (file: File, defaultPassword?: string) => {
    const form = new FormData()
    form.append('file', file)
    if (defaultPassword) form.append('default_password', defaultPassword)
    return client.post<{ total: number; success: number; skipped: number; failed: number; errors: unknown[] }>(
      '/users/students/import', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60_000,
      }
    ).then(r => r.data)
  },
}

// ── 知识库 API ────────────────────────────────────────────

export const knowledgeApi = {
  list: () => client.get<KBInfo[]>('/knowledge').then(r => r.data),
  create: (body: KBCreate) => client.post<KBInfo>('/knowledge', body).then(r => r.data),
  delete: (name: string) => client.delete<{ message: string }>(`/knowledge/${name}`).then(r => r.data),
}

// ── 文档 API ──────────────────────────────────────────────

export const documentApi = {
  list: (kbName: string) =>
    client.get<DocInfo[]>(`/document/${kbName}`).then(r => r.data),

  upload: (
    kbName: string,
    file: File,
    params: UploadParams,
    onProgress?: (pct: number) => void,
  ) => {
    const form = new FormData()
    form.append('file', file)
    form.append('splitter_type', params.splitter_type)
    form.append('chunk_size', String(params.chunk_size))
    form.append('chunk_overlap_ratio', String(params.chunk_overlap_ratio))
    form.append('enable_cleaning', String(params.enable_cleaning))
    form.append('doc_type', params.doc_type)
    return client.post<DocInfo>(`/document/${kbName}/upload`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 600000,
      onUploadProgress: e => {
        if (onProgress && e.total) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      },
    }).then(r => r.data)
  },

  delete: (kbName: string, docId: number) =>
    client.delete<{ message: string }>(`/document/${kbName}/${docId}`).then(r => r.data),
}

// ── 配置 API ──────────────────────────────────────────────

export const configApi = {
  get: () => client.get<SystemConfig>('/config').then(r => r.data),
  update: (body: ConfigUpdate) => client.post<SystemConfig>('/config', body).then(r => r.data),
  getApiKey: () => client.get<ApiKeyInfo>('/config/api-key').then(r => r.data),
  updateApiKey: (apiKey: string) =>
    client.put<{ message: string; has_key: boolean }>('/config/api-key', { api_key: apiKey }).then(r => r.data),
  testApiKey: () =>
    client.post<{ ok: boolean; message: string }>('/config/api-key/test').then(r => r.data),
}

// ── FAQ API ───────────────────────────────────────────────

export const faqApi = {
  list:   (kbName: string) =>
    client.get<FAQItem[]>(`/faq/${kbName}`).then(r => r.data),
  search: (kbName: string, q: string) =>
    client.get<FAQSearchResponse>(`/faq/${kbName}/search`, { params: { q } }).then(r => r.data),
  create: (kbName: string, body: FAQCreate) =>
    client.post<FAQItem>(`/faq/${kbName}`, body).then(r => r.data),
  update: (kbName: string, id: number, body: FAQUpdate) =>
    client.put<FAQItem>(`/faq/${kbName}/${id}`, body).then(r => r.data),
  delete: (kbName: string, id: number) =>
    client.delete<{ message: string }>(`/faq/${kbName}/${id}`).then(r => r.data),
  downloadTemplate: (kbName: string) => {
    client.get(`/faq/${kbName}/template`, { responseType: 'blob' }).then(r => {
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      a.href = url
      a.download = 'FAQ_导入模板.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    })
  },
  exportExcel: (kbName: string) => {
    client.get(`/faq/${kbName}/export`, { responseType: 'blob' }).then(r => {
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `${kbName}_FAQ.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    })
  },
  importExcel: (kbName: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    form.append('skip_duplicates', 'true')
    return client.post<FAQImportResult>(`/faq/${kbName}/import`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120_000,
    }).then(r => r.data)
  },
}

// ── 统计 API ──────────────────────────────────────────────

export const analyticsApi = {
  summary: () => client.get<AnalyticsSummary>('/analytics/summary').then(r => {
    const d = r.data
    if (!d || typeof d !== 'object' || !Array.isArray((d as AnalyticsSummary).week_data)) {
      throw new Error('统计接口返回数据无效，请确认后端已重启')
    }
    return d
  }),
}

// ── 对话 API ──────────────────────────────────────────────

export const conversationApi = {
  list: (kbName?: string) =>
    client.get<ConversationInfo[]>('/conversation', { params: kbName ? { kb_name: kbName } : {} }).then(r => r.data),
  create: (kbName: string, title?: string) =>
    client.post<ConversationInfo>('/conversation', { kb_name: kbName, title: title ?? '新对话' }).then(r => r.data),
  get: (convId: number) =>
    client.get<{ conversation: ConversationInfo; messages: ConversationMessage[] }>(`/conversation/${convId}`).then(r => r.data),
  updateTitle: (convId: number, title: string) =>
    client.put<ConversationInfo>(`/conversation/${convId}/title`, { title }).then(r => r.data),
  delete: (convId: number) =>
    client.delete<{ message: string }>(`/conversation/${convId}`).then(r => r.data),
  addMessage: (convId: number, msg: { role: string; content: string; sources?: unknown[] | null; files?: unknown[] | null }) =>
    client.post<ConversationMessage>(`/conversation/${convId}/messages`, msg).then(r => r.data),
  submitFeedback: (messageId: number, rating: 'up' | 'down') =>
    client.post<{ message_id: number; rating: string }>(`/conversation/messages/${messageId}/feedback`, { rating }).then(r => r.data),
}
