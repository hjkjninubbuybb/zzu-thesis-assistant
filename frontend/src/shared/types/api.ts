export type DocType = "policy" | "manual" | "form";
export type SplitterType =
  | "recursive"
  | "token"
  | "sentence"
  | "semantic"
  | "table_aware"
  | "manual_step";

export interface KBInfo {
  id: number;
  name: string;
  description: string;
  doc_count: number;
  is_active: boolean; // 学生知识库
  is_admin_active: boolean; // 管理端知识库
  created_at: string;
}

export interface ActiveKBInfo {
  kb_name: string;
  description: string;
  doc_count: number;
}

export interface KBCreate {
  name: string;
  description: string;
}

export interface DocInfo {
  id: number;
  kb_name: string;
  file_name: string;
  file_size: number;
  chunk_count: number;
  chunk_size: number;
  chunk_overlap_ratio: number;
  splitter_type: SplitterType;
  doc_type: DocType;
  status: string;
  created_at: string;
}

export interface DocDetail extends DocInfo {
  summary: string | null;
  content: string | null;
}

export interface DocUpdate {
  summary?: string;
  content?: string;
}

export interface UploadParams {
  splitter_type: SplitterType;
  chunk_size: number;
  chunk_overlap_ratio: number;
  enable_cleaning: boolean;
  doc_type: DocType;
}

export interface CleanResult {
  doc_id: number;
  file_name: string;
  cleaned_content: string;
  doc_type: string;
  splitter_type: string;
  chunk_size: number;
  chunk_overlap_ratio: number;
}

export interface ChunkPreview {
  index: number;
  content: string;
}

export interface ChunkPreviewResult {
  doc_id: number;
  chunks: ChunkPreview[];
  chunk_count: number;
}

export interface ConfirmIndexResult {
  doc_id: number;
  status: string;
  chunk_count: number;
}

export interface ReviewDetail {
  doc_id: number;
  file_name: string;
  status: string;
  cleaned_content: string | null;
  chunks: ChunkPreview[] | null;
  doc_type: string;
  splitter_type: string;
  chunk_size: number;
  chunk_overlap_ratio: number;
}

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  kb_name: string;
  query: string;
  max_reformulations: number;
  history: HistoryMessage[];
}

export interface SourceItem {
  node_id: string;
  text: string;
  source_file: string;
  score: number;
}

export interface FileItem {
  file_name: string;
  url: string;
  size_kb: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceItem[];
  files?: FileItem[];
  suggestions?: string[];
  status?: "loading" | "done" | "error";
  dbMessageId?: number;
  feedback?: "up" | "down" | null;
  isNew?: boolean;
}

// ── 对话历史 ─────────────────────────────────────────────

