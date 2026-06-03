import axios from 'axios';
import type {
  KBInfo,
  KBCreate,
  ActiveKBInfo,
  DocInfo,
  DocDetail,
  DocUpdate,
  UploadParams,
  CleanResult,
  ChunkPreviewResult,
  ConfirmIndexResult,
  ReviewDetail,
  SystemConfig,
  ConfigUpdate,
  FAQItem,
  FAQCreate,
  FAQUpdate,
  FAQSearchResponse,
  FAQImportResult,
  ConversationInfo,
  ConversationMessage,
  PaginatedConversations,
  LoginResponse,
  UserInfo,
  UserCreate,
  UserUpdate,
  PaginatedUsers,
  PaginatedFAQs,
  PaginatedTickets,
  PaginatedDocs,
  StudentProfileCreate,
  TeacherProfileCreate,
  ApiKeyInfo,
  AnalyticsSummary,
  QARequestInfo,
  QARequestCreate,
  ImportResult,
} from '@shared/types/api';
import {
  getAccessToken,
  getRefreshToken,
  saveAuth,
  clearAuth,
  getCurrentPortal,
} from '@shared/lib/auth';
import { downloadBlob } from '@shared/lib/download';

// Base URL 优先来自环境变量（生产/跨域部署），默认走 Vite dev 代理。
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

// ── Request 拦截器：附加 Authorization 头 ──────────────────────

client.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response 拦截器：401 时尝试 refresh，否则跳转登录 ────────────

let _refreshing = false;
let _refreshQueue: Array<(token: string) => void> = [];

client.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }
    original._retry = true;

    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      const p = getCurrentPortal();
      clearAuth(p);
      window.location.href = p === 'student' ? '/student/login' : '/admin/login';
      return Promise.reject(error);
    }

    if (_refreshing) {
      return new Promise((resolve) => {
        _refreshQueue.push((token: string) => {
          original.headers.Authorization = `Bearer ${token}`;
          resolve(client(original));
        });
      });
    }

    _refreshing = true;
    try {
      const { data } = await axios.post<LoginResponse>('/api/auth/refresh', {
        refresh_token: refreshToken,
      });
      saveAuth(data);
      original.headers.Authorization = `Bearer ${data.access_token}`;
      _refreshQueue.forEach((cb) => cb(data.access_token));
      _refreshQueue = [];
      return client(original);
    } catch {
      const p = getCurrentPortal();
      clearAuth(p);
      window.location.href = p === 'student' ? '/student/login' : '/admin/login';
      return Promise.reject(error);
    } finally {
      _refreshing = false;
    }
  },
);

// ── 认证 API ──────────────────────────────────────────────

