import { useState, useCallback } from 'react';
import type { ChatMessage, SourceItem, FileItem } from '@shared/types/api';
import type { ThinkingStep } from '../components/ThinkingProcess';

export interface ChatMessagesState {
  messages: ChatMessage[];
  thinkingSteps: ThinkingStep[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setThinkingSteps: React.Dispatch<React.SetStateAction<ThinkingStep[]>>;
  appendUserAndAssistant: (query: string, assistantId: string, userDbMsgId?: number) => void;
  updateAssistantContent: (assistantId: string, content: string) => void;
  updateAssistantSources: (assistantId: string, sources: SourceItem[]) => void;
  updateAssistantError: (assistantId: string, errMsg: string) => void;
  appendAssistantFile: (assistantId: string, file: FileItem) => void;
  finalizeAssistant: (
    assistantId: string,
    dbMsgId: number | undefined,
    suggestions: string[],
  ) => void;
  clearMessages: () => void;
}

export function useChatMessages(): ChatMessagesState {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);

  const appendUserAndAssistant = useCallback(
    (query: string, assistantId: string, userDbMsgId?: number) => {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'user',
          content: query,
          dbMessageId: userDbMsgId,
          isNew: true,
        } as ChatMessage,
        {
          id: assistantId,
          role: 'assistant',
          content: '',
          status: 'loading' as const,
          isNew: true,
        } as ChatMessage,
      ]);
    },
    [],
  );

  const updateAssistantContent = useCallback((assistantId: string, content: string) => {
    setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content } : m)));
  }, []);

  const updateAssistantSources = useCallback((assistantId: string, sources: SourceItem[]) => {
    setThinkingSteps((prev) => prev.map((s) => ({ ...s, status: 'done' as const })));
    setMessages((prev) =>
      prev.map((m) => (m.id === assistantId ? { ...m, sources, status: 'done' } : m)),
    );
  }, []);

  const updateAssistantError = useCallback((assistantId: string, errMsg: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === assistantId ? { ...m, content: errMsg, status: 'error' } : m)),
    );
  }, []);

  const appendAssistantFile = useCallback((assistantId: string, file: FileItem) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === assistantId ? { ...m, files: [...(m.files ?? []), file] } : m)),
    );
  }, []);

  const finalizeAssistant = useCallback(
    (assistantId: string, dbMsgId: number | undefined, suggestions: string[]) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, status: 'done', dbMessageId: dbMsgId, suggestions } : m,
        ),
      );
    },
    [],
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setThinkingSteps([]);
  }, []);

  return {
    messages,
    thinkingSteps,
    setMessages,
    setThinkingSteps,
    appendUserAndAssistant,
    updateAssistantContent,
    updateAssistantSources,
    updateAssistantError,
    appendAssistantFile,
    finalizeAssistant,
    clearMessages,
  };
}
