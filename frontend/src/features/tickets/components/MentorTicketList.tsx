import { useState } from 'react';
import { useTicketList } from '../hooks/useTicketList';
import { TicketDetailModal } from './TicketDetailModal';
import type { QARequestInfo } from '@shared/types/api';

interface Props {
  /** If provided, only show tickets from this student. */
  studentId?: number;
}

const TABS: { key: QARequestInfo['status']; label: string }[] = [
  { key: 'pending', label: '待回复' },
  { key: 'replied', label: '已回复' },
  { key: 'closed', label: '已结束' },
];

export function MentorTicketList({ studentId }: Props) {
  const [activeTab, setActiveTab] = useState<QARequestInfo['status']>('pending');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<QARequestInfo | null>(null);

  const { tickets, totalPages, isLoading } = useTicketList('mine', page, studentId);
  const filtered = tickets.filter((t) => t.status === activeTab);

  return (
    <div className="glass-card rounded-2xl flex flex-col flex-1 min-h-0">
      <div className="px-6 py-5 border-b border-white/40">
        <h2 className="text-base font-semibold text-[#1F2937]">
          {studentId ? '该学生的答疑请求' : '答疑请求'}
        </h2>
        <div className="mt-3 flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setActiveTab(t.key);
                setPage(1);
              }}
              className={`px-3 py-1.5 text-xs rounded-lg transition ${
                activeTab === t.key
                  ? 'bg-[#0F766E] text-white shadow-sm'
                  : 'text-[#6F7A75] hover:bg-white/60'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3">
        {isLoading ? (
          <div className="text-sm text-[#6F7A75] px-2 py-4">加载中...</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-[#9CA3AF] px-2 py-4">暂无工单</div>
        ) : (
          <ul className="flex flex-col gap-2">
            {filtered.map((t) => (
              <li
                key={t.id}
                onClick={() => setSelected(t)}
                className="px-3 py-2.5 rounded-xl hover:bg-white/60 cursor-pointer transition"
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold text-[#1F2937] truncate flex-1">
                    {t.question.slice(0, 80)}
                  </span>
                  <span className="text-[10px] text-[#9CA3AF] shrink-0">
                    {new Date(t.created_at).toLocaleString('zh-CN')}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {totalPages > 1 && (
        <div className="px-6 py-3 border-t border-white/40 flex items-center justify-between text-xs text-[#6F7A75]">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="disabled:opacity-40"
          >
            &larr; 上一页
          </button>
          <span>
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="disabled:opacity-40"
          >
            下一页 &rarr;
          </button>
        </div>
      )}

      {selected && <TicketDetailModal ticket={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