export const authApi = {
  login: (username: string, password: string) => {
    const form = new URLSearchParams();
    form.append('username', username);
    form.append('password', password);
    return axios
      .post<LoginResponse>('/api/auth/login', form, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      .then((r) => r.data);
  },
  refresh: (refreshToken: string) =>
    axios
      .post<LoginResponse>('/api/auth/refresh', { refresh_token: refreshToken })
      .then((r) => r.data),
  me: () => client.get<UserInfo>('/auth/me').then((r) => r.data),
  changePassword: (oldPassword: string, newPassword: string) =>
    client
      .put<{ message: string }>('/auth/me/password', {
        old_password: oldPassword,
        new_password: newPassword,
      })
      .then((r) => r.data),
};

// ── 用户管理 API ──────────────────────────────────────────

export const userApi = {
  list: (params?: { role?: string; page?: number; page_size?: number }) =>
    client.get<PaginatedUsers>('/users', { params }).then((r) => r.data),
  create: (body: UserCreate) => client.post<UserInfo>('/users', body).then((r) => r.data),
  get: (id: number) => client.get<UserInfo>(`/users/${id}`).then((r) => r.data),
  update: (id: number, body: UserUpdate) =>
    client.put<UserInfo>(`/users/${id}`, body).then((r) => r.data),
  updateStudentProfile: (id: number, body: StudentProfileCreate) =>
    client.put(`/users/${id}/profile`, { student_profile: body }).then((r) => r.data),
  delete: (id: number) => client.delete<{ message: string }>(`/users/${id}`).then((r) => r.data),
  resetPassword: (id: number, newPassword: string) =>
    client
      .put<{
        message: string;
      }>(`/users/${id}/reset-password`, { new_password: newPassword })
      .then((r) => r.data),

  // 教师相关
  downloadTeacherTemplate: () => {
    client
      .get('/users/teachers/template', { responseType: 'blob' })
      .then((r) => downloadBlob(r.data, '教师账号导入模板.xlsx'));
  },
  exportTeachers: () => {
    client.get('/users/teachers/export', { responseType: 'blob' }).then((r) => {
      downloadBlob(r.data, `教师账号_${new Date().toISOString().slice(0, 10)}.xlsx`);
    });
  },
  importTeachers: (file: File, defaultPassword?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (defaultPassword) form.append('default_password', defaultPassword);
    return client
      .post<ImportResult>('/users/teachers/import', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60_000,
      })
      .then((r) => r.data);
  },
  updateTeacherProfile: (id: number, body: TeacherProfileCreate) =>
    client.put(`/users/${id}/profile`, { teacher_profile: body }).then((r) => r.data),

  // 师生关系
  listMentorStudents: (mentorId: number) =>
    client.get<UserInfo[]>(`/users/mentors/${mentorId}/students`).then((r) => r.data),
  addMentorRelations: (mentorId: number, studentIds: number[]) =>
    client
      .post<{
        message: string;
      }>('/users/mentors/relations', {
        mentor_id: mentorId,
        student_ids: studentIds,
      })
      .then((r) => r.data),
  removeMentorRelation: (mentorId: number, studentId: number) =>
    client
      .delete<{
        message: string;
      }>(`/users/mentors/${mentorId}/students/${studentId}`)
      .then((r) => r.data),
  getMyMentor: () => client.get<UserInfo>('/users/me/mentor').then((r) => r.data),

  downloadRelationsTemplate: () => {
    client
      .get('/users/mentors/relations/template', { responseType: 'blob' })
      .then((r) => downloadBlob(r.data, '师生关系导入模板.xlsx'));
  },
  importMentorRelations: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return client
      .post<ImportResult>('/users/mentors/relations/import', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60_000,
      })
      .then((r) => r.data);
  },

  downloadTemplate: () => {
    client
      .get('/users/students/template', { responseType: 'blob' })
      .then((r) => downloadBlob(r.data, '学生账号导入模板.xlsx'));
  },
  exportStudents: () => {
    client.get('/users/students/export', { responseType: 'blob' }).then((r) => {
      downloadBlob(r.data, `学生账号_${new Date().toISOString().slice(0, 10)}.xlsx`);
    });
  },
  importStudents: (file: File, defaultPassword?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (defaultPassword) form.append('default_password', defaultPassword);
    return client
      .post<ImportResult>('/users/students/import', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60_000,
      })
      .then((r) => r.data);
  },
};

// ── 知识库 API ────────────────────────────────────────────

export const knowledgeApi = {
  list: () => client.get<KBInfo[]>('/knowledge').then((r) => r.data),
  create: (body: KBCreate) => client.post<KBInfo>('/knowledge', body).then((r) => r.data),
  delete: (name: string) =>
    client.delete<{ message: string }>(`/knowledge/${name}`).then((r) => r.data),
  // 学生知识库分配
  getActiveKb: () => client.get<ActiveKBInfo | null>('/knowledge/active').then((r) => r.data),
  setActiveKb: (kbName: string) =>
    client.put<ActiveKBInfo>('/knowledge/active', { kb_name: kbName }).then((r) => r.data),
  clearActiveKb: () => client.delete<{ message: string }>('/knowledge/active').then((r) => r.data),
  // 管理端知识库分配
  getAdminKb: () => client.get<ActiveKBInfo | null>('/knowledge/admin-active').then((r) => r.data),
  setAdminKb: (kbName: string) =>
    client.put<ActiveKBInfo>('/knowledge/admin-active', { kb_name: kbName }).then((r) => r.data),
  clearAdminKb: () =>
    client.delete<{ message: string }>('/knowledge/admin-active').then((r) => r.data),
};

// ── 文档 API ──────────────────────────────────────────────

