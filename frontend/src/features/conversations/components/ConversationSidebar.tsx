import { Plus, BookOpen, ShieldAlert } from 'lucide-react';
import { ConversationList } from './ConversationItem';
import type { ConversationInfo } from '@shared/types/api';

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
              <p className="text-sm font-semibold text-emerald-900 truncate">{adminKbName}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-50 rounded-xl mb-2">
            <ShieldAlert size={14} className="text-amber-500 shrink-0" />
            <p className="text-xs text-amber-700">请在知识库页面选择管理端知识库</p>
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
        emptyText={adminKbName ? '暂无对话记录' : '等待知识库配置'}
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
              <p className="text-sm font-semibold text-[#312E81] truncate">{activeKbName}</p>
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
      <ConversationList
        conversations={conversations}
        activeId={activeId}
        theme="student"
        emptyText={activeKbName ? '暂无对话记录' : '等待知识库分配'}
        onSelect={onSelect}
        onRename={onRename}
        onDelete={onDelete}
        onLoadMore={onLoadMore}
        isFetchingMore={isFetchingMore}
      />
    </div>
  );
}
