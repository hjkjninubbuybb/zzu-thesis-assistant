import { useCallback, useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { chatService } from '../services/chatService';
import { conversationKeys } from './queryKeys';
import { useToast } from '@shared/store/uiStore';

const PAGE_SIZE = 30;

export function useConversationList(kbName: string) {
  const qc = useQueryClient();
  const { showToast } = useToast();

  const {
    data: pages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: conversationKeys.list(kbName || '__all__'),
    queryFn: ({ pageParam }) =>
      chatService.listConversations({
        kb_name: kbName || undefined,
        cursor_id: (pageParam as { id: number; updated_at: string } | undefined)?.id,
        cursor_updated_at: (pageParam as { id: number; updated_at: string } | undefined)
          ?.updated_at,
        limit: PAGE_SIZE,
      }),
    initialPageParam: undefined as { id: number; updated_at: string } | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  });

  const conversations = useMemo(() => pages?.pages.flatMap((p) => p.items) ?? [], [pages]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const deleteMutation = useMutation({
    mutationFn: chatService.deleteConversation,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: conversationKeys.all() });
      showToast('对话已删除', 'success');
    },
    onError: () => {
      showToast('删除失败，请稍后重试', 'error');
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ convId, title }: { convId: number; title: string }) =>
      chatService.updateTitle(convId, title),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: conversationKeys.all() });
    },
  });

  return {
    conversations,
    isLoading: isFetchingNextPage,
    isFetchingNextPage,
    handleLoadMore,
    deleteConversation: deleteMutation.mutate,
    renameConversation: (convId: number, title: string) => renameMutation.mutate({ convId, title }),
  };
}
