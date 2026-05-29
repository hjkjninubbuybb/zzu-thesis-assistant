import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { documentService } from "../services/documentService";
import { documentKeys } from "./queryKeys";
import { useToast } from "@shared/store/uiStore";
import { handleMutationError } from "@shared/lib/errorHandler";

export function useDocumentList(kbName: string) {
  const qc = useQueryClient();
  const { showToast } = useToast();

  const { data: docs = [], isLoading } = useQuery({
    queryKey: documentKeys.list(kbName),
    queryFn: () => documentService.list(kbName),
    enabled: !!kbName,
  });

  const deleteMutation = useMutation({
    mutationFn: ({ docId }: { docId: number }) =>
      documentService.delete(kbName, docId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: documentKeys.all(kbName) });
      showToast("文档已删除", "success");
    },
    onError: (err) => handleMutationError(err, showToast),
  });

  const reindexMutation = useMutation({
    mutationFn: ({ docId }: { docId: number }) =>
      documentService.reindex(kbName, docId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: documentKeys.all(kbName) });
      showToast("重建索引已启动", "success");
    },
    onError: (err) => handleMutationError(err, showToast),
  });

  return {
    docs,
    isLoading,
    deleteDoc: deleteMutation.mutate,
    reindexDoc: reindexMutation.mutate,
  };
}
