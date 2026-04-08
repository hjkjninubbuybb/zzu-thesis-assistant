export type DocType = 'plain_text' | 'multimodal' | 'table_heavy'
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

export interface ChatRequest {
  kb_name: string
  query: string
  max_reformulations: number
}

export interface SourceItem {
  node_id: string
  text: string
  source_file: string
  score: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: SourceItem[]
  status?: 'loading' | 'done' | 'error'
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
