import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsService } from '../services/settingsService';
import { settingsKeys } from './queryKeys';
import { useToast } from '@shared/store/uiStore';
import type { ApiGroup, TestConnectionResult } from '@shared/types/api';

const ALL_GROUPS: ApiGroup[] = ['llm', 'fast_llm', 'embedding', 'reranker'];

export function useApiKeyManager() {
  const qc = useQueryClient();
  const { showToast } = useToast();

  const { data: apiInfo, isLoading: apiInfoLoading } = useQuery({
    queryKey: settingsKeys.apiInfo(),
    queryFn: settingsService.getApiInfo,
  });

  const testMutation = useMutation<TestConnectionResult>({
    mutationFn: settingsService.testConnection,
    onSuccess: (data) => {
      const failed = ALL_GROUPS.filter((g) => !data[g].ok);
      if (failed.length === 0) {
        showToast('全部 4 组连接成功', 'success');
      } else {
        showToast(`${failed.length} 组连接失败：${failed.join(', ')}`, 'error');
      }
    },
    onError: () => showToast('测试连接失败', 'error'),
  });

  return {
    apiInfo,
    apiInfoLoading,
    testMutation,
    /** Per-group model lists (only populated after testMutation succeeds). */
    perGroupModels: testMutation.data,
    /** Convenience: invalidate api-info after successful save. */
    invalidateApiInfo: () => qc.invalidateQueries({ queryKey: settingsKeys.apiInfo() }),
  };
}
