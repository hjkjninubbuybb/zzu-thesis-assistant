import {
  Ticket,
  MessageSquare,
  Clock,
  CheckCircle2,
  XCircle,
  Calendar,
  User,
} from "lucide-react";
import type { QARequestInfo } from "@shared/types/api";

function StatusBadge({ status }: { status: QARequestInfo["status"] }) {
  const map = {
    pending: {
      label: "等待回复",
      icon: Clock,
      class: "bg-amber-50 text-amber-600 border-amber-100",
    },
    replied: {
      label: "导师已回复",
      icon: CheckCircle2,
      class: "bg-emerald-50 text-emerald-600 border-emerald-100",
    },
    closed: {
      label: "已结束",
      icon: XCircle,
      class: "bg-slate-50 text-slate-500 border-slate-100",
    },
  };
  const config = map[status];
  const Icon = config.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${config.class}`}
    >
      <Icon size={10} />
      {config.label}
    </span>
  );
}

export function TicketDetailModal({
  ticket,
  onClose,
}: {
  ticket: QARequestInfo;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-apple-fade">
      <div className="glass-card rounded-3xl w-full max-w-lg mx-4 flex flex-col max-h-[85vh] animate-apple-pop overflow-hidden border border-white/20 shadow-2xl">
        {/* Header */}
        <div className="px-8 py-5 border-b border-[#F0EDE8] flex items-center justify-between bg-white/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 shadow-sm border border-blue-100">
              <Ticket size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#202938]">
                答疑记录详情
              </h2>
              <p className="text-[10px] text-[#9A9A9A] font-mono tracking-tighter uppercase">
                Query Reference: #{ticket.id}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            <XCircle size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar bg-[#FAFAFA]/30">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold uppercase tracking-[0.1em]">
              <User size={12} className="text-blue-500" /> 我的提问
            </div>
            <div className="bg-white rounded-2xl p-5 text-sm text-[#334155] leading-relaxed border border-gray-100 shadow-sm">
              {ticket.question}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-gray-400 font-medium ml-1">
              <Calendar size={10} /> 提交于{" "}
              {new Date(ticket.created_at).toLocaleString()}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[10px] text-emerald-600 font-bold uppercase tracking-[0.1em]">
              <MessageSquare size={12} /> 导师回复
            </div>
            {ticket.answer ? (
              <div className="bg-emerald-50/40 rounded-2xl p-6 text-sm text-[#334155] leading-relaxed border border-emerald-100 italic shadow-inner">
                {ticket.answer}
              </div>
            ) : (
              <div className="bg-amber-50/30 rounded-2xl p-6 border border-dashed border-amber-200 text-center">
                <Clock
                  size={24}
                  className="mx-auto text-amber-400 mb-2 opacity-50"
                />
                <p className="text-xs text-amber-600 font-medium">
                  导师正在处理中，请耐心等待回复...
                </p>
              </div>
            )}
            {ticket.replied_at && (
              <div className="flex items-center gap-1 text-[10px] text-emerald-500/70 font-medium ml-1">
                <CheckCircle2 size={10} /> 回复于{" "}
                {new Date(ticket.replied_at).toLocaleString()}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-5 bg-[#FAFAF9]/80 border-t border-[#F0EDE8] flex items-center justify-between shrink-0">
          <StatusBadge status={ticket.status} />
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-slate-800 text-white text-xs font-bold rounded-xl hover:bg-black transition-all shadow-md active:scale-95"
          >
            关闭详情
          </button>
        </div>
      </div>
    </div>
  );
}
