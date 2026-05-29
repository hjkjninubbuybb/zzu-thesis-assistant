import { useState, useRef, useCallback } from "react";
import { chatService } from "../services/chatService";
import type { ChatMessage, FileItem, SourceItem } from "@shared/types/api";
import type { ThinkingStep } from "../components/ThinkingProcess";

const STATUS_TEXT: Record<string, string> = {
  faq_matching: "正在匹配知识库 FAQ...",
  faq_answering: "正在生成 FAQ 快答...",
  building_retriever: "正在构建知识库检索索引...",
  running_rag: "正在检索并生成答案...",
};

const TOOL_LABELS: Record<string, string> = {
  search_knowledge_base: "🔍 检索知识库",
  get_academic_calendar: "📅 查询郑大校历",
  list_kb_documents: "📋 查看文档目录",
  get_document_link: "📎 查找原文文件",
};

const MAX_REF = 2;

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (
      query: string,
      chatKb: string,
      activeConvId: number | null,
      onConvCreated: (convId: number) => void,
      onInvalidate: () => void,
    ) => {
      if (!query.trim() || !chatKb || isStreaming) return;

      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const history = chatService.buildHistory(messages);

      let convId = activeConvId;
      if (!convId) {
        try {
          const conv = await chatService.createConversation(chatKb, "新对话");
          convId = conv.id;
          onConvCreated(conv.id);
          onInvalidate();
        } catch {
          return;
        }
      }

      let userDbMsg: { id: number } | null = null;
      try {
        userDbMsg = await chatService.addMessage(convId, {
          role: "user",
          content: query,
        });
      } catch {
        /* 继续 */
      }

      const isFirstTurn = messages.length === 0;
      const assistantId = crypto.randomUUID();

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "user",
          content: query,
          dbMessageId: userDbMsg?.id,
          isNew: true,
        } as ChatMessage,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          status: "loading" as const,
          isNew: true,
        } as ChatMessage,
      ]);
      setIsStreaming(true);
      setThinkingSteps([
        { id: "step-1", label: "正在理解并优化查询...", status: "active" },
        { id: "step-2", label: "正在检索相关文档...", status: "pending" },
        { id: "step-3", label: "正在分析并总结回答...", status: "pending" },
      ]);

      let accumulatedText = "";
      let finalSources: SourceItem[] = [];
      let finalFiles: FileItem[] = [];
      let finalSuggestions: string[] = [];
      const currentConvId = convId;

      try {
        await chatService.stream(
          chatKb,
          query,
          MAX_REF,
          history,
          ctrl.signal,
          // onStatus
          (step: string) => {
            setThinkingSteps((prev) => {
              const next = [...prev];
              if (step === "faq_matching" || step === "faq_answering") {
                next[0] = {
                  ...next[0],
                  status: "active",
                  label: STATUS_TEXT[step],
                };
              } else if (step === "building_retriever") {
                next[0] = { ...next[0], status: "done" };
                next[1] = {
                  ...next[1],
                  status: "active",
                  label: STATUS_TEXT[step],
                };
              } else if (step === "running_rag") {
                next[1] = { ...next[1], status: "done" };
                next[2] = {
                  ...next[2],
                  status: "active",
                  label: STATUS_TEXT[step],
                };
              }
              return next;
            });
          },
          // onAnswer (full text replacement)
          (text: string) => {
            accumulatedText = text;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: text } : m,
              ),
            );
          },
          // onSources
          (sources: SourceItem[]) => {
            finalSources = sources;
            setThinkingSteps((prev) =>
              prev.map((s) => ({ ...s, status: "done" })),
            );
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, sources, status: "done" } : m,
              ),
            );
          },
          // onError
          (errMsg: string) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: errMsg, status: "error" }
                  : m,
              ),
            );
          },
          // onToken (incremental)
          (tokenText: string) => {
            accumulatedText += tokenText;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: accumulatedText } : m,
              ),
            );
          },
          // onAgentAction
          (tool: string, input: string) => {
            setThinkingSteps((prev) => {
              const label = TOOL_LABELS[tool] ?? tool;
              const existingIdx = prev.findIndex(
                (s) => s.id === `tool-${tool}`,
              );
              if (existingIdx >= 0) {
                const next = [...prev];
                next[existingIdx] = {
                  ...next[existingIdx],
                  status: "active",
                  input,
                };
                return next;
              }
              const activeIdx = prev.findLastIndex(
                (s) => s.status === "active",
              );
              const next = [...prev];
              next.splice(activeIdx, 0, {
                id: `tool-${tool}`,
                label,
                status: "active",
                input,
              });
              return next;
            });
          },
          // onFile
          (file: FileItem) => {
            finalFiles.push(file);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, files: [...(m.files ?? []), file] }
                  : m,
              ),
            );
          },
          // onSuggestions
          (items: string[]) => {
            finalSuggestions = items;
          },
        );

        setThinkingSteps([]);

        let assistantDbId: number | undefined;
        try {
          const saved = await chatService.addMessage(currentConvId, {
            role: "assistant",
            content: accumulatedText,
            sources: finalSources.length > 0 ? finalSources : null,
            files: finalFiles.length > 0 ? finalFiles : null,
          });
          assistantDbId = saved.id;
        } catch {
          /* 静默失败 */
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  status: "done",
                  dbMessageId: assistantDbId,
                  suggestions: finalSuggestions,
                }
              : m,
          ),
        );
        onInvalidate();

        if (isFirstTurn) {
          chatService
            .summarizeTitle(currentConvId)
            .then(() => onInvalidate())
            .catch(() => {
              /* 失败则保持 "新对话" */
            });
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: String(e), status: "error" }
              : m,
          ),
        );
      } finally {
        setIsStreaming(false);
      }
    },
    [isStreaming, messages],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setThinkingSteps([]);
    setIsStreaming(false);
  }, []);

  const loadHistory = useCallback(async (convId: number) => {
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
  }, []);

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
    [],
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
