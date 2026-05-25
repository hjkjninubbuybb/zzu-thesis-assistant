import { useState, useRef, useEffect, useCallback, memo, useMemo } from "react";
import {
  useQuery,
  useQueryClient,
  useInfiniteQuery,
} from "@tanstack/react-query";
import {
  ArrowUp,
  Loader2,
  Trash2,
  AlertCircle,
  Plus,
  ThumbsUp,
  ThumbsDown,
  BookOpen,
  ShieldAlert,
  Pencil,
  Check,
  X as XIcon,
  HelpCircle,
} from "lucide-react";
import { knowledgeApi, faqApi, conversationApi, ticketApi } from "@/lib/api";

import { useAuth } from "@/hooks/useAuth";
import { Toast } from "@/components/ui/Toast";
import { buildHistory, streamChat } from "@/lib/streamChat";
import { AgentAvatar } from "@/components/chat/AgentAvatar";
import { FileCard } from "@/components/chat/FileCard";
import { SourcesPanel } from "@/components/chat/SourcesPanel";
import { AcademicMarkdown } from "@/components/chat/AcademicMarkdown";
import type {
  ChatMessage,
  FileItem,
  SourceItem,
  ConversationInfo,
} from "@/types/api";

// ── 反馈按钮 ──────────────────────────────────────────────

function MessageActions({
  dbMessageId,
  feedback,
  onFeedback,
  onAskTutor,
}: {
  dbMessageId?: number;
  feedback?: "up" | "down" | null;
  onFeedback: (rating: "up" | "down") => void;
  onAskTutor?: () => void;
}) {
  if (!dbMessageId) return null;
  return (
    <div className="flex items-center gap-1 mt-2">
      <button
        onClick={() => onFeedback("up")}
        className={`p-1 rounded-md transition-colors ${
          feedback === "up"
            ? "text-green-600 bg-green-50"
            : "text-gray-300 hover:text-gray-500 hover:bg-gray-50"
        }`}
        title="有帮助"
      >
        <ThumbsUp size={13} />
      </button>
      <button
        onClick={() => onFeedback("down")}
        className={`p-1 rounded-md transition-colors ${
          feedback === "down"
            ? "text-red-500 bg-red-50"
            : "text-gray-300 hover:text-gray-500 hover:bg-gray-50"
        }`}
        title="没帮助"
      >
        <ThumbsDown size={13} />
      </button>

      {onAskTutor && (
        <button
          onClick={onAskTutor}
          className="flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded-md text-[10px] text-blue-600 bg-blue-50/50 hover:bg-blue-50 hover:text-blue-700 transition-colors border border-blue-100/50 hover:border-blue-200"
          title="求助导师"
        >
          <HelpCircle size={12} />
          <span className="font-medium">求助导师</span>
        </button>
      )}
    </div>
  );
}

// ── 消息气泡 ──────────────────────────────────────────────

const MessageBubble = memo(function MessageBubble({
  msg,
  onFeedback,
  onSuggestionClick,
  onAskTutor,
  isStudent,
}: {
  msg: ChatMessage;
  onFeedback: (msgId: number, rating: "up" | "down") => void;
  onSuggestionClick?: (text: string) => void;
  onAskTutor?: (msg: ChatMessage) => void;
  isStudent?: boolean;
}) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end mb-6">
        <div
          className={`max-w-[85%] text-white text-sm px-4 py-2.5 rounded-2xl rounded-tr-sm shadow-sm ${isStudent ? "bg-[#2563EB]" : "bg-[#334155]"} ${msg.isNew ? "animate-apple-slide-r" : ""}`}
        >
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col gap-3 mb-10 ${msg.isNew ? "animate-apple-fade-up" : ""}`}
    >
      {/* AI 内容区 - 使用专属头像 */}
      <div className="flex gap-4">
        <AgentAvatar isStudent={!!isStudent} />
        <div className="flex-1 min-w-0 pt-1">
          {msg.status === "loading" ? (
            msg.content ? (
              <div className="relative">
                <AcademicMarkdown content={msg.content} sources={msg.sources} />
                <span className="cursor-blink" />
              </div>
            ) : (
              <div className="flex items-center gap-2 text-gray-400 text-sm">
                <Loader2 size={14} className="animate-spin" />
                <span className="text-shimmer">正在思考...</span>
              </div>
            )
          ) : msg.status === "error" ? (
            <div className="flex items-center gap-2 text-red-500 bg-red-50 px-4 py-3 rounded-xl text-sm border border-red-100 shadow-sm">
              <AlertCircle size={15} />
              <span>{msg.content}</span>
            </div>
          ) : (
            <div className="space-y-4">
              <AcademicMarkdown content={msg.content} sources={msg.sources} />

              {msg.files && msg.files.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md animate-apple-fade-up">
                  {msg.files.map((f, i) => (
                    <FileCard key={i} file={f} />
                  ))}
                </div>
              )}

              {msg.sources && msg.sources.length > 0 && (
                <SourcesPanel sources={msg.sources} />
              )}

              <div className="flex items-center justify-between mt-4">
                <MessageActions
                  dbMessageId={msg.dbMessageId}
                  feedback={msg.feedback}
                  onFeedback={(rating) =>
                    msg.dbMessageId && onFeedback(msg.dbMessageId, rating)
                  }
                  onAskTutor={() => onAskTutor?.(msg)}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {msg.status === "done" &&
        msg.suggestions &&
        msg.suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2 pl-12">
            {msg.suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => onSuggestionClick?.(s)}
                style={{ animationDelay: `${i * 60}ms` }}
                className={`animate-apple-fade-up text-xs px-3.5 py-1.5 rounded-full border border-gray-100 bg-white/50 text-gray-600 hover:bg-white hover:text-[#334155] hover:border-gray-200 transition-all shadow-sm active:scale-[0.97] ${isStudent ? "hover:text-[#2563EB] hover:border-[#D9DEE5]" : ""}`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
    </div>
  );
});

