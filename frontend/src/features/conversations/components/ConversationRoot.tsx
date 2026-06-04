import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminConversationSidebar, StudentConversationSidebar } from './ConversationSidebar';
import { ChatPanel } from './ChatPanel';
import { useChat } from '../hooks/useChat';
import { useConversationList } from '../hooks/useConversationList';
import { conversationKeys } from '../hooks/queryKeys';
import { chatService } from '../services/chatService';
import { useIsStudent } from '@shared/store/authStore';

export function ConversationRoot() {
  const isStudent = useIsStudent();
  const queryClient = useQueryClient();

  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // 学生端知识库
  const { data: activeKbData } = useQuery({
    queryKey: conversationKeys.activeKb(),
    queryFn: chatService.getActiveKb,
    enabled: isStudent,
  });
  const studentKb = activeKbData?.kb_name ?? null;

  // 管理端知识库
  const { data: adminKbData } = useQuery({
    queryKey: conversationKeys.adminKb(),
    queryFn: chatService.getAdminKb,
    enabled: !isStudent,
  });
  const adminKb = adminKbData?.kb_name ?? null;

  const effectiveKb = isStudent ? (studentKb ?? '') : (adminKb ?? '');

  // 对话列表
  const {
    conversations,
    isFetchingNextPage,
    handleLoadMore,
    deleteConversation: doDelete,
    renameConversation,
  } = useConversationList(effectiveKb);

  // Chat state machine
  const { messages, isStreaming, thinkingSteps, send, clearMessages, loadHistory, applyFeedback } =
    useChat();

  const activeConv = conversations.find((c) => c.id === activeConvId);
  const chatKb = activeConv?.kb_name ?? effectiveKb;

  // ── Handlers ─────────────────────────────────────────────

  const handleSelectConversation = useCallback(
    async (convId: number) => {
      setActiveConvId(convId);
      setIsLoadingHistory(true);
      await loadHistory(convId);
      setIsLoadingHistory(false);
    },
    [loadHistory],
  );

  const handleNewConversation = useCallback(async () => {
    if (!effectiveKb) return;
    try {
      const conv = await chatService.createConversation(effectiveKb, '新对话');
      setActiveConvId(conv.id);
      clearMessages();
      queryClient.invalidateQueries({ queryKey: conversationKeys.all() });
    } catch {
      /* 静默失败 */
    }
  }, [effectiveKb, queryClient, clearMessages]);

  const handleDeleteConversation = useCallback(
    (convId: number) => {
      doDelete(convId);
      if (convId === activeConvId) {
        setActiveConvId(null);
        clearMessages();
      }
    },
    [activeConvId, doDelete, clearMessages],
  );

  const handleRenameConversation = useCallback(
    (convId: number, title: string) => {
      renameConversation(convId, title);
    },
    [renameConversation],
  );

  const handleClearMessages = useCallback(() => {
    clearMessages();
    setActiveConvId(null);
  }, [clearMessages]);

  const handleSend = useCallback(
    (query: string) => {
      send(
        query,
        chatKb,
        activeConvId,
        (newConvId) => setActiveConvId(newConvId),
        () => queryClient.invalidateQueries({ queryKey: conversationKeys.all() }),
      );
    },
    [send, chatKb, activeConvId, queryClient],
  );

  return (
    <div className="flex flex-1 min-h-0 gap-3">
      {/* 左侧对话列表 */}
      {isStudent ? (
        <StudentConversationSidebar
          conversations={conversations}
          activeId={activeConvId}
          activeKbName={studentKb}
          onSelect={handleSelectConversation}
          onNew={handleNewConversation}
          onDelete={handleDeleteConversation}
          onRename={handleRenameConversation}
          onLoadMore={handleLoadMore}
          isFetchingMore={isFetchingNextPage}
        />
      ) : (
        <AdminConversationSidebar
          conversations={conversations}
          activeId={activeConvId}
          adminKbName={adminKb}
          onSelect={handleSelectConversation}
          onNew={handleNewConversation}
          onDelete={handleDeleteConversation}
          onRename={handleRenameConversation}
          onLoadMore={handleLoadMore}
          isFetchingMore={isFetchingNextPage}
        />
      )}

      {/* 右侧聊天区 */}
      <ChatPanel
        messages={messages}
        isStreaming={isStreaming}
        isLoadingHistory={isLoadingHistory}
        thinkingSteps={thinkingSteps}
        activeConvId={activeConvId}
        chatKb={chatKb}
        effectiveKb={effectiveKb}
        isStudent={isStudent}
        studentKb={studentKb}
        onSend={handleSend}
        onFeedback={applyFeedback}
        onClearMessages={handleClearMessages}
      />
    </div>
  );
}