export interface ConversationInfo {
  id: number;
  kb_name: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationCursor {
  id: number;
  updated_at: string;
}

export interface PaginatedConversations {
  items: ConversationInfo[];
  has_more: boolean;
  next_cursor: ConversationCursor | null;
}

export interface ConversationMessage {
  id: number;
  conversation_id: number;
  role: "user" | "assistant";
  content: string;
  sources?: SourceItem[] | null;
  files?: FileItem[] | null;
  feedback?: "up" | "down" | null;
  created_at: string;
}

// ── FAQ ───────────────────────────────────────────────────

export interface FAQItem {
  id: number;
  kb_name: string;
  question: string;
  answer: string;
  category: string;
  sort_order: number;
  enabled: boolean;
  status: "draft" | "pending" | "approved" | "rejected";
  author_id?: number;
  created_at: string;
  updated_at: string;
}

export interface FAQCreate {
  question: string;
  answer: string;
  category: string;
  sort_order: number;
}

export interface FAQUpdate {
  question?: string;
  answer?: string;
  category?: string;
  sort_order?: number;
  enabled?: boolean;
  status?: "draft" | "pending" | "approved" | "rejected";
}

export interface FAQSearchItem extends FAQItem {
  score: number | null;
}

export interface FAQSearchResponse {
  items: FAQSearchItem[];
}

export interface FAQImportError {
  row: number;
  question: string;
  reason: string;
}

export interface FAQImportResult {
  total: number;
  success: number;
  skipped: number;
  failed: number;
  errors: FAQImportError[];
}

export interface ImportError {
  row: number;
  student_id?: string;
  employee_id?: string;
  reason: string;
}

export interface ImportResult {
  total: number;
  success: number;
  skipped: number;
  failed: number;
  errors: ImportError[];
}

// ── 导师答疑请求 (Tickets) ────────────────────────────────

export interface QARequestInfo {
  id: number;
  student_id: number;
  mentor_id: number;
  conversation_id: number;
  message_id: number;
  question: string;
  answer: string | null;
  status: "pending" | "replied" | "closed";
  created_at: string;
  replied_at: string | null;
}

export interface QARequestCreate {
  conversation_id: number;
  message_id: number;
  question: string;
}

// ── 用户认证 ──────────────────────────────────────────────

export type UserRole = "admin" | "teacher" | "student";

export interface StudentProfile {
  user_id: number;
  student_id: string;
  grade: string;
  major: string;
  class_name: string;
}

export interface TeacherProfile {
  user_id: number;
  employee_id: string;
  department: string;
  title: string;
}

export interface UserInfo {
  id: number;
  username: string;
  display_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  profile?: StudentProfile | TeacherProfile | null;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: UserInfo;
}

export interface UserCreate {
  username: string;
  password: string;
  display_name: string;
  role: UserRole;
}

export interface UserUpdate {
  display_name?: string;
  is_active?: boolean;
}

export interface StudentProfileCreate {
  student_id: string;
  grade: string;
  major: string;
  class_name: string;
}

export interface TeacherProfileCreate {
  employee_id: string;
  department: string;
  title: string;
}

export interface PaginatedUsers {
  items: UserInfo[];
  total: number;
  page: number;
  page_size: number;
}

// ── 系统配置 ──────────────────────────────────────────────

export interface DocTypeSplitterParams {
  type?: string;
  chunk_size?: number;
  chunk_overlap_ratio?: number;
  enable_cleaning?: boolean;
}

export interface SystemConfig {
  llm: { model: string; fast_model: string; api_base_url?: string };
  embedding: { model: string; dimension: number; embed_batch_size: number };
  splitter: {
    strategy?: string;
    chunk_size: number;
    chunk_overlap_ratio: number;
    buffer_size?: number;
    breakpoint_percentile_threshold?: number;
    policy?: DocTypeSplitterParams;
    manual?: DocTypeSplitterParams;
    form?: DocTypeSplitterParams;
  };
  retrieval: {
    vector_top_k: number;
    bm25_top_k: number;
    hybrid_top_k: number;
    rrf_k: number;
  };
  reranker: { model: string; top_n: number };
  rag: {
    max_reformulations: number;
    agent_recursion_limit: number;
    agent_retry_count: number;
  };
}

export interface DocTypeSplitterUpdate {
  splitter_type?: string;
  chunk_size?: number;
  chunk_overlap_ratio?: number;
  enable_cleaning?: boolean;
}

export interface SplitterConfigUpdate {
  strategy: SplitterType;
  chunk_size?: number;
  chunk_overlap_ratio?: number;
  buffer_size?: number;
  breakpoint_percentile_threshold?: number;
  policy?: DocTypeSplitterUpdate;
  manual?: DocTypeSplitterUpdate;
  form?: DocTypeSplitterUpdate;
}

export interface ConfigUpdate {
  llm_base_url?: string;
  llm_model?: string;
  llm_fast_model?: string;
  embedding_model?: string;
  splitter?: SplitterConfigUpdate;
  vector_top_k?: number;
  bm25_top_k?: number;
  hybrid_top_k?: number;
  rrf_k?: number;
  reranker_model?: string;
  reranker_top_n?: number;
  max_reformulations?: number;
  agent_recursion_limit?: number;
  agent_retry_count?: number;
}

export interface ApiKeyInfo {
  has_key: boolean;
  masked_key: string;
}

// ── 使用统计 ──────────────────────────────────────────────

export interface WeekDataPoint {
  day: string; // YYYY-MM-DD
  count: number;
}

export interface RecentQuestion {
  content: string;
  created_at: string;
  kb_name: string;
}

export interface AnalyticsSummary {
  total_questions: number;
  today_questions: number;
  total_conversations: number;
  week_data: WeekDataPoint[];
  feedback_up: number;
  feedback_down: number;
  kb_count: number;
  doc_count: number;
  faq_count: number;
  recent_questions: RecentQuestion[];
}
