import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { documentService } from '../services/documentService';
import { documentKeys } from './queryKeys';
import { useToast } from '@shared/store/uiStore';
import { handleMutationError } from '@shared/lib/errorHandler';

const PAGE_SIZE = 20;

export function useDocumentList(kbName: string, page: number, docType?: string) {
  const qc = useQueryClient();
  const { showToast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: documentKeys.list(kbName, page, docType),
    queryFn: () => documentService.list(kbName, page, PAGE_SIZE, docType),
    enabled: !!kbName,
  });

  const docs = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

  const deleteMutation = useMutation({
    mutationFn: ({ docId }: { docId: number }) => documentService.delete(kbName, docId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: documentKeys.all(kbName) });
      showToast('文档已删除', 'success');
    },
    onError: (err) => handleMutationError(err, showToast),
  });

  const reindexMutation = useMutation({
    mutationFn: ({ docId }: { docId: number }) => documentService.reindex(kbName, docId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: documentKeys.all(kbName) });
      showToast('重建索引已启动', 'success');
    },
    onError: (err) => handleMutationError(err, showToast),
  });

  return {
    docs,
    total,
    totalPages,
    isLoading,
    deleteDoc: deleteMutation.mutate,
    reindexDoc: reindexMutation.mutate,
  };
}
