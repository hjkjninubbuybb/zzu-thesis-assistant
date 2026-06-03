import type { SplitterType, SystemConfig } from '@shared/types/api';

export type DocTypeSplitterForm = {
  splitter_type: SplitterType;
  chunk_size: number;
  chunk_overlap_ratio: number;
  enable_cleaning: boolean;
};

export type FormState = {
  llm_model: string;
  llm_fast_model: string;
  embedding_model: string;
  vector_top_k: number;
  bm25_top_k: number;
  hybrid_top_k: number;
  rrf_k: number;
  reranker_model: string;
  reranker_top_n: number;
  max_reformulations: number;
  agent_recursion_limit: number;
  agent_retry_count: number;
  splitter_policy: DocTypeSplitterForm;
  splitter_manual: DocTypeSplitterForm;
  splitter_form: DocTypeSplitterForm;
};

export const DEFAULT_FORM: FormState = {
  llm_model: 'qwen-plus',
  llm_fast_model: 'qwen-turbo',
  embedding_model: 'text-embedding-v3',
  vector_top_k: 10,
  bm25_top_k: 10,
  hybrid_top_k: 15,
  rrf_k: 60,
  reranker_model: 'gte-rerank',
  reranker_top_n: 5,
  max_reformulations: 2,
  agent_recursion_limit: 15,
  agent_retry_count: 3,
  splitter_policy: {
    splitter_type: 'recursive',
    chunk_size: 512,
    chunk_overlap_ratio: 0.1,
    enable_cleaning: true,
  },
  splitter_manual: {
    splitter_type: 'recursive',
    chunk_size: 256,
    chunk_overlap_ratio: 0.1,
    enable_cleaning: true,
  },
  splitter_form: {
    splitter_type: 'recursive',
    chunk_size: 256,
    chunk_overlap_ratio: 0.0,
    enable_cleaning: false,
  },
};

export function configToForm(cfg: SystemConfig): FormState {
  const gs = cfg.splitter.chunk_size ?? 256;
  const go = cfg.splitter.chunk_overlap_ratio ?? 0.2;
  return {
    llm_model: cfg.llm.model ?? DEFAULT_FORM.llm_model,
    llm_fast_model: cfg.llm.fast_model ?? DEFAULT_FORM.llm_fast_model,
    embedding_model: cfg.embedding.model ?? DEFAULT_FORM.embedding_model,
    vector_top_k: cfg.retrieval.vector_top_k ?? DEFAULT_FORM.vector_top_k,
    bm25_top_k: cfg.retrieval.bm25_top_k ?? DEFAULT_FORM.bm25_top_k,
    hybrid_top_k: cfg.retrieval.hybrid_top_k ?? DEFAULT_FORM.hybrid_top_k,
    rrf_k: cfg.retrieval.rrf_k ?? DEFAULT_FORM.rrf_k,
    reranker_model: cfg.reranker.model ?? DEFAULT_FORM.reranker_model,
    reranker_top_n: cfg.reranker.top_n ?? DEFAULT_FORM.reranker_top_n,
    max_reformulations: cfg.rag.max_reformulations ?? DEFAULT_FORM.max_reformulations,
    agent_recursion_limit: cfg.rag.agent_recursion_limit ?? DEFAULT_FORM.agent_recursion_limit,
    agent_retry_count: cfg.rag.agent_retry_count ?? DEFAULT_FORM.agent_retry_count,
    splitter_policy: {
      splitter_type: (cfg.splitter.policy?.type ?? 'recursive') as SplitterType,
      chunk_size: cfg.splitter.policy?.chunk_size ?? gs,
      chunk_overlap_ratio: cfg.splitter.policy?.chunk_overlap_ratio ?? go,
      enable_cleaning: cfg.splitter.policy?.enable_cleaning ?? true,
    },
    splitter_manual: {
      splitter_type: (cfg.splitter.manual?.type ?? 'manual_step') as SplitterType,
      chunk_size: cfg.splitter.manual?.chunk_size ?? gs,
      chunk_overlap_ratio: cfg.splitter.manual?.chunk_overlap_ratio ?? go,
      enable_cleaning: cfg.splitter.manual?.enable_cleaning ?? true,
    },
    splitter_form: {
      splitter_type: (cfg.splitter.form?.type ?? 'recursive') as SplitterType,
      chunk_size: cfg.splitter.form?.chunk_size ?? gs,
      chunk_overlap_ratio: cfg.splitter.form?.chunk_overlap_ratio ?? 0.0,
      enable_cleaning: cfg.splitter.form?.enable_cleaning ?? false,
    },
  };
}
