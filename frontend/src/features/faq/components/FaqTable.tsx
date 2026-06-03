import { useState } from 'react';
import {
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  CheckCircle2,
  Clock,
  User,
  MessageSquareQuote,
} from 'lucide-react';
import type { FAQItem, FAQSearchItem, FAQUpdate } from '@shared/types/api';
import { useAuthUser, useIsAdmin } from '@shared/store/authStore';

// ── Status badge ───────────────────────────────────────────

function StatusBadge({ status }: { status: FAQItem['status'] }) {
  const map: Record<string, { label: string; color: string }> = {
    draft: { label: '草稿', color: 'bg-slate-100 text-slate-500' },
    pending: { label: '待审核', color: 'bg-amber-100 text-amber-600' },
    approved: { label: '已发布', color: 'bg-emerald-100 text-emerald-600' },
    rejected: { label: '已驳回', color: 'bg-red-100 text-red-600' },
  };
  const config = map[status] ?? map.pending;
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${config.color}`}>
      {config.label}
    </span>
  );
}

// ── Single FAQ row card ────────────────────────────────────

interface FaqCardProps {
  faq: FAQItem;
  score?: number | null;
  searchMode?: boolean;
  onEdit: (faq: FAQItem) => void;
  onDelete: (faq: FAQItem) => void;
  onUpdate: (id: number, payload: FAQUpdate) => void;
}

function FaqCard({ faq, score, searchMode, onEdit, onDelete, onUpdate }: FaqCardProps) {
  const [expanded, setExpanded] = useState(false);
  const user = useAuthUser();
  const isAdmin = useIsAdmin();
  const isOwner = faq.author_id === user?.id;
  const canManage = isAdmin || isOwner;

  return (
    <div
      className={`rounded-xl border border-[#F0EDE8] bg-white transition-colors overflow-hidden ${
        faq.enabled ? '' : 'opacity-50'
      }`}
    >
      <div
        className="flex items-center gap-3 px-4 py-3 hover:bg-[#F8F6F2] cursor-pointer transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <StatusBadge status={faq.status} />
        <p className="text-sm text-[#334155] font-medium truncate flex-1 min-w-0">{faq.question}</p>
        {faq.category && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#F2EFE9] text-[#8A8A8A] shrink-0">
            {faq.category}
          </span>
        )}
        {searchMode && score != null && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-600 font-medium shrink-0">
            {Math.round(score * 100)}%
          </span>
        )}
        {searchMode && score == null && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#F2EFE9] text-[#8A8A8A] font-medium shrink-0">
            关键词
          </span>
        )}
        <span className="text-xs w-20 text-right shrink-0 text-[#8A8A8A]">
          {new Date(faq.updated_at).toLocaleDateString()}
        </span>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {isAdmin && faq.status === 'pending' && (
            <button
              onClick={() => onUpdate(faq.id, { status: 'approved' })}
              title="通过审核"
              className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 transition-colors"
            >
              <CheckCircle2 size={15} />
            </button>
          )}
          {canManage && (
            <>
              <button
                onClick={() => onUpdate(faq.id, { enabled: !faq.enabled })}
                title={faq.enabled ? '禁用' : '启用'}
                className="p-1.5 rounded-lg hover:bg-[#F2EFE9] transition-colors"
              >
                {faq.enabled ? (
                  <ToggleRight size={16} className="text-emerald-500" />
                ) : (
                  <ToggleLeft size={16} className="text-gray-400" />
                )}
              </button>
              <button
                onClick={() => onEdit(faq)}
                title="编辑"
                className="p-1.5 rounded-lg text-gray-400 hover:text-[#334155] hover:bg-[#F2EFE9] transition-colors"
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={() => onDelete(faq)}
                title="删除"
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
        <ChevronDown
          size={15}
          className={`text-[#C0BDB8] transition-transform duration-300 shrink-0 ${expanded ? 'rotate-180' : ''}`}
        />
      </div>
      <div
        className={`transition-all duration-300 overflow-hidden ${expanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div className="px-4 pb-3">
          <div className="p-4 bg-[#F8F6F2] rounded-xl text-sm text-[#4A4A4A] leading-relaxed whitespace-pre-wrap">
            {faq.answer}
          </div>
          <div className="mt-2 flex items-center gap-4 text-[10px] text-[#A0A0A0]">
            <span className="flex items-center gap-1">
              <Clock size={10} /> 更新于 {new Date(faq.updated_at).toLocaleDateString()}
            </span>
            {faq.author_id && (
              <span className="flex items-center gap-1">
                <User size={10} /> 提报者 ID: {faq.author_id}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── FaqTable ───────────────────────────────────────────────

interface FaqTableProps {
  faqs: FAQItem[];
  searchMode?: boolean;
  onEdit: (faq: FAQItem) => void;
  onDelete: (faq: FAQItem) => void;
  onUpdate: (id: number, payload: FAQUpdate) => void;
}

/** Renders the list of FAQ cards with edit / delete / toggle actions. */
export function FaqTable({ faqs, searchMode, onEdit, onDelete, onUpdate }: FaqTableProps) {
  if (faqs.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {faqs.map((faq, i) => (
        <div
          key={faq.id}
          style={{
            animation: `appleFadeUp 0.55s cubic-bezier(0.25, 1, 0.5, 1) ${Math.min(160 + i * 45, 600)}ms both`,
          }}
        >
          <FaqCard
            faq={faq}
            score={'score' in faq ? (faq as FAQSearchItem).score : undefined}
            searchMode={searchMode}
            onEdit={onEdit}
            onDelete={onDelete}
            onUpdate={onUpdate}
          />
        </div>
      ))}
    </div>
  );
}

// ── Empty states ───────────────────────────────────────────

export function FaqEmptyNoKb() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <div className="w-12 h-12 rounded-2xl bg-[#F2EFE9] flex items-center justify-center">
        <MessageSquareQuote size={22} className="text-[#334155]" strokeWidth={1.6} />
      </div>
      <p className="text-sm font-semibold text-gray-800">请先选择知识库</p>
      <p className="text-xs text-[#8A8A8A]">从上方下拉菜单选择要管理的知识库</p>
    </div>
  );
}

export function FaqEmptyList() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <div className="w-12 h-12 rounded-2xl bg-[#F2EFE9] flex items-center justify-center">
        <MessageSquareQuote size={22} className="text-[#334155]" strokeWidth={1.6} />
      </div>
      <p className="text-sm font-semibold text-gray-800">暂无 FAQ</p>
      <p className="text-xs text-[#8A8A8A]">点击「新增 FAQ」或通过 Excel 批量导入</p>
    </div>
  );
}
