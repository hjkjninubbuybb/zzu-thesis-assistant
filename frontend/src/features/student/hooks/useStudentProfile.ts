import { useMutation } from "@tanstack/react-query";
import { studentService } from "../services/studentService";
import { useToast } from "@shared/store/uiStore";
import { handleMutationError } from "@shared/lib/errorHandler";
import { useAuthUser } from "@shared/store/authStore";

export function useStudentProfile() {
  const user = useAuthUser();
  const { showToast } = useToast();

  const changePasswordMutation = useMutation({
    mutationFn: ({ oldPwd, newPwd }: { oldPwd: string; newPwd: string }) =>
      studentService.changePassword(oldPwd, newPwd),
    onSuccess: () => showToast("密码已修改", "success"),
    onError: (err) => handleMutationError(err, showToast),
  });

  return {
    user,
    changePassword: changePasswordMutation.mutate,
    isChangingPassword: changePasswordMutation.isPending,
    changePasswordError: changePasswordMutation.error,
  };
}
