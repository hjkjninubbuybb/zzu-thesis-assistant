import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsService } from "../services/settingsService";
import { settingsKeys } from "./queryKeys";
import { useToast } from "@shared/store/uiStore";
import { handleMutationError } from "@shared/lib/errorHandler";
import type { SplitterType } from "@shared/types/api";

export type DocTypeSplitterForm = {
  splitter_type: SplitterType;
  chunk_size: number;
  chunk_overlap_ratio: number;
  enable_cleaning: boolean;
};

export type FormState = {
  llm_base_url: string;
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
  llm_base_url: "",
  llm_model: "qwen-plus",
  llm_fast_model: "qwen-turbo",
  embedding_model: "text-embedding-v3",
  vector_top_k: 10,
  bm25_top_k: 10,
  hybrid_top_k: 15,
  rrf_k: 60,
  reranker_model: "gte-rerank",
  reranker_top_n: 5,
  max_reformulations: 2,
  agent_recursion_limit: 15,
  agent_retry_count: 3,
  splitter_policy: {
    splitter_type: "recursive",
    chunk_size: 512,
    chunk_overlap_ratio: 0.1,
    enable_cleaning: true,
  },
  splitter_manual: {
    splitter_type: "recursive",
    chunk_size: 256,
    chunk_overlap_ratio: 0.1,
    enable_cleaning: true,
  },
  splitter_form: {
    splitter_type: "recursive",
    chunk_size: 256,
    chunk_overlap_ratio: 0.0,
    enable_cleaning: false,
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function configToForm(cfg: any): FormState {
  const gs = cfg.splitter?.chunk_size ?? 256;
  const go = cfg.splitter?.chunk_overlap_ratio ?? 0.2;
  return {
    llm_base_url: cfg.llm?.api_base_url ?? DEFAULT_FORM.llm_base_url,
    llm_model: cfg.llm?.model ?? DEFAULT_FORM.llm_model,
    llm_fast_model: cfg.llm?.fast_model ?? DEFAULT_FORM.llm_fast_model,
    embedding_model: cfg.embedding?.model ?? DEFAULT_FORM.embedding_model,
    vector_top_k: cfg.retrieval?.vector_top_k ?? DEFAULT_FORM.vector_top_k,
    bm25_top_k: cfg.retrieval?.bm25_top_k ?? DEFAULT_FORM.bm25_top_k,
    hybrid_top_k: cfg.retrieval?.hybrid_top_k ?? DEFAULT_FORM.hybrid_top_k,
    rrf_k: cfg.retrieval?.rrf_k ?? DEFAULT_FORM.rrf_k,
    reranker_model: cfg.reranker?.model ?? DEFAULT_FORM.reranker_model,
    reranker_top_n: cfg.reranker?.top_n ?? DEFAULT_FORM.reranker_top_n,
    max_reformulations:
      cfg.rag?.max_reformulations ?? DEFAULT_FORM.max_reformulations,
    agent_recursion_limit:
      cfg.rag?.agent_recursion_limit ?? DEFAULT_FORM.agent_recursion_limit,
    agent_retry_count:
      cfg.rag?.agent_retry_count ?? DEFAULT_FORM.agent_retry_count,
    splitter_policy: {
      splitter_type: (cfg.splitter?.policy?.type ??
        "recursive") as SplitterType,
      chunk_size: cfg.splitter?.policy?.chunk_size ?? gs,
      chunk_overlap_ratio: cfg.splitter?.policy?.chunk_overlap_ratio ?? go,
      enable_cleaning: cfg.splitter?.policy?.enable_cleaning ?? true,
    },
    splitter_manual: {
      splitter_type: (cfg.splitter?.manual?.type ??
        "manual_step") as SplitterType,
      chunk_size: cfg.splitter?.manual?.chunk_size ?? gs,
      chunk_overlap_ratio: cfg.splitter?.manual?.chunk_overlap_ratio ?? go,
      enable_cleaning: cfg.splitter?.manual?.enable_cleaning ?? true,
    },
    splitter_form: {
      splitter_type: (cfg.splitter?.form?.type ?? "recursive") as SplitterType,
      chunk_size: cfg.splitter?.form?.chunk_size ?? gs,
      chunk_overlap_ratio: cfg.splitter?.form?.chunk_overlap_ratio ?? 0.0,
      enable_cleaning: cfg.splitter?.form?.enable_cleaning ?? false,
    },
  };
}

export function useSettings() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);

  const { data: cfg, isLoading } = useQuery({
    queryKey: settingsKeys.config(),
    queryFn: settingsService.get,
  });

  useEffect(() => {
    if (cfg) setForm(configToForm(cfg));
  }, [cfg]);

  const saveMutation = useMutation({
    mutationFn: () =>
      settingsService.update({
        llm_base_url: form.llm_base_url,
        llm_model: form.llm_model,
        llm_fast_model: form.llm_fast_model,
        embedding_model: form.embedding_model,
        vector_top_k: form.vector_top_k,
        bm25_top_k: form.bm25_top_k,
        hybrid_top_k: form.hybrid_top_k,
        rrf_k: form.rrf_k,
        reranker_model: form.reranker_model,
        reranker_top_n: form.reranker_top_n,
        max_reformulations: form.max_reformulations,
        agent_recursion_limit: form.agent_recursion_limit,
        agent_retry_count: form.agent_retry_count,
        splitter: {
          strategy: "recursive",
          policy: {
            splitter_type: form.splitter_policy.splitter_type,
            chunk_size: form.splitter_policy.chunk_size,
            chunk_overlap_ratio: form.splitter_policy.chunk_overlap_ratio,
            enable_cleaning: form.splitter_policy.enable_cleaning,
          },
          manual: {
            splitter_type: form.splitter_manual.splitter_type,
            chunk_size: form.splitter_manual.chunk_size,
            chunk_overlap_ratio: form.splitter_manual.chunk_overlap_ratio,
            enable_cleaning: form.splitter_manual.enable_cleaning,
          },
          form: {
            splitter_type: form.splitter_form.splitter_type,
            chunk_size: form.splitter_form.chunk_size,
            chunk_overlap_ratio: form.splitter_form.chunk_overlap_ratio,
            enable_cleaning: form.splitter_form.enable_cleaning,
          },
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.config() });
      showToast("配置已保存", "success");
    },
    onError: (err) => handleMutationError(err, showToast),
  });

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return {
    form,
    isLoading,
    set,
    saveMutation,
  };
}