// ── 对话列表分组 ─────────────────────────────────────────

function groupByDate(conversations: ConversationInfo[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const groups: { label: string; items: ConversationInfo[] }[] = [
    { label: "今天", items: [] },
    { label: "昨天", items: [] },
    { label: "最近7天", items: [] },
    { label: "更早", items: [] },
  ];

  for (const conv of conversations) {
    const d = new Date(conv.updated_at);
    if (d >= today) groups[0].items.push(conv);
    else if (d >= yesterday) groups[1].items.push(conv);
    else if (d >= weekAgo) groups[2].items.push(conv);
    else groups[3].items.push(conv);
  }

  return groups.filter((g) => g.items.length > 0);
}

// ── 对话侧栏条目（支持重命名） ────────────────────────────

function ConversationItem({
  conv,
  active,
  theme,
  onSelect,
  onRename,
  onDelete,
}: {
  conv: ConversationInfo;
  active: boolean;
  theme: "admin" | "student";
  onSelect: (id: number) => void;
  onRename: (id: number, title: string) => void;
  onDelete: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conv.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  // 外部标题更新（如 LLM 总结完成）时，同步 draft
  useEffect(() => {
    if (!editing) setDraft(conv.title);
  }, [conv.title, editing]);

  const commit = () => {
    const t = draft.trim();
    if (t && t !== conv.title) onRename(conv.id, t);
    setEditing(false);
  };
  const cancel = () => {
    setDraft(conv.title);
    setEditing(false);
  };

  const activeBorder =
    theme === "admin" ? "border-[#E8E4DC]" : "border-[#D9DEE5]";

  if (editing) {
    return (
      <div
        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white shadow-sm border ${activeBorder}`}
      >
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            else if (e.key === "Escape") cancel();
          }}
          maxLength={50}
          className="flex-1 min-w-0 text-sm bg-transparent outline-none text-gray-900"
        />
        <button
          onClick={commit}
          title="保存"
          className="p-1 rounded text-emerald-500 hover:bg-emerald-50 transition-colors"
        >
          <Check size={13} />
        </button>
        <button
          onClick={cancel}
          title="取消"
          className="p-1 rounded text-gray-400 hover:bg-gray-100 transition-colors"
        >
          <XIcon size={13} />
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={() => onSelect(conv.id)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors text-sm ${
        active
          ? `bg-white shadow-sm border ${activeBorder} text-gray-900`
          : "text-gray-600 hover:bg-white/70"
      }`}
    >
      <span className="flex-1 truncate">{conv.title}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        title="重命名"
        className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-400 hover:text-[#334155] transition-all"
      >
        <Pencil size={11} />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(conv.id);
        }}
        title="删除"
        className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-400 hover:text-red-500 transition-all"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

// ── 管理端侧边栏（展示预设知识库，无下拉选择）─────────────

function AdminConversationSidebar({
  conversations,
  activeId,
  adminKbName,
  onSelect,
  onNew,
  onDelete,
  onRename,
  onLoadMore,
  isFetchingMore,
}: {
  conversations: ConversationInfo[];
  activeId: number | null;
  adminKbName: string | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  onDelete: (id: number) => void;
  onRename: (id: number, title: string) => void;
  onLoadMore: () => void;
  isFetchingMore: boolean;
}) {
  const groups = groupByDate(conversations);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const handleScroll = () => {
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
        onLoadMore();
      }
    };
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, [onLoadMore]);

  return (
    <div className="w-64 shrink-0 flex flex-col glass-card rounded-2xl overflow-hidden">
      <div className="p-3 border-b border-[#F0EDE8]">
        {adminKbName ? (
          <div className="flex items-center gap-2.5 px-3 py-2.5 bg-emerald-50 rounded-xl mb-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
              <BookOpen size={14} className="text-emerald-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-medium text-emerald-700 leading-none mb-0.5">
                当前知识库
              </p>
              <p className="text-sm font-semibold text-emerald-900 truncate">
                {adminKbName}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-50 rounded-xl mb-2">
            <ShieldAlert size={14} className="text-amber-500 shrink-0" />
            <p className="text-xs text-amber-700">
              请在知识库页面选择管理端知识库
            </p>
          </div>
        )}
        <button
          onClick={onNew}
          disabled={!adminKbName}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors bg-slate-700 hover:bg-slate-800"
        >
          <Plus size={15} />
          新建对话
        </button>
      </div>
      <div ref={listRef} className="flex-1 overflow-y-auto p-2 space-y-3">
        {conversations.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-8">
            {adminKbName ? "暂无对话记录" : "等待知识库配置"}
          </p>
        )}
        {(() => {
          let idx = 0;
          return groups.map((group) => (
            <div key={group.label}>
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider px-2 mb-1">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((conv) => {
                  const delay = Math.min(idx++ * 35, 280);
                  return (
                    <div
                      key={conv.id}
                      className="animate-apple-fade-up"
                      style={{ animationDelay: `${delay}ms` }}
                    >
                      <ConversationItem
                        conv={conv}
                        active={conv.id === activeId}
                        theme="admin"
                        onSelect={onSelect}
                        onRename={onRename}
                        onDelete={onDelete}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ));
        })()}
        {isFetchingMore && (
          <div className="flex justify-center py-2">
            <Loader2 size={14} className="animate-spin text-gray-300" />
          </div>
        )}
      </div>
    </div>
  );
}

// ── 学生端侧边栏（无知识库选择，仅展示分配信息）───────────

function StudentConversationSidebar({
  conversations,
  activeId,
  activeKbName,
  onSelect,
  onNew,
  onDelete,
  onRename,
  onLoadMore,
  isFetchingMore,
}: {
  conversations: ConversationInfo[];
  activeId: number | null;
  activeKbName: string | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  onDelete: (id: number) => void;
  onRename: (id: number, title: string) => void;
  onLoadMore: () => void;
  isFetchingMore: boolean;
}) {
  const groups = groupByDate(conversations);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const handleScroll = () => {
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
        onLoadMore();
      }
    };
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, [onLoadMore]);

  return (
    <div className="w-64 shrink-0 flex flex-col glass-card rounded-2xl overflow-hidden">
      {/* 知识库信息卡 */}
      <div className="p-3 border-b border-[#EEF2FF]">
        {activeKbName ? (
          <div className="flex items-center gap-2.5 px-3 py-2.5 bg-[#EEF2FF] rounded-xl">
            <div className="w-7 h-7 rounded-lg bg-[#4F46E5]/10 flex items-center justify-center shrink-0">
              <BookOpen size={14} className="text-[#4F46E5]" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-medium text-[#4338CA] leading-none mb-0.5">
                当前知识库
              </p>
              <p className="text-sm font-semibold text-[#312E81] truncate">
                {activeKbName}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-50 rounded-xl">
            <ShieldAlert size={14} className="text-amber-500 shrink-0" />
            <p className="text-xs text-amber-700">管理员尚未分配知识库</p>
          </div>
        )}
        <button
          onClick={onNew}
          disabled={!activeKbName}
          className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors bg-[#2563EB] hover:bg-[#1D4ED8]"
        >
          <Plus size={15} />
          新建对话
        </button>
      </div>

      {/* 对话列表 */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-2 space-y-3">
        {conversations.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-8">
            {activeKbName ? "暂无对话记录" : "等待知识库分配"}
          </p>
        )}
        {(() => {
          let idx = 0;
          return groups.map((group) => (
            <div key={group.label}>
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider px-2 mb-1">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((conv) => {
                  const delay = Math.min(idx++ * 35, 280);
                  return (
                    <div
                      key={conv.id}
                      className="animate-apple-fade-up"
                      style={{ animationDelay: `${delay}ms` }}
                    >
                      <ConversationItem
                        conv={conv}
                        active={conv.id === activeId}
                        theme="student"
                        onSelect={onSelect}
                        onRename={onRename}
                        onDelete={onDelete}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ));
        })()}
        {isFetchingMore && (
          <div className="flex justify-center py-2">
            <Loader2 size={14} className="animate-spin text-gray-300" />
          </div>
        )}
      </div>
    </div>
  );
}

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

interface ThinkingStep {
  id: string;
  label: string;
  status: "pending" | "active" | "done";
  input?: string;
}

function ThinkingProcess({ steps }: { steps: ThinkingStep[] }) {
  if (steps.length === 0) return null;
  return (
    <div className="flex flex-col gap-2.5 mb-6 pl-12 animate-apple-fade-up">
      <div className="flex items-center gap-2 text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">
        <Loader2 size={12} className="animate-spin" />
        Agent 思考过程
      </div>
      <div className="space-y-2">
        {steps.map((step) => (
          <div key={step.id} className="flex items-center gap-3">
            <div
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                step.status === "active"
                  ? "bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                  : step.status === "done"
                    ? "bg-emerald-500"
                    : "bg-gray-200"
              }`}
            />
            <div className="flex flex-col min-w-0">
              <span
                className={`text-xs font-medium truncate ${
                  step.status === "pending" ? "text-gray-300" : "text-gray-600"
                }`}
              >
                {step.label}
              </span>
              {step.input && step.status !== "pending" && (
                <span className="text-[10px] text-gray-400 truncate italic">
                  "{step.input}"
                </span>
              )}
            </div>
            {step.status === "done" && (
              <Check size={10} className="text-emerald-500 shrink-0" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ConversationSkeleton() {
  return (
    <div className="flex-1 overflow-hidden p-6 space-y-8 animate-pulse">
      <div className="flex gap-4">
        <div className="w-8 h-8 rounded-xl bg-gray-100 shrink-0" />
        <div className="flex-1 space-y-3 pt-1">
          <div className="h-4 bg-gray-100 rounded-md w-3/4" />
          <div className="h-4 bg-gray-100 rounded-md w-1/2" />
        </div>
      </div>
      <div className="flex justify-end">
        <div className="h-10 bg-gray-100 rounded-2xl w-2/3" />
      </div>
      <div className="flex gap-4">
        <div className="w-8 h-8 rounded-xl bg-gray-100 shrink-0" />
        <div className="flex-1 space-y-3 pt-1">
          <div className="h-4 bg-gray-100 rounded-md w-full" />
          <div className="h-4 bg-gray-100 rounded-md w-5/6" />
          <div className="h-4 bg-gray-100 rounded-md w-4/6" />
        </div>
      </div>
    </div>
  );
}

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

// ── 导师求助弹窗 ──────────────────────────────────────────

function TutorHelpModal({
  msg,
  convId,
  onClose,
  onSuccess,
}: {
  msg: ChatMessage;
  convId: number;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!question.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await ticketApi.create({
        conversation_id: convId,
        message_id: msg.dbMessageId!,
        question: question.trim(),
      });
      onSuccess("请求已发送给导师");
    } catch (err: any) {
      const msg = err.response?.data?.detail || "发送失败，请稍后重试";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm animate-apple-fade">
      <div className="glass-card rounded-2xl w-full max-w-md mx-4 overflow-hidden animate-apple-pop shadow-2xl border border-white/20">
        <div className="px-6 py-4 border-b border-[#F0EDE8] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
              <HelpCircle size={16} />
            </div>
            <h3 className="text-sm font-semibold text-slate-700">求助导师</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XIcon size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              AI 的回答（参考）
            </label>
            <div className="bg-gray-50 rounded-xl px-4 py-3 text-xs text-gray-500 line-clamp-3 border border-gray-100 italic leading-relaxed">
              {msg.content}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              描述您的问题 <span className="text-red-400">*</span>
            </label>
            <textarea
              autoFocus
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="请详细描述 AI 回答中不足的地方，或您进一步的问题..."
              rows={4}
              className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none shadow-inner"
            />
          </div>
          {error && (
            <p className="text-xs text-red-500 animate-shake">{error}</p>
          )}
        </div>

        <div className="px-6 py-4 bg-gray-50/50 border-t border-[#F0EDE8] flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !question.trim()}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all shadow-md active:scale-[0.98]"
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <HelpCircle size={14} />
            )}
            发送求助
          </button>
        </div>
      </div>
    </div>
  );
}
