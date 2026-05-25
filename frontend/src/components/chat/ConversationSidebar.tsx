import { useState, useRef, useEffect } from "react";
import {
  Plus,
  Loader2,
  Pencil,
  Check,
  X as XIcon,
  Trash2,
  BookOpen,
  ShieldAlert,
} from "lucide-react";
import type { ConversationInfo } from "@/types/api";

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

// ── 共享对话列表（DRY：admin 和 student 共用） ────────────

function ConversationList({
  conversations,
  activeId,
  theme,
  emptyText,
  onSelect,
  onRename,
  onDelete,
  onLoadMore,
  isFetchingMore,
}: {
  conversations: ConversationInfo[];
  activeId: number | null;
  theme: "admin" | "student";
  emptyText: string;
  onSelect: (id: number) => void;
  onRename: (id: number, title: string) => void;
  onDelete: (id: number) => void;
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
    <div ref={listRef} className="flex-1 overflow-y-auto p-2 space-y-3">
      {conversations.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-8">{emptyText}</p>
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
                      theme={theme}
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
  );
}

// ── 管理端侧边栏（展示预设知识库，无下拉选择）─────────────

export function AdminConversationSidebar({
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
      <ConversationList
        conversations={conversations}
        activeId={activeId}
        theme="admin"
        emptyText={adminKbName ? "暂无对话记录" : "等待知识库配置"}
        onSelect={onSelect}
        onRename={onRename}
        onDelete={onDelete}
        onLoadMore={onLoadMore}
        isFetchingMore={isFetchingMore}
      />
    </div>
  );
}

// ── 学生端侧边栏（无知识库选择，仅展示分配信息）───────────

export function StudentConversationSidebar({
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
      <ConversationList
        conversations={conversations}
        activeId={activeId}
        theme="student"
        emptyText={activeKbName ? "暂无对话记录" : "等待知识库分配"}
        onSelect={onSelect}
        onRename={onRename}
        onDelete={onDelete}
        onLoadMore={onLoadMore}
        isFetchingMore={isFetchingMore}
      />
    </div>
  );
}
