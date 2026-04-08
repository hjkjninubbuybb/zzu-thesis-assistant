import axios from 'axios'
import type { KBInfo, KBCreate, DocInfo, UploadParams, SystemConfig, ConfigUpdate } from '@/types/api'

const client = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

export function extractError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.detail ?? error.message
  }
  return String(error)
}

export const knowledgeApi = {
  list: () => client.get<KBInfo[]>('/knowledge').then(r => r.data),
  create: (body: KBCreate) => client.post<KBInfo>('/knowledge', body).then(r => r.data),
  delete: (name: string) => client.delete<{ message: string }>(`/knowledge/${name}`).then(r => r.data),
}

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

export const configApi = {
  get: () => client.get<SystemConfig>('/config').then(r => r.data),
  update: (body: ConfigUpdate) => client.post<SystemConfig>('/config', body).then(r => r.data),
}