export const documentApi = {
  list: (kbName: string, page = 1, pageSize = 20, docType?: string) =>
    client
      .get<PaginatedDocs>(`/document/${kbName}`, {
        params: {
          page,
          page_size: pageSize,
          ...(docType ? { doc_type: docType } : {}),
        },
      })
      .then((r) => r.data),

  get: (kbName: string, docId: number) =>
    client.get<DocDetail>(`/document/${kbName}/${docId}`).then((r) => r.data),

  update: (kbName: string, docId: number, body: DocUpdate) =>
    client.put<DocDetail>(`/document/${kbName}/${docId}`, body).then((r) => r.data),

  reindex: (kbName: string, docId: number) =>
    client.post<DocInfo>(`/document/${kbName}/${docId}/reindex`).then((r) => r.data),

  upload: (
    kbName: string,
    file: File,
    params: UploadParams,
    onProgress?: (pct: number) => void,
  ) => {
    const form = new FormData();
    form.append('file', file);
    form.append('splitter_type', params.splitter_type);
    form.append('chunk_size', String(params.chunk_size));
    form.append('chunk_overlap_ratio', String(params.chunk_overlap_ratio));
    form.append('enable_cleaning', String(params.enable_cleaning));
    form.append('doc_type', params.doc_type);
    return client
      .post<DocInfo>(`/document/${kbName}/upload`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 600000,
        onUploadProgress: (e) => {
          if (onProgress && e.total) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        },
      })
      .then((r) => r.data);
  },

  delete: (kbName: string, docId: number) =>
    client.delete<{ message: string }>(`/document/${kbName}/${docId}`).then((r) => r.data),

  getDownloadToken: (downloadUrl: string) => {
    // downloadUrl 形如 "/api/document/{kbName}/download/{docId}"
    // 去掉 /api 前缀，将 /download/ 替换为 /download-token/
    const path = downloadUrl.replace(/^\/api/, '').replace('/download/', '/download-token/');
    return client.post<{ token: string; expires_in: number }>(path).then((r) => r.data);
  },

  uploadAndClean: (
    kbName: string,
    file: File,
    params: UploadParams,
    onProgress?: (pct: number) => void,
  ) => {
    const form = new FormData();
    form.append('file', file);
    form.append('splitter_type', params.splitter_type);
    form.append('chunk_size', String(params.chunk_size));
    form.append('chunk_overlap_ratio', String(params.chunk_overlap_ratio));
    form.append('doc_type', params.doc_type);
    return client
      .post<CleanResult>(`/document/${kbName}/upload-and-clean`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 600000,
        onUploadProgress: (e) => {
          if (onProgress && e.total) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        },
      })
      .then((r) => r.data);
  },

  confirmClean: (kbName: string, docId: number, content: string) =>
    client.post<ChunkPreviewResult>(`/document/${kbName}/${docId}/confirm-clean`, { content }),

  confirmIndex: (kbName: string, docId: number) =>
    client.post<ConfirmIndexResult>(`/document/${kbName}/${docId}/confirm-index`),

  getReview: (kbName: string, docId: number) =>
    client.get<ReviewDetail>(`/document/${kbName}/${docId}/review`),
};

// ── 配置 API ──────────────────────────────────────────────

export const configApi = {
  get: () => client.get<SystemConfig>('/config').then((r) => r.data),
  update: (body: ConfigUpdate) => client.post<SystemConfig>('/config', body).then((r) => r.data),
  getApiKey: () =>
    client.get<ApiKeyInfo & { api_base_url: string }>('/config/api-key').then((r) => r.data),
  updateApiKey: (apiKey: string, apiBaseUrl?: string) =>
    client
      .put<{ message: string; has_key: boolean }>('/config/api-key', {
        api_key: apiKey,
        api_base_url: apiBaseUrl,
      })
      .then((r) => r.data),
  testApiKey: () =>
    client
      .post<{
        ok: boolean;
        message: string;
        models?: string[];
      }>('/config/api-key/test')
      .then((r) => r.data),
  getModels: () => client.get<string[]>('/config/models').then((r) => r.data),
};

// ── FAQ API ───────────────────────────────────────────────

