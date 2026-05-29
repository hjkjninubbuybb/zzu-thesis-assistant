import React, { useState } from "react";
import {
  Ticket,
  MessageSquare,
  Clock,
  CheckCircle2,
  ChevronRight,
  Search,
} from "lucide-react";
import { useTicketList } from "../hooks/useTicketList";
import type { QARequestInfo } from "@shared/types/api";
import { TicketDetailModal } from "./TicketDetailModal";

// ── 状态标签 ──────────────────────────────────────────────

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
      icon: Clock,
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

// ── 主组件 ──────────────────────────────────────────────────

export function StudentTicketList() {
  const [search, setSearch] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<QARequestInfo | null>(
    null,
  );

  const { tickets, isLoading } = useTicketList("mine");

  const filtered = tickets.filter((t) =>
    t.question.toLowerCase().includes(search.toLowerCase()),
  );

  const settle = (d: number): React.CSSProperties => ({
    animation: `appleSettleIn 0.75s cubic-bezier(0.25, 1, 0.5, 1) ${d}ms both`,
  });

  return (
    <div className="px-8 py-8 flex-1 overflow-y-auto glass-card rounded-2xl custom-scrollbar flex flex-col gap-6">
      {/* 头部 */}
      <div
        className="flex items-center justify-between shrink-0"
        style={settle(0)}
      >
        <div>
          <h1 className="text-2xl font-bold text-[#334155]">我的答疑记录</h1>
          <p className="mt-1 text-sm text-[#8A8A8A]">
            查看向导师提交的所有求助请求及回复
          </p>
        </div>
        <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 border border-blue-100 shadow-sm">
          <Ticket size={24} />
        </div>
      </div>

      {/* 搜索 */}
      <div className="relative" style={settle(50)}>
        <Search
          size={14}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索问题记录..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#E8E4DC] bg-white text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all shadow-inner"
        />
      </div>

      {/* 列表 */}
      <div
        className="flex-1 overflow-y-auto min-h-0 space-y-4 pr-1 custom-scrollbar"
        style={settle(100)}
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-sm text-[#9A9A9A]">
            <Clock size={16} className="animate-spin mr-2" /> 加载中...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-[#9A9A9A] gap-4 bg-gray-50/50 rounded-3xl border border-dashed border-gray-200">
            <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center border border-gray-100 shadow-sm">
              <Ticket size={32} strokeWidth={1} className="opacity-20" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-500">暂无记录</p>
              <p className="text-[11px] text-gray-400 mt-1">
                在 AI 对话中点击「求助导师」可发起提问
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {filtered.map((t, i) => (
              <div
                key={t.id}
                onClick={() => setSelectedTicket(t)}
                className="group bg-white/40 border border-[#F0EDE8] rounded-2xl p-5 flex items-start gap-5 cursor-pointer hover:shadow-xl hover:border-blue-200 transition-all apple-press active:scale-[0.99] hover:bg-white"
                style={{
                  animation: `appleFadeUp 0.5s cubic-bezier(0.25, 1, 0.5, 1) ${150 + i * 50}ms both`,
                }}
              >
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110 shadow-sm border ${
                    t.status === "pending"
                      ? "bg-amber-50 text-amber-600 border-amber-100"
                      : "bg-emerald-50 text-emerald-600 border-emerald-100"
                  }`}
                >
                  <MessageSquare size={22} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-bold font-mono text-gray-400 bg-gray-50 px-2 py-0.5 rounded border border-black/5 uppercase">
                        Ref #{t.id}
                      </span>
                      <StatusBadge status={t.status} />
                    </div>
                    <span className="text-[10px] font-bold text-[#8A8A8A] uppercase tracking-wider">
                      {new Date(t.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-[#334155] line-clamp-1 leading-relaxed group-hover:text-blue-700 transition-colors">
                    {t.question}
                  </h3>
                  {t.answer && (
                    <p className="mt-2 text-xs text-gray-500 line-clamp-1 italic bg-gray-50/50 px-2 py-1 rounded border border-gray-100/50">
                      导师：{t.answer}
                    </p>
                  )}
                </div>
                <div className="self-center p-2 text-[#C0BDB8] group-hover:text-blue-500 transition-all group-hover:translate-x-1">
                  <ChevronRight size={20} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
        />
      )}
    </div>
  );
}
