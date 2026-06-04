import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userService } from '../services/userService';
import { userKeys } from './queryKeys';
import { useToast } from '@shared/store/uiStore';
import { handleMutationError } from '@shared/lib/errorHandler';

export function useTeacherList(page = 1, pageSize = 20) {
  const qc = useQueryClient();
  const { showToast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['users', 'teacher', page],
    queryFn: () => userService.list({ role: 'teacher', page, page_size: pageSize }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      userService.update(id, { is_active: isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all() }),
    onError: (err) => handleMutationError(err, showToast),
  });

  const deleteMutation = useMutation({
    mutationFn: userService.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userKeys.all() });
      showToast('用户已删除', 'success');
    },
    onError: (err) => handleMutationError(err, showToast),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) =>
      userService.resetPassword(id, password),
    onSuccess: () => showToast('密码已重置', 'success'),
    onError: (err) => handleMutationError(err, showToast),
  });

  return {
    teachers: data?.items ?? [],
    total: data?.total ?? 0,
    isLoading,
    toggleActive: toggleActiveMutation.mutate,
    deleteUser: deleteMutation.mutate,
    resetPassword: resetPasswordMutation.mutate,
  };
}
