export type DocType = 'policy' | 'manual' | 'form'
export type SplitterType = 'recursive' | 'token' | 'sentence' | 'semantic' | 'table_aware'

export interface KBInfo {
  id: number
  name: string
  description: string
  doc_count: number
  created_at: string
}

export interface KBCreate {
  name: string
  description: string
}

export interface DocInfo {
  id: number
  kb_name: string
  file_name: string
  file_size: number
  chunk_count: number
  chunk_size: number
  doc_type: DocType
  status: string
  created_at: string
}

export interface UploadParams {
  splitter_type: SplitterType
  chunk_size: number
  chunk_overlap_ratio: number
  enable_cleaning: boolean
  doc_type: DocType
}

export interface HistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  kb_name: string
  query: string
  max_reformulations: number
  history: HistoryMessage[]
}

export interface SourceItem {
  node_id: string
  text: string
  source_file: string
  score: number
}

export interface FileItem {
  file_name: string
  url: string
  size_kb: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: SourceItem[]
  files?: FileItem[]
  suggestions?: string[]
  status?: 'loading' | 'done' | 'error'
  dbMessageId?: number
  feedback?: 'up' | 'down' | null
}

// ── 对话历史 ─────────────────────────────────────────────

export interface ConversationInfo {
  id: number
  kb_name: string
  title: string
  created_at: string
  updated_at: string
}

export interface ConversationMessage {
  id: number
  conversation_id: number
  role: 'user' | 'assistant'
  content: string
  sources?: SourceItem[] | null
  files?: FileItem[] | null
  feedback?: 'up' | 'down' | null
  created_at: string
}

// ── FAQ ───────────────────────────────────────────────────

export interface FAQItem {
  id: number
  kb_name: string
  question: string
  answer: string
  category: string
  sort_order: number
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface FAQCreate {
  question: string
  answer: string
  category: string
  sort_order: number
}

export interface FAQUpdate {
  question?: string
  answer?: string
  category?: string
  sort_order?: number
  enabled?: boolean
}

export interface FAQSearchResponse {
  rewritten_query: string
  items: FAQItem[]
}

export interface FAQImportError {
  row: number
  question: string
  reason: string
}

export interface FAQImportResult {
  total: number
  success: number
  skipped: number
  failed: number
  errors: FAQImportError[]
}

// ── 用户认证 ──────────────────────────────────────────────

export type UserRole = 'admin' | 'teacher' | 'student'

export interface StudentProfile {
  user_id: number
  student_id: string
  grade: string
  major: string
  class_name: string
}

export interface TeacherProfile {
  user_id: number
  employee_id: string
  department: string
  title: string
}

export interface UserInfo {
  id: number
  username: string
  display_name: string
  role: UserRole
  is_active: boolean
  created_at: string
  updated_at: string
  profile?: StudentProfile | TeacherProfile | null
}

export interface LoginResponse {
  access_token: string
  refresh_token: string
  token_type: string
  user: UserInfo
}

export interface UserCreate {
  username: string
  password: string
  display_name: string
  role: UserRole
}

export interface UserUpdate {
  display_name?: string
  is_active?: boolean
}

export interface StudentProfileCreate {
  student_id: string
  grade: string
  major: string
  class_name: string
}

export interface TeacherProfileCreate {
  employee_id: string
  department: string
  title: string
}

export interface PaginatedUsers {
  items: UserInfo[]
  total: number
  page: number
  page_size: number
}

// ── 系统配置 ──────────────────────────────────────────────

export interface SystemConfig {
  llm: { model: string }
  embedding: { model: string; dimension: number; embed_batch_size: number }
  splitter: {
    strategy?: string
    chunk_size: number
    chunk_overlap_ratio: number
    buffer_size?: number
    breakpoint_percentile_threshold?: number
  }
  retrieval: { vector_top_k: number; bm25_top_k: number; hybrid_top_k: number; rrf_k: number }
  reranker: { model: string; top_n: number }
  rag: { max_reformulations: number }
}

export interface SplitterConfigUpdate {
  strategy: SplitterType
  chunk_size?: number
  chunk_overlap_ratio?: number
  buffer_size?: number
  breakpoint_percentile_threshold?: number
}

export interface ConfigUpdate {
  llm_model?: string
  llm_fast_model?: string
  embedding_model?: string
  splitter?: SplitterConfigUpdate
  vector_top_k?: number
  bm25_top_k?: number
  hybrid_top_k?: number
  rrf_k?: number
  reranker_model?: string
  reranker_top_n?: number
  max_reformulations?: number
}

export interface ApiKeyInfo {
  has_key: boolean
  masked_key: string
}

// ── 使用统计 ──────────────────────────────────────────────

export interface WeekDataPoint {
  day: string    // YYYY-MM-DD
  count: number
}

export interface RecentQuestion {
  content: string
  created_at: string
  kb_name: string
}

export interface AnalyticsSummary {
  total_questions: number
  today_questions: number
  total_conversations: number
  week_data: WeekDataPoint[]
  feedback_up: number
  feedback_down: number
  kb_count: number
  doc_count: number
  faq_count: number
  recent_questions: RecentQuestion[]
}
