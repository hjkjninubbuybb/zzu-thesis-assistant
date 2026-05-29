import { useCallback } from "react";
import { chatService } from "../services/chatService";
import { useChatMessages } from "./useChatMessages";
import { useChatStream } from "./useChatStream";

export function useChat() {
  const msgState = useChatMessages();
  const { messages, thinkingSteps, setMessages, clearMessages } = msgState;
  const { isStreaming, send, stop } = useChatStream(msgState);

  const loadHistory = useCallback(
    async (convId: number) => {
      try {
        const { messages: msgs } = await chatService.getConversation(convId);
        setMessages(
          msgs.map((m) => ({
            id: crypto.randomUUID(),
            role: m.role,
            content: m.content,
            sources: m.sources ?? undefined,
            files: m.files ?? undefined,
            status: "done" as const,
            dbMessageId: m.id,
            feedback: m.feedback ?? undefined,
          })),
        );
      } catch {
        setMessages([]);
      }
    },
    [setMessages],
  );

  const applyFeedback = useCallback(
    async (msgId: number, rating: "up" | "down") => {
      try {
        await chatService.submitFeedback(msgId, rating);
        setMessages((prev) =>
          prev.map((m) =>
            m.dbMessageId === msgId
              ? { ...m, feedback: m.feedback === rating ? null : rating }
              : m,
          ),
        );
      } catch {
        /* 静默失败 */
      }
    },
    [setMessages],
  );

  return {
    messages,
    isStreaming,
    thinkingSteps,
    send,
    stop,
    clearMessages,
    loadHistory,
    applyFeedback,
  };
}
