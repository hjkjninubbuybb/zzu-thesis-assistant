import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ticketService } from "../services/ticketService";
import { ticketKeys } from "./queryKeys";
import { useToast } from "@shared/store/uiStore";
import { handleMutationError } from "@shared/lib/errorHandler";
import type { QARequestCreate } from "@shared/types/api";

export function useTicketList(scope: "all" | "mine") {
  const qc = useQueryClient();
  const { showToast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ticketKeys.list(scope),
    queryFn: () =>
      scope === "all" ? ticketService.listAll() : ticketService.listMine(),
  });

  const replyMutation = useMutation({
    mutationFn: ({ id, answer }: { id: number; answer: string }) =>
      ticketService.reply(id, answer),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ticketKeys.all() });
      showToast("回复已提交", "success");
    },
    onError: (err) => handleMutationError(err, showToast),
  });

  const createMutation = useMutation({
    mutationFn: (payload: QARequestCreate) => ticketService.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ticketKeys.all() });
      showToast("求助工单已提交", "success");
    },
    onError: (err) => handleMutationError(err, showToast),
  });

  const closeMutation = useMutation({
    mutationFn: (id: number) => ticketService.close(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ticketKeys.all() });
      showToast("工单已关闭", "success");
    },
    onError: (err) => handleMutationError(err, showToast),
  });

  return {
    tickets: data ?? [],
    isLoading,
    replyTicket: replyMutation.mutate,
    isReplying: replyMutation.isPending,
    createTicket: createMutation.mutate,
    closeTicket: closeMutation.mutate,
    isClosing: closeMutation.isPending,
  };
}