export const faqApi = {
  list: (kbName: string, page = 1, pageSize = 20) =>
    client
      .get<PaginatedFAQs>(`/faq/${kbName}`, {
        params: { page, page_size: pageSize },
      })
      .then((r) => r.data),
  search: (kbName: string, q: string) =>
    client.get<FAQSearchResponse>(`/faq/${kbName}/search`, { params: { q } }).then((r) => r.data),
  create: (kbName: string, body: FAQCreate) =>
    client.post<FAQItem>(`/faq/${kbName}`, body).then((r) => r.data),
  update: (kbName: string, id: number, body: FAQUpdate) =>
    client.put<FAQItem>(`/faq/${kbName}/${id}`, body).then((r) => r.data),
  delete: (kbName: string, id: number) =>
    client.delete<{ message: string }>(`/faq/${kbName}/${id}`).then((r) => r.data),
  downloadTemplate: (kbName: string) => {
    client
      .get(`/faq/${kbName}/template`, { responseType: 'blob' })
      .then((r) => downloadBlob(r.data, 'FAQ_导入模板.xlsx'));
  },
  exportExcel: (kbName: string) => {
    client
      .get(`/faq/${kbName}/export`, { responseType: 'blob' })
      .then((r) => downloadBlob(r.data, `${kbName}_FAQ.xlsx`));
  },
  importExcel: (kbName: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    form.append('skip_duplicates', 'true');
    return client
      .post<FAQImportResult>(`/faq/${kbName}/import`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120_000,
      })
      .then((r) => r.data);
  },
};

// ── 统计 API ──────────────────────────────────────────────

export const analyticsApi = {
  summary: () =>
    client.get<AnalyticsSummary>('/analytics/summary').then((r) => {
      const d = r.data;
      if (!d || typeof d !== 'object' || !Array.isArray((d as AnalyticsSummary).week_data)) {
        throw new Error('统计接口返回数据无效，请确认后端已重启');
      }
      return d;
    }),
};

// ── 对话 API ──────────────────────────────────────────────

export const conversationApi = {
  list: (params?: {
    kb_name?: string;
    cursor_id?: number;
    cursor_updated_at?: string;
    limit?: number;
  }) => client.get<PaginatedConversations>('/conversation', { params }).then((r) => r.data),
  create: (kbName: string, title?: string) =>
    client
      .post<ConversationInfo>('/conversation', {
        kb_name: kbName,
        title: title ?? '新对话',
      })
      .then((r) => r.data),
  get: (convId: number) =>
    client
      .get<{
        conversation: ConversationInfo;
        messages: ConversationMessage[];
      }>(`/conversation/${convId}`)
      .then((r) => r.data),
  updateTitle: (convId: number, title: string) =>
    client.put<ConversationInfo>(`/conversation/${convId}/title`, { title }).then((r) => r.data),
  summarizeTitle: (convId: number) =>
    client.post<ConversationInfo>(`/conversation/${convId}/summarize-title`).then((r) => r.data),
  delete: (convId: number) =>
    client.delete<{ message: string }>(`/conversation/${convId}`).then((r) => r.data),
  addMessage: (
    convId: number,
    msg: {
      role: string;
      content: string;
      sources?: unknown[] | null;
      files?: unknown[] | null;
    },
  ) =>
    client.post<ConversationMessage>(`/conversation/${convId}/messages`, msg).then((r) => r.data),
  submitFeedback: (messageId: number, rating: 'up' | 'down') =>
    client
      .post<{
        message_id: number;
        rating: string;
      }>(`/conversation/messages/${messageId}/feedback`, { rating })
      .then((r) => r.data),
};

// ── 答疑请求 API ──────────────────────────────────────────

export const ticketApi = {
  list: (page = 1, pageSize = 20) =>
    client
      .get<PaginatedTickets>('/tickets', {
        params: { page, page_size: pageSize },
      })
      .then((r) => r.data),
  get: (id: number) => client.get<QARequestInfo>(`/tickets/${id}`).then((r) => r.data),
  create: (body: QARequestCreate) =>
    client.post<QARequestInfo>('/tickets', body).then((r) => r.data),
  reply: (id: number, answer: string) =>
    client.post<QARequestInfo>(`/tickets/${id}/reply`, { answer }).then((r) => r.data),
  close: (id: number) => client.post<QARequestInfo>(`/tickets/${id}/close`).then((r) => r.data),
};
