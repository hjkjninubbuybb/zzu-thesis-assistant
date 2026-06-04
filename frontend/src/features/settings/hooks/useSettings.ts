import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsService } from '../services/settingsService';
import { settingsKeys } from './queryKeys';
import { useToast } from '@shared/store/uiStore';
import { handleMutationError } from '@shared/lib/errorHandler';
import { DEFAULT_FORM, configToForm } from './settingsForm';
import type { FormState, ApiGroupForm } from './settingsForm';

export type { DocTypeSplitterForm, FormState, ApiGroupForm } from './settingsForm';
export { DEFAULT_FORM } from './settingsForm';

const GROUPS = ['llm', 'fast_llm', 'embedding', 'reranker'] as const;

export function useSettings() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);

  const { data: cfg, isLoading } = useQuery({
    queryKey: settingsKeys.config(),
    queryFn: settingsService.get,
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (cfg) setForm(configToForm(cfg));
  }, [cfg]);

  const saveMutation = useMutation({
    mutationFn: () =>
      settingsService.update({
        ...Object.fromEntries(GROUPS.map((g) => [g, form[g]])),
        vector_top_k: form.vector_top_k,
        bm25_top_k: form.bm25_top_k,
        hybrid_top_k: form.hybrid_top_k,
        rrf_k: form.rrf_k,
        reranker_top_n: form.reranker_top_n,
        max_reformulations: form.max_reformulations,
        agent_recursion_limit: form.agent_recursion_limit,
        agent_retry_count: form.agent_retry_count,
        splitter: {
          strategy: 'recursive',
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
      qc.invalidateQueries({ queryKey: settingsKeys.apiInfo() });
      // Clear stored keys in form so subsequent saves don't resend them
      setForm((prev) => ({
        ...prev,
        llm: { ...prev.llm, api_key: '' },
        fast_llm: { ...prev.fast_llm, api_key: '' },
        embedding: { ...prev.embedding, api_key: '' },
        reranker: { ...prev.reranker, api_key: '' },
      }));
      showToast('配置已保存', 'success');
    },
    onError: (err) => handleMutationError(err, showToast),
  });

  const updateConfig = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const updateGroup = (group: (typeof GROUPS)[number], patch: Partial<ApiGroupForm>) =>
    setForm((prev) => ({ ...prev, [group]: { ...prev[group], ...patch } }));

  return {
    config: form,
    isLoading,
    updateConfig,
    updateGroup,
    isSaving: saveMutation.isPending,
    save: () => saveMutation.mutate(),
  };
}
