import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mentorService } from '../services/mentorService';
import { useToast } from '@shared/store/uiStore';
import { handleMutationError } from '@shared/lib/errorHandler';
import { useSetUser } from '@shared/store/authStore';
import type { UpdateMeRequest } from '@shared/types/api';

export function useUpdateProfile() {
  const { showToast } = useToast();
  const setUser = useSetUser();
  const qc = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: (body: UpdateMeRequest) => mentorService.updateMe(body),
    onSuccess: (user) => {
      setUser(user);
      qc.invalidateQueries({ queryKey: ['mentor'] });
      showToast('资料已更新', 'success');
    },
    onError: (err) => handleMutationError(err, showToast),
  });

  const passwordMutation = useMutation({
    mutationFn: ({ oldPassword, newPassword }: { oldPassword: string; newPassword: string }) =>
      mentorService.changePassword(oldPassword, newPassword),
    onSuccess: () => showToast('密码已修改', 'success'),
    onError: (err) => handleMutationError(err, showToast),
  });

  return {
    updateProfile: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
    changePassword: passwordMutation.mutate,
    isChangingPassword: passwordMutation.isPending,
  };
}
