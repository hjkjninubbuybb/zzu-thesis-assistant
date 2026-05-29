import React, { useState } from "react";
import {
  Ticket,
  Search,
  MessageSquare,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronRight,
} from "lucide-react";
import { useTicketList } from "../hooks/useTicketList";
import { TicketReplyModal } from "./TicketReplyModal";
import type { QARequestInfo } from "@shared/types/api";

// ── 状态标签 ──────────────────────────────────────────────

function StatusBadge({ status }: { status: QARequestInfo["status"] }) {
  const map = {
    pending: {
      label: "待处理",
      icon: Clock,
      class: "bg-amber-50 text-amber-600 border-amber-100",
    },
    replied: {
      label: "已回复",
      icon: CheckCircle2,
      class: "bg-emerald-50 text-emerald-600 border-emerald-100",
    },
    closed: {
      label: "已关闭",
      icon: XCircle,
      class: "bg-slate-50 text-slate-500 border-slate-100",
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

// ── 主组件 ──────────────────────────────────────────────────

export function TicketsManagement() {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selectedTicket, setSelectedTicket] = useState<QARequestInfo | null>(
    null,
  );

  const { tickets, isLoading } = useTicketList("all");

  const filtered = tickets
    .filter((t) => filterStatus === "all" || t.status === filterStatus)
    .filter((t) => t.question.toLowerCase().includes(search.toLowerCase()));

  const settle = (d: number): React.CSSProperties => ({
    animation: `appleSettleIn 0.75s cubic-bezier(0.25, 1, 0.5, 1) ${d}ms both`,
  });

  return (
    <div className="px-8 py-8 flex-1 overflow-y-auto glass-card rounded-2xl custom-scrollbar flex flex-col gap-5">
      {/* 头部 */}
      <div
        className="flex items-center justify-between shrink-0"
        style={settle(0)}
      >
        <div>
          <h1 className="text-2xl font-bold text-[#334155]">答疑请求</h1>
          <p className="mt-1 text-sm text-[#8A8A8A]">处理来自学生的提问请求</p>
        </div>
        <div className="flex items-center gap-2 p-1.5 bg-[#F2EFE9] rounded-xl border border-[#E8E4DC]">
          {["all", "pending", "replied", "closed"].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filterStatus === s
                  ? "bg-white text-[#334155] shadow-sm"
                  : "text-[#8A8A8A] hover:text-[#334155]"
              }`}
            >
              {s === "all"
                ? "全部"
                : s === "pending"
                  ? "待处理"
                  : s === "replied"
                    ? "已回复"
                    : "已关闭"}
            </button>
          ))}
        </div>
      </div>

      {/* 搜索 */}
      <div className="relative" style={settle(50)}>
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[#C0BDB8]"
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索问题内容..."
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[#E8E4DC] bg-white text-sm outline-none focus:ring-2 focus:ring-slate-400 transition-all"
        />
      </div>

      {/* 列表 */}
      <div
        className="flex-1 overflow-y-auto min-h-0 space-y-3 pr-1 custom-scrollbar"
        style={settle(100)}
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-sm text-[#9A9A9A]">
            加载中...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-[#9A9A9A] gap-3">
            <Ticket size={40} strokeWidth={1} className="opacity-20" />
            <span className="text-sm">暂无匹配的答疑请求</span>
          </div>
        ) : (
          filtered.map((t, i) => (
            <div
              key={t.id}
              onClick={() => setSelectedTicket(t)}
              className="glass-card rounded-2xl p-5 flex items-start gap-5 cursor-pointer hover:shadow-lg hover:border-slate-200 transition-all apple-press border-transparent active:scale-[0.99] group"
              style={{
                animation: `appleFadeUp 0.5s cubic-bezier(0.25, 1, 0.5, 1) ${150 + i * 50}ms both`,
              }}
            >
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110 ${
                  t.status === "pending"
                    ? "bg-amber-100 text-amber-600"
                    : "bg-[#F2EFE9] text-[#8A8A8A]"
                }`}
              >
                <MessageSquare size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold font-mono text-slate-400 bg-white/50 px-2 py-0.5 rounded border border-black/5">
                      #{t.id}
                    </span>
                    <StatusBadge status={t.status} />
                  </div>
                  <span className="text-[10px] font-bold text-[#8A8A8A] uppercase tracking-wider">
                    {new Date(t.created_at).toLocaleDateString()}
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-[#334155] line-clamp-2 leading-relaxed group-hover:text-black transition-colors">
                  {t.question}
                </h3>
                {t.status === "replied" && (
                  <div className="mt-3 flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 bg-emerald-50 w-fit px-2.5 py-1 rounded-lg border border-emerald-100">
                    <CheckCircle2 size={12} /> 导师已回复
                  </div>
                )}
              </div>
              <div className="self-center p-2 text-[#C0BDB8] group-hover:text-[#334155] transition-colors">
                <ChevronRight size={20} />
              </div>
            </div>
          ))
        )}
      </div>

      {selectedTicket && (
        <TicketReplyModal
          ticket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
        />
      )}
    </div>
  );
}
