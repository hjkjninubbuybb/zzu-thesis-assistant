import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, X as XIcon, MessageSquareQuote, Loader2 } from 'lucide-react';
import { ticketService } from '../services/ticketService';
import type { QARequestInfo } from '@shared/types/api';

export function TicketToFaqModal({
  ticket,
  onClose,
  onSuccess,
}: {
  ticket: QARequestInfo;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [question, setQuestion] = useState(ticket.question);
  const [answer, setAnswer] = useState(ticket.answer || '');
  const [category, setCategory] = useState('');
  const [kbName, setKbName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: kbs } = useQuery({
    queryKey: ['kbs'],
    queryFn: ticketService.listKbs,
  });

  const handleSubmit = async () => {
    if (!kbName) {
      setError('请选择目标知识库');
      return;
    }
    if (!question.trim() || !answer.trim()) {
      setError('问题和回答不能为空');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await ticketService.createFaq(kbName, question.trim(), answer.trim(), category.trim());
      onSuccess();
    } catch (err: unknown) {
      setError(ticketService.extractError(err));
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
            <h3 className="text-sm font-semibold text-slate-700">转化为 FAQ 申请</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
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
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !kbName || !question.trim() || !answer.trim()}
            className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-md"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            提交 FAQ 申请
          </button>
        </div>
      </div>
    </div>
  );
}
