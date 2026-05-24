import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Ticket,
  Search,
  MessageSquare,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Send,
  User,
  Calendar,
  ExternalLink,
  Plus,
  X as XIcon,
  MessageSquareQuote,
  Loader2,
} from "lucide-react";
import { ticketApi, faqApi, knowledgeApi, extractError } from "@/lib/api";
import type { QARequestInfo } from "@/types/api";
import { useAuth } from "@/hooks/useAuth";

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

// ── 详情对话框 ─────────────────────────────────────────────

function TicketDetailModal({
  ticket,
  onClose,
}: {
  ticket: QARequestInfo;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { isTeacher, isAdmin } = useAuth();
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showFaqModal, setShowFaqModal] = useState(false);

  const replyMut = useMutation({
    mutationFn: () => ticketApi.reply(ticket.id, reply),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tickets"] });
      onClose();
    },
    onError: (err) => setError(extractError(err)),
  });

  const closeMut = useMutation({
    mutationFn: () => ticketApi.close(ticket.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tickets"] });
      onClose();
    },
  });

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
                <h2 className="text-sm font-semibold text-[#334155]">
                  答疑详情
                </h2>
                <p className="text-[10px] text-[#9A9A9A]">ID: #{ticket.id}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-[#9A9A9A] hover:text-[#334155]"
            >
              <ChevronRight size={18} className="rotate-90" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Question */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[11px] text-[#9A9A9A] font-medium uppercase tracking-wider">
                <User size={12} /> 学生提出的问题
              </div>
              <div className="bg-[#F8F6F2] rounded-2xl p-4 text-sm text-[#334155] leading-relaxed border border-[#E8E4DC]">
                {ticket.question}
              </div>
              <div className="flex items-center justify-between text-[10px] text-[#9A9A9A]">
                <div className="flex items-center gap-1">
                  <Calendar size={10} />{" "}
                  {new Date(ticket.created_at).toLocaleString()}
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

            {/* Answer */}
            {(ticket.answer || ticket.status === "replied") && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[11px] text-emerald-600 font-medium uppercase tracking-wider">
                  <MessageSquare size={12} /> 导师的回复
                </div>
                <div className="bg-emerald-50/50 rounded-2xl p-4 text-sm text-[#334155] leading-relaxed border border-emerald-100">
                  {ticket.answer || (
                    <span className="text-gray-400 italic">尚未回复</span>
                  )}
                </div>
                {ticket.replied_at && (
                  <div className="text-[10px] text-[#9A9A9A] flex items-center gap-1">
                    <Clock size={10} /> 回复时间:{" "}
                    {new Date(ticket.replied_at).toLocaleString()}
                  </div>
                )}
              </div>
            )}

            {/* Reply Form */}
            {ticket.status === "pending" && (isTeacher || isAdmin) && (
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
              {ticket.status !== "pending" && (isTeacher || isAdmin) && (
                <button
                  onClick={() => setShowFaqModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 border border-blue-100 text-blue-600 text-sm rounded-xl hover:bg-blue-50 transition"
                >
                  <Plus size={14} /> 设为 FAQ
                </button>
              )}
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-[#6A6A6A]"
              >
                取消
              </button>
              {ticket.status === "pending" && (isTeacher || isAdmin) && (
                <button
                  onClick={() => replyMut.mutate()}
                  disabled={replyMut.isPending || !reply.trim()}
                  className="flex items-center gap-2 px-5 py-2 bg-slate-700 text-white text-sm rounded-xl hover:bg-slate-800 disabled:opacity-50 transition"
                >
                  <Send size={14} />{" "}
                  {replyMut.isPending ? "提交中..." : "提交回复"}
                </button>
              )}
              {ticket.status === "replied" && (
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

// ── 答疑转 FAQ 弹窗 ──────────────────────────────────────────

function TicketToFaqModal({
  ticket,
  onClose,
  onSuccess,
}: {
  ticket: QARequestInfo;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [question, setQuestion] = useState(ticket.question);
  const [answer, setAnswer] = useState(ticket.answer || "");
  const [category, setCategory] = useState("");
  const [kbName, setKbName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: kbs } = useQuery({
    queryKey: ["kbs"],
    queryFn: knowledgeApi.list,
  });

  const handleSubmit = async () => {
    if (!kbName) {
      setError("请选择目标知识库");
      return;
    }
    if (!question.trim() || !answer.trim()) {
      setError("问题和回答不能为空");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await faqApi.create(kbName, {
        question: question.trim(),
        answer: answer.trim(),
        category: category.trim(),
        sort_order: 0,
      });
      onSuccess();
    } catch (err: any) {
      setError(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-[2px] animate-apple-fade">
      <div className="glass-card rounded-2xl w-full max-w-md mx-4 overflow-hidden animate-apple-pop shadow-2xl">
        <div className="px-6 py-4 border-b border-[#F0EDE8] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
              <MessageSquareQuote size={16} />
            </div>
            <h3 className="text-sm font-semibold text-slate-700">
              转化为 FAQ 申请
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <XIcon size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              目标知识库 <span className="text-red-400">*</span>
            </label>
            <select
              value={kbName}
              onChange={(e) => setKbName(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald-500 transition-all"
            >
              <option value="">请选择知识库...</option>
              {kbs?.map((kb) => (
                <option key={kb.id} value={kb.name}>
                  {kb.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              分类
            </label>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="例如：选题相关、格式规范..."
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald-500 transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              FAQ 问题 <span className="text-red-400">*</span>
            </label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald-500 transition-all resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              FAQ 回答 <span className="text-red-400">*</span>
            </label>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={5}
              className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald-500 transition-all resize-none"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-[#F0EDE8] flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !kbName || !question.trim() || !answer.trim()}
            className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-md"
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <CheckCircle2 size={14} />
            )}
            提交 FAQ 申请
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 主页面 ──────────────────────────────────────────────────

export default function TicketsPage() {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selectedTicket, setSelectedTicket] = useState<QARequestInfo | null>(
    null,
  );

  const { data: tickets, isLoading } = useQuery({
    queryKey: ["tickets"],
    queryFn: () => ticketApi.list(),
  });

  const filtered = (tickets ?? [])
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
        <TicketDetailModal
          ticket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
        />
      )}
    </div>
  );
}
