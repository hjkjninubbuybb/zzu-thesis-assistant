import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Ticket,
  MessageSquare,
  Clock,
  CheckCircle2,
  ChevronRight,
  Send,
  User,
  Calendar,
  ExternalLink,
  Plus,
} from 'lucide-react';
import { ticketService } from '../services/ticketService';
import { ticketKeys } from '../hooks/queryKeys';
import type { QARequestInfo } from '@shared/types/api';
import { useIsAdmin, useIsTeacher } from '@shared/store/authStore';
import { TicketToFaqModal } from './TicketToFaqModal';

// ── 状态标签 ──────────────────────────────────────────────

function StatusBadge({ status }: { status: QARequestInfo['status'] }) {
  const map = {
    pending: {
      label: '待处理',
      icon: Clock,
      class: 'bg-amber-50 text-amber-600 border-amber-100',
    },
    replied: {
      label: '已回复',
      icon: CheckCircle2,
      class: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    },
    closed: {
      label: '已关闭',
      icon: CheckCircle2,
      class: 'bg-slate-50 text-slate-500 border-slate-100',
    },
  };
  const config = map[status];
  const Icon = config.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${config.class}`}
    >
      <Icon size={10} />
      {config.label}
    </span>
  );
}

// ── 详情/回复弹窗 ──────────────────────────────────────────

export function TicketReplyModal({
  ticket,
  onClose,
}: {
  ticket: QARequestInfo;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isTeacher = useIsTeacher();
  const isAdmin = useIsAdmin();
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showFaqModal, setShowFaqModal] = useState(false);

  const replyMut = useMutation({
    mutationFn: () => ticketService.reply(ticket.id, reply),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ticketKeys.all() });
      onClose();
    },
    onError: (err: unknown) => setError(ticketService.extractError(err)),
  });

  const closeMut = useMutation({
    mutationFn: () => ticketService.close(ticket.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ticketKeys.all() });
      onClose();
    },
  });

  const canAct = isTeacher || isAdmin;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-apple-fade">
        <div className="glass-card rounded-2xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh] animate-apple-pop overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-[#F0EDE8] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
                <Ticket size={16} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-[#334155]">答疑详情</h2>
                <p className="text-[10px] text-[#9A9A9A]">ID: #{ticket.id}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-[#9A9A9A] hover:text-[#334155]">
              <ChevronRight size={18} className="rotate-90" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[11px] text-[#9A9A9A] font-medium uppercase tracking-wider">
                <User size={12} /> 学生提出的问题
              </div>
              <div className="bg-[#F8F6F2] rounded-2xl p-4 text-sm text-[#334155] leading-relaxed border border-[#E8E4DC]">
                {ticket.question}
              </div>
              <div className="flex items-center justify-between text-[10px] text-[#9A9A9A]">
                <div className="flex items-center gap-1">
                  <Calendar size={10} /> {new Date(ticket.created_at).toLocaleString()}
                </div>
                <a
                  href={`/admin/conversations?id=${ticket.conversation_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 hover:text-slate-700 transition"
                >
                  查看完整对话 <ExternalLink size={10} />
                </a>
              </div>
            </div>

            {(ticket.answer || ticket.status === 'replied') && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[11px] text-emerald-600 font-medium uppercase tracking-wider">
                  <MessageSquare size={12} /> 导师的回复
                </div>
                <div className="bg-emerald-50/50 rounded-2xl p-4 text-sm text-[#334155] leading-relaxed border border-emerald-100">
                  {ticket.answer || <span className="text-gray-400 italic">尚未回复</span>}
                </div>
                {ticket.replied_at && (
                  <div className="text-[10px] text-[#9A9A9A] flex items-center gap-1">
                    <Clock size={10} /> 回复时间: {new Date(ticket.replied_at).toLocaleString()}
                  </div>
                )}
              </div>
            )}

            {ticket.status === 'pending' && canAct && (
              <div className="space-y-3 pt-2">
                <div className="h-px bg-[#F0EDE8]" />
                <label className="block text-[11px] text-slate-600 font-medium uppercase tracking-wider">
                  撰写回复
                </label>
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="输入您的人工回复内容..."
                  rows={4}
                  className="w-full bg-white border border-[#E8E5E0] rounded-xl px-3 py-2 text-sm outline-none focus:border-slate-400 transition resize-none"
                />
                {error && <p className="text-[10px] text-red-500">{error}</p>}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-[#FAFAF9] border-t border-[#F0EDE8] flex items-center justify-between shrink-0">
            <StatusBadge status={ticket.status} />
            <div className="flex gap-2">
              {ticket.status !== 'pending' && canAct && (
                <button
                  onClick={() => setShowFaqModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 border border-blue-100 text-blue-600 text-sm rounded-xl hover:bg-blue-50 transition"
                >
                  <Plus size={14} /> 设为 FAQ
                </button>
              )}
              <button onClick={onClose} className="px-4 py-2 text-sm text-[#6A6A6A]">
                取消
              </button>
              {ticket.status === 'pending' && canAct && (
                <button
                  onClick={() => replyMut.mutate()}
                  disabled={replyMut.isPending || !reply.trim()}
                  className="flex items-center gap-2 px-5 py-2 bg-slate-700 text-white text-sm rounded-xl hover:bg-slate-800 disabled:opacity-50 transition"
                >
                  <Send size={14} /> {replyMut.isPending ? '提交中...' : '提交回复'}
                </button>
              )}
              {ticket.status === 'replied' && (
                <button
                  onClick={() => closeMut.mutate()}
                  disabled={closeMut.isPending}
                  className="px-5 py-2 border border-[#E8E5E0] text-[#334155] text-sm rounded-xl hover:bg-[#F2EFE9] transition"
                >
                  关闭请求
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {showFaqModal && (
        <TicketToFaqModal
          ticket={ticket}
          onClose={() => setShowFaqModal(false)}
          onSuccess={() => {
            setShowFaqModal(false);
            onClose();
          }}
        />
      )}
    </>
  );
}
