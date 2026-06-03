import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { kbDocumentService } from '../services/kbDocumentService';
import { knowledgeKeys } from './queryKeys';
import type { UploadParams } from '@shared/types/api';

/**
 * 知识库内文档管理：列表查询 + 删除 + 上传。
 *
 * 上传不走 useMutation：调用方需要在队列里按文件逐个更新进度与状态，
 * 因此暴露成普通的 async 函数，由调用方自行编排循环。
 */
export function useKBDocuments(kbName: string) {
  const qc = useQueryClient();

  const listQuery = useQuery({
    queryKey: knowledgeKeys.documents(kbName),
    queryFn: () => kbDocumentService.list(kbName),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => kbDocumentService.delete(kbName, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: knowledgeKeys.documents(kbName) });
      qc.invalidateQueries({ queryKey: knowledgeKeys.list() });
    },
  });

  const uploadDoc = async (file: File, params: UploadParams, onProgress: (pct: number) => void) => {
    const doc = await kbDocumentService.upload(kbName, file, params, onProgress);
    qc.invalidateQueries({ queryKey: knowledgeKeys.documents(kbName) });
    qc.invalidateQueries({ queryKey: knowledgeKeys.list() });
    return doc;
  };

  return {
    docs: listQuery.data,
    docsLoading: listQuery.isLoading,
    deleteDoc: deleteMutation.mutate,
    deleteDocPending: deleteMutation.isPending,
    deleteDocError: deleteMutation.error,
    uploadDoc,
  };
}
