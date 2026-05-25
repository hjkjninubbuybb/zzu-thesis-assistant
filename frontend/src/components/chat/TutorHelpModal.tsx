import { useState } from "react";
import { Loader2, X as XIcon, HelpCircle } from "lucide-react";
import { ticketApi } from "@/lib/api";
import type { ChatMessage } from "@/types/api";

export function TutorHelpModal({
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
