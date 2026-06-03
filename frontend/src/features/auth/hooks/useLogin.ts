import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/authService';
import { useSetUser, useAuthPortal } from '@shared/store/authStore';
import { handleMutationError } from '@shared/lib/errorHandler';
import { useToast } from '@shared/store/uiStore';
import type { Portal } from '@shared/lib/auth';

export function useLogin(portal: Portal) {
  const navigate = useNavigate();
  const setUser = useSetUser();
  const { showToast } = useToast();
  const currentPortal = useAuthPortal() ?? portal;

  return useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      authService.login(username, password),
    onSuccess: (data) => {
      authService.persist(data, currentPortal);
      setUser(data.user);
      navigate(currentPortal === 'student' ? '/student' : '/admin');
    },
    onError: (err) => handleMutationError(err, showToast),
  });
}
