import { useQuery } from '@tanstack/react-query';
import { studentService } from '../services/studentService';
import { studentKeys } from './queryKeys';

export function useStudentHome() {
  const { data: conversationData, isLoading: convLoading } = useQuery({
    queryKey: studentKeys.recentChats(),
    queryFn: studentService.listAllConversations,
  });

  const { data: activeKB, isLoading: kbLoading } = useQuery({
    queryKey: studentKeys.activeKB(),
    queryFn: studentService.getActiveKb,
  });

  const activeKbName = activeKB?.kb_name;
  const { data: faqs } = useQuery({
    queryKey: ['faqs-home', activeKbName],
    queryFn: () => studentService.listFaqs(activeKbName!),
    enabled: !!activeKbName,
    select: (data) => data.filter((f) => f.enabled).slice(0, 5),
  });

  const conversations = conversationData?.items ?? [];
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayConvs = conversations.filter((c) => c.updated_at.startsWith(todayStr));
  const recentConvs = conversations.slice(0, 5);

  return {
    conversations,
    recentConversations: recentConvs,
    todayConversations: todayConvs,
    activeKB,
    faqs: faqs ?? [],
    isLoading: convLoading || kbLoading,
  };
}