export function useModelOptions(availableModels: string[] | undefined) {
  const combinedLlmModels = useMemo(() => {
    const coreModels = [
      "qwen-plus",
      "qwen-turbo",
      "qwen-max",
      "deepseek-chat",
      "deepseek-reasoner",
    ];
    const excludePatterns = [
      "image",
      "speech",
      "audio",
      "vl",
      "math",
      "mt",
      "v1",
      "embedding",
      "rerank",
    ];
    const all = [...new Set([...(availableModels || []), ...coreModels])];
    const filtered = all.filter((m) => {
      if (coreModels.includes(m)) return true;
      const lower = m.toLowerCase();
      return !excludePatterns.some((p) => lower.includes(p));
    });
    return filtered
      .sort((a, b) => {
        const idxA = coreModels.indexOf(a);
        const idxB = coreModels.indexOf(b);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.localeCompare(b);
      })
      .map((m) => ({ value: m, label: m }));
  }, [availableModels]);

  const combinedEmbeddingModels = useMemo(() => {
    const coreModels = ["text-embedding-v3", "text-embedding-v2"];
    const all = [...new Set([...(availableModels || []), ...coreModels])];
    const filtered = all.filter((m) => m.toLowerCase().includes("embedding"));
    return filtered.map((m) => ({
      value: m,
      label: m,
      desc: m === "text-embedding-v3" ? "推荐：1024维高精度" : undefined,
    }));
  }, [availableModels]);

  const combinedRerankerModels = useMemo(() => {
    const coreModels = ["gte-rerank", "gte-rerank-hybrid"];
    const all = [...new Set([...(availableModels || []), ...coreModels])];
    const filtered = all.filter((m) => m.toLowerCase().includes("rerank"));
    return filtered.map((m) => ({
      value: m,
      label: m,
      desc: m === "gte-rerank" ? "推荐：通用重排序" : undefined,
    }));
  }, [availableModels]);

  return { combinedLlmModels, combinedEmbeddingModels, combinedRerankerModels };
}
