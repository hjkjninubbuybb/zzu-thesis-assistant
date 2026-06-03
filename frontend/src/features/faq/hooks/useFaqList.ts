import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { faqService } from '../services/faqService';
import { faqKeys } from './queryKeys';
import { useToast } from '@shared/store/uiStore';
import { handleMutationError } from '@shared/lib/errorHandler';
import type { FAQCreate, FAQUpdate } from '@shared/types/api';

const PAGE_SIZE = 20;

export function useFaqList(kbName: string, page: number) {
  const qc = useQueryClient();
  const { showToast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: faqKeys.list(kbName, page),
    queryFn: () => faqService.list(kbName, page, PAGE_SIZE),
    enabled: !!kbName,
  });

  const faqs = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

  const createMutation = useMutation({
    mutationFn: (payload: FAQCreate) => faqService.create(kbName, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: faqKeys.all(kbName) });
      showToast('FAQ 已创建', 'success');
    },
    onError: (err) => handleMutationError(err, showToast),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: FAQUpdate }) =>
      faqService.update(kbName, id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: faqKeys.all(kbName) });
      showToast('FAQ 已更新', 'success');
    },
    onError: (err) => handleMutationError(err, showToast),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => faqService.delete(kbName, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: faqKeys.all(kbName) });
      showToast('FAQ 已删除', 'success');
    },
    onError: (err) => handleMutationError(err, showToast),
  });

  return {
    faqs,
    total,
    totalPages,
    isLoading,
    createFaq: createMutation.mutate,
    updateFaq: updateMutation.mutate,
    deleteFaq: deleteMutation.mutate,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
