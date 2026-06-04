import { useQuery } from '@tanstack/react-query';
import { chatService } from '../services/chatService';
import { conversationKeys } from './queryKeys';

export function useMessageHistory(conversationId: number | null) {
  return useQuery({
    queryKey: conversationKeys.messages(conversationId ?? -1),
    queryFn: () => chatService.getConversation(conversationId!),
    enabled: conversationId !== null,
  });
}
