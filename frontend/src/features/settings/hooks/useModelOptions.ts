import { useMemo } from 'react';

export function useModelOptions(availableModels: string[] | undefined) {
  const combinedLlmModels = useMemo(() => {
    const coreModels = [
      'qwen-plus',
      'qwen-turbo',
      'qwen-max',
      'deepseek-chat',
      'deepseek-reasoner',
    ];
    const excludePatterns = [
      'image',
      'speech',
      'audio',
      'vl',
      'math',
      'mt',
      'v1',
      'embedding',
      'rerank',
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
    const coreModels = ['text-embedding-v3', 'text-embedding-v2'];
    const all = [...new Set([...(availableModels || []), ...coreModels])];
    const filtered = all.filter((m) => m.toLowerCase().includes('embedding'));
    return filtered.map((m) => ({
      value: m,
      label: m,
      desc: m === 'text-embedding-v3' ? '推荐：1024维高精度' : undefined,
    }));
  }, [availableModels]);

  const combinedRerankerModels = useMemo(() => {
    const coreModels = ['gte-rerank', 'gte-rerank-hybrid'];
    const all = [...new Set([...(availableModels || []), ...coreModels])];
    const filtered = all.filter((m) => m.toLowerCase().includes('rerank'));
    return filtered.map((m) => ({
      value: m,
      label: m,
      desc: m === 'gte-rerank' ? '推荐：通用重排序' : undefined,
    }));
  }, [availableModels]);

  return { combinedLlmModels, combinedEmbeddingModels, combinedRerankerModels };
}
