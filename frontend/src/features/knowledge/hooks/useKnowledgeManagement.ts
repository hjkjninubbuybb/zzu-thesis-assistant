import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { knowledgeService } from "../services/knowledgeService";
import { knowledgeKeys } from "./queryKeys";
import { useToast } from "@shared/store/uiStore";
import { handleMutationError } from "@shared/lib/errorHandler";

export function useKnowledgeManagement() {
  const qc = useQueryClient();
  const { showToast } = useToast();

  const {
    data: kbList = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: knowledgeKeys.list(),
    queryFn: knowledgeService.list,
  });

  const { data: studentKbData } = useQuery({
    queryKey: knowledgeKeys.active(),
    queryFn: knowledgeService.getActive,
  });

  const { data: adminKbData } = useQuery({
    queryKey: knowledgeKeys.adminActive(),
    queryFn: knowledgeService.getAdminActive,
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: knowledgeKeys.list() });
    qc.invalidateQueries({ queryKey: knowledgeKeys.active() });
    qc.invalidateQueries({ queryKey: knowledgeKeys.adminActive() });
  };

  const createMutation = useMutation({
    mutationFn: knowledgeService.create,
    onSuccess: () => {
      invalidateAll();
      showToast("知识库创建成功", "success");
    },
    onError: (err) => handleMutationError(err, showToast),
  });

  const deleteMutation = useMutation({
    mutationFn: knowledgeService.delete,
    onSuccess: (_data, name) => {
      invalidateAll();
      showToast(`知识库 "${name}" 已删除`, "success");
    },
    onError: (err) => handleMutationError(err, showToast),
  });

  const setStudentMutation = useMutation({
    mutationFn: knowledgeService.setActive,
    onSuccess: (data) => {
      invalidateAll();
      showToast(`已将「${data.kb_name}」设为学生知识库`, "success");
    },
    onError: (err) => handleMutationError(err, showToast),
  });

  const clearStudentMutation = useMutation({
    mutationFn: knowledgeService.clearActive,
    onSuccess: () => {
      invalidateAll();
      showToast("已取消学生知识库分配", "success");
    },
    onError: (err) => handleMutationError(err, showToast),
  });

  const setAdminMutation = useMutation({
    mutationFn: knowledgeService.setAdminActive,
    onSuccess: (data) => {
      invalidateAll();
      showToast(`已将「${data.kb_name}」设为管理端知识库`, "success");
    },
    onError: (err) => handleMutationError(err, showToast),
  });

  const clearAdminMutation = useMutation({
    mutationFn: knowledgeService.clearAdminActive,
    onSuccess: () => {
      invalidateAll();
      showToast("已取消管理端知识库分配", "success");
    },
    onError: (err) => handleMutationError(err, showToast),
  });

  return {
    kbList,
    isLoading,
    error,
    studentKbName: studentKbData?.kb_name ?? null,
    adminKbName: adminKbData?.kb_name ?? null,
    createKB: createMutation.mutate,
    isCreating: createMutation.isPending,
    createError: createMutation.error,
    deleteKB: deleteMutation.mutate,
    isDeletingKB: deleteMutation.isPending,
    setStudentKB: setStudentMutation.mutate,
    isSettingStudent: setStudentMutation.isPending,
    clearStudentKB: clearStudentMutation.mutate,
    isClearingStudent: clearStudentMutation.isPending,
    setAdminKB: setAdminMutation.mutate,
    isSettingAdmin: setAdminMutation.isPending,
    clearAdminKB: clearAdminMutation.mutate,
    isClearingAdmin: clearAdminMutation.isPending,
  };
}
