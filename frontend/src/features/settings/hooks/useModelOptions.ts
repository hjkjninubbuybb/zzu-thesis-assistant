import { useMemo } from 'react';
import type { ApiGroup, TestConnectionResult } from '@shared/types/api';

const LLM_CORE = ['qwen-plus', 'qwen-turbo', 'qwen-max', 'deepseek-chat', 'deepseek-reasoner'];
const LLM_EXCLUDE = ['image', 'speech', 'audio', 'vl', 'math', 'mt', 'embedding', 'rerank'];
const EMBEDDING_CORE = ['text-embedding-v3', 'text-embedding-v2'];
const RERANKER_CORE = ['gte-rerank', 'gte-rerank-hybrid'];

export type ModelOption = { value: string; label: string; desc?: string };

function unique(arr: string[]): string[] {
  return [...new Set(arr)];
}

function filterLlm(remote: string[] | undefined): ModelOption[] {
  const all = unique([...(remote ?? []), ...LLM_CORE]);
  return all
    .filter((m) => {
      if (LLM_CORE.includes(m)) return true;
      const lower = m.toLowerCase();
      return !LLM_EXCLUDE.some((p) => lower.includes(p));
    })
    .sort((a, b) => {
      const idxA = LLM_CORE.indexOf(a);
      const idxB = LLM_CORE.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    })
    .map((m) => ({ value: m, label: m }));
}

function filterEmbedding(remote: string[] | undefined): ModelOption[] {
  const all = unique([...(remote ?? []), ...EMBEDDING_CORE]);
  return all
    .filter((m) => m.toLowerCase().includes('embedding'))
    .map((m) => ({
      value: m,
      label: m,
      desc: m === 'text-embedding-v3' ? '推荐：1024维高精度' : undefined,
    }));
}

function filterReranker(remote: string[] | undefined): ModelOption[] {
  const all = unique([...(remote ?? []), ...RERANKER_CORE]);
  return all
    .filter((m) => m.toLowerCase().includes('rerank'))
    .map((m) => ({
      value: m,
      label: m,
      desc: m === 'gte-rerank' ? '推荐：通用重排序' : undefined,
    }));
}

export function useModelOptions(testResults: TestConnectionResult | undefined) {
  return useMemo<Record<ApiGroup, ModelOption[]>>(
    () => ({
      llm: filterLlm(testResults?.llm.models),
      fast_llm: filterLlm(testResults?.fast_llm.models),
      embedding: filterEmbedding(testResults?.embedding.models),
      reranker: filterReranker(testResults?.reranker.models),
    }),
    [testResults],
  );
}
