import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  useQuery,
  useQueryClient,
  useInfiniteQuery,
} from "@tanstack/react-query";
import { ArrowUp, Loader2, Plus } from "lucide-react";
import { knowledgeApi, faqApi, conversationApi } from "@/lib/api";

import { useAuth } from "@/hooks/useAuth";
import { Toast } from "@/components/ui/Toast";
import { buildHistory, streamChat } from "@/lib/streamChat";
import { AgentAvatar } from "@/components/chat/AgentAvatar";
import { MessageBubble } from "@/components/chat/MessageBubble";
import {
  AdminConversationSidebar,
  StudentConversationSidebar,
} from "@/components/chat/ConversationSidebar";
import { TutorHelpModal } from "@/components/chat/TutorHelpModal";
import {
  ThinkingProcess,
  ConversationSkeleton,
} from "@/components/chat/ThinkingProcess";
import type { ThinkingStep } from "@/components/chat/ThinkingProcess";
import type { ChatMessage, FileItem, SourceItem } from "@/types/api";

// ── 主页面 ────────────────────────────────────────────────

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

export default function ConversationsPage() {
  const { isStudent } = useAuth();
  const queryClient = useQueryClient();

  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [maxRef] = useState(2);
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const [helpMsg, setHelpMsg] = useState<ChatMessage | null>(null);
  const [toast, setToast] = useState<{
    msg: string;
    type: "success" | "error";
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 学生端：管理员分配的知识库
  const { data: activeKbData } = useQuery({
    queryKey: ["active-kb"],
    queryFn: knowledgeApi.getActiveKb,
    enabled: isStudent,
  });
  const studentKb = activeKbData?.kb_name ?? null;

  // 管理端：管理员预设的知识库
  const { data: adminKbData } = useQuery({
    queryKey: ["admin-kb"],
    queryFn: knowledgeApi.getAdminKb,
    enabled: !isStudent,
  });
  const adminKb = adminKbData?.kb_name ?? null;

  // 当前生效的 kb_name
  const effectiveKb = isStudent ? (studentKb ?? "") : (adminKb ?? "");

  const {
    data: conversationPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["conversations", effectiveKb || "__all__"],
    queryFn: ({ pageParam }) =>
      conversationApi.list({
        kb_name: effectiveKb || undefined,
        cursor_id: pageParam?.id,
        cursor_updated_at: pageParam?.updated_at,
        limit: 30,
      }),
    initialPageParam: undefined as
      | { id: number; updated_at: string }
      | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  });

  const conversations = useMemo(
    () => conversationPages?.pages.flatMap((p) => p.items) ?? [],
    [conversationPages],
  );

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const { data: faqs } = useQuery({
    queryKey: ["faqs", effectiveKb],
    queryFn: () => faqApi.list(effectiveKb),
    enabled: !!effectiveKb,
    select: (data) => data.filter((f) => f.enabled).slice(0, 6),
  });

  const activeConv = conversations.find((c) => c.id === activeConvId);
  const chatKb = activeConv?.kb_name ?? effectiveKb;

  const scrollRAF = useRef(0);
  useEffect(() => {
    cancelAnimationFrame(scrollRAF.current);
    scrollRAF.current = requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }, [messages]);

  const loadConversation = useCallback(
    async (convId: number) => {
      setActiveConvId(convId);
      setIsLoadingHistory(true);
      try {
        const { conversation: _, messages: msgs } =
          await conversationApi.get(convId);
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
      } finally {
        setIsLoadingHistory(false);
      }
    },
    [isStudent],
  );

  const handleNewConversation = useCallback(async () => {
    if (!effectiveKb) return;
    const conv = await conversationApi.create(effectiveKb);
    setActiveConvId(conv.id);
    setMessages([]);
    setThinkingSteps([]);
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
  }, [effectiveKb, queryClient]);

  const handleDeleteConversation = useCallback(
    async (convId: number) => {
      await conversationApi.delete(convId);
      if (convId === activeConvId) {
        setActiveConvId(null);
        setMessages([]);
      }
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    [activeConvId, queryClient],
  );

  const handleRenameConversation = useCallback(
    async (convId: number, title: string) => {
      try {
        await conversationApi.updateTitle(convId, title);
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      } catch {
        /* 静默失败 */
      }
    },
    [queryClient],
  );

  const handleFeedback = useCallback(
    async (msgId: number, rating: "up" | "down") => {
      try {
        await conversationApi.submitFeedback(msgId, rating);
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

  const sendMessage = useCallback(
    async (directText?: string) => {
      const q = directText !== undefined ? directText.trim() : query.trim();
      if (!q || !effectiveKb || isStreaming) return;
      if (directText === undefined) setQuery("");

      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const history = buildHistory(messages);

      let convId = activeConvId;
      if (!convId) {
        try {
          const conv = await conversationApi.create(chatKb, "新对话");
          convId = conv.id;
          setActiveConvId(conv.id);
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
        } catch {
          return;
        }
      }

      let userDbMsg: { id: number } | null = null;
      try {
        userDbMsg = await conversationApi.addMessage(convId, {
          role: "user",
          content: q,
        });
      } catch {
        /* 继续 */
      }

      const isFirstTurn = messages.length === 0;
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: q,
        dbMessageId: userDbMsg?.id,
        isNew: true,
      };
      const assistantId = crypto.randomUUID();
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        status: "loading",
        isNew: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
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
        await streamChat(
          chatKb,
          q,
          maxRef,
          history,
          ctrl.signal,
          (step) => {
            setThinkingSteps((prev) => {
              const next = [...prev];
              if (step === "faq_matching" || step === "faq_answering") {
                next[0].status = "active";
                next[0].label = STATUS_TEXT[step];
              } else if (step === "building_retriever") {
                next[0].status = "done";
                next[1].status = "active";
                next[1].label = STATUS_TEXT[step];
              } else if (step === "running_rag") {
                next[1].status = "done";
                next[2].status = "active";
                next[2].label = STATUS_TEXT[step];
              }
              return next;
            });
          },
          (text) => {
            accumulatedText = text;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: text } : m,
              ),
            );
          },
          (sources) => {
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
          (errMsg) =>
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: errMsg, status: "error" }
                  : m,
              ),
            ),
          (tokenText) => {
            accumulatedText += tokenText;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: accumulatedText } : m,
              ),
            );
          },
          (tool, input) => {
            setThinkingSteps((prev) => {
              const label = TOOL_LABELS[tool] ?? tool;
              // 查找是否已存在该工具步骤，没有则插入
              const existingIdx = prev.findIndex(
                (s) => s.id === `tool-${tool}`,
              );
              if (existingIdx >= 0) {
                const next = [...prev];
                next[existingIdx].status = "active";
                next[existingIdx].input = input;
                return next;
              }
              // 在当前 active 步骤之后插入
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
          (file) => {
            finalFiles.push(file);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, files: [...(m.files ?? []), file] }
                  : m,
              ),
            );
          },
          (items) => {
            finalSuggestions = items;
          },
        );

        // ... (saving assistant message and cleaning up)
        setThinkingSteps([]);

        let assistantDbId: number | undefined;
        try {
          const saved = await conversationApi.addMessage(currentConvId, {
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
        queryClient.invalidateQueries({ queryKey: ["conversations"] });

        // 首轮对话结束后，让 LLM 总结一个语义化标题
        if (isFirstTurn) {
          conversationApi
            .summarizeTitle(currentConvId)
            .then(() =>
              queryClient.invalidateQueries({ queryKey: ["conversations"] }),
            )
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
    [query, chatKb, maxRef, isStreaming, messages, activeConvId, queryClient],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(undefined);
    }
  };

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    autoResize();
  }, [query]);

  return (
    <div className="flex flex-1 min-h-0 gap-3">
      {/* 左侧对话列表 */}
      {isStudent ? (
        <StudentConversationSidebar
          conversations={conversations}
          activeId={activeConvId}
          activeKbName={studentKb}
          onSelect={loadConversation}
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
          onSelect={loadConversation}
          onNew={handleNewConversation}
          onDelete={handleDeleteConversation}
          onRename={handleRenameConversation}
          onLoadMore={handleLoadMore}
          isFetchingMore={isFetchingNextPage}
        />
      )}

      {/* 右侧聊天区 */}
      <div className="flex-1 flex flex-col glass-card rounded-2xl overflow-hidden">
        {/* 顶部信息栏 */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-[#F0EDE8] shrink-0">
          <h1 className="text-base font-semibold text-gray-900">
            {activeConv ? activeConv.title : "问答对话"}
          </h1>
          {chatKb && (
            <span className="text-xs text-gray-400 bg-[#F7F5F1] px-2 py-0.5 rounded-md">
              {chatKb}
            </span>
          )}
          {messages.length > 0 && (
            <button
              onClick={() => {
                setMessages([]);
                setActiveConvId(null);
              }}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50"
            >
              <Plus size={12} />
              新对话
            </button>
          )}
        </div>

        {/* 消息区 */}
        <div
          className="flex-1 overflow-y-auto py-5"
          style={{ contain: "paint", transform: "translateZ(0)" }}
        >
          <div className="max-w-2xl mx-auto w-full px-4 space-y-4 h-full flex flex-col">
            {isLoadingHistory ? (
              <ConversationSkeleton />
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center flex-1 gap-4 animate-apple-settle">
                {isStudent && !studentKb ? (
                  // 学生：尚未分配知识库
                  <div className="flex flex-col items-center gap-3 text-center">
                    <div className="animate-idle-breath">
                      <AgentAvatar isStudent={true} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-gray-800">
                        暂无可用知识库
                      </p>
                      <p className="text-xs text-gray-400">
                        请联系管理员为学生分配知识库后再使用
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="animate-idle-breath scale-150 mb-4">
                      <AgentAvatar isStudent={isStudent} />
                    </div>
                    <div className="text-center space-y-1">
                      <p className="text-sm font-semibold text-gray-800">
                        开始提问
                      </p>
                      <p className="text-xs text-gray-400">
                        {!chatKb
                          ? "请先在知识库页面配置知识库，然后新建对话"
                          : "在下方输入框中输入问题，按回车发送"}
                      </p>
                    </div>
                    {chatKb && faqs && faqs.length > 0 && (
                      <div className="flex flex-wrap justify-center gap-2 mt-1 max-w-lg">
                        {faqs.map((faq) => (
                          <button
                            key={faq.id}
                            onClick={() => sendMessage(faq.question)}
                            className={`text-xs px-3 py-1.5 rounded-full border bg-white text-gray-600 transition-colors text-left ${isStudent ? "border-[#D9DEE5] hover:bg-[#EEF2FF] hover:text-[#2563EB]" : "border-[#F0EDE8] hover:bg-[#F2EFE9] hover:text-[#334155]"}`}
                          >
                            {faq.question}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <>
                {messages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    msg={msg}
                    onFeedback={handleFeedback}
                    onSuggestionClick={sendMessage}
                    onAskTutor={isStudent ? setHelpMsg : undefined}
                    isStudent={isStudent}
                  />
                ))}
                {isStreaming && <ThinkingProcess steps={thinkingSteps} />}
              </>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* 输入区 */}
        <div className="shrink-0 px-4 pb-4 pt-2">
          <div className="relative glass-card rounded-2xl px-4 pt-3 pb-3 flex flex-col gap-2 max-w-2xl mx-auto w-full">
            <textarea
              ref={textareaRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
              onKeyDown={handleKeyDown}
              disabled={isStreaming || !effectiveKb}
              placeholder={
                isStudent && !studentKb
                  ? "等待管理员分配知识库..."
                  : effectiveKb
                    ? "有问题，尽管问"
                    : "请先在知识库页面配置知识库，然后新建对话"
              }
              rows={1}
              className="w-full resize-none outline-none text-sm text-gray-800 placeholder:text-gray-400 bg-transparent overflow-y-auto disabled:text-gray-400"
              style={{ minHeight: "1.5rem", maxHeight: "10rem" }}
            />
            <div className="flex items-center justify-end">
              <button
                onClick={() => sendMessage(undefined)}
                disabled={!query.trim() || !effectiveKb || isStreaming}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors text-white disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed disabled:hover:bg-gray-200 ${isStudent ? "bg-[#2563EB] hover:bg-[#1D4ED8]" : "bg-gray-900 hover:bg-gray-700"}`}
              >
                {isStreaming ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <ArrowUp size={15} />
                )}
              </button>
            </div>
          </div>
        </div>

        {helpMsg && activeConvId && (
          <TutorHelpModal
            msg={helpMsg}
            convId={activeConvId}
            onClose={() => setHelpMsg(null)}
            onSuccess={(msg) => {
              setHelpMsg(null);
              setToast({ msg, type: "success" });
            }}
          />
        )}

        {toast && (
          <Toast
            message={toast.msg}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
      </div>
    </div>
  );
}
