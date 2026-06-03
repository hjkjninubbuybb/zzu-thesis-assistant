import { useState } from 'react';
import { X, Loader2, MessageSquareQuote, Hash } from 'lucide-react';
import type { FAQCreate, FAQItem } from '@shared/types/api';

interface FaqFormProps {
  title: string;
  initial?: Partial<FAQItem>;
  loading: boolean;
  onClose: () => void;
  onSubmit: (data: FAQCreate) => void;
}

/** Create / edit FAQ dialog. */
export function FaqForm({ title, initial, loading, onClose, onSubmit }: FaqFormProps) {
  const [question, setQuestion] = useState(initial?.question ?? '');
  const [answer, setAnswer] = useState(initial?.answer ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [sortOrder, setSortOrder] = useState(initial?.sort_order ?? 0);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = () => {
    const e: Record<string, string> = {};
    if (!question.trim()) e.question = '问题不能为空';
    if (!answer.trim()) e.answer = '答案不能为空';
    if (Object.keys(e).length) {
      setErrors(e);
      return;
    }
    onSubmit({
      question: question.trim(),
      answer: answer.trim(),
      category: category.trim(),
      sort_order: sortOrder,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-[2px] flex items-center justify-center z-50 animate-apple-fade">
      <div className="glass-card rounded-2xl p-6 w-full max-w-sm mx-4 animate-apple-pop">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#F0EDE8]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#F2EFE9] flex items-center justify-center">
              <MessageSquareQuote size={14} className="text-[#334155]" />
            </div>
            <h3 className="text-sm font-semibold text-[#334155]">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-[#F8F6F2] flex items-center justify-center transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* 问题 */}
          <div>
            <label className="block text-xs font-semibold text-[#334155] uppercase tracking-wide mb-2">
              问题 <span className="text-red-400 normal-case">*</span>
            </label>
            <textarea
              value={question}
              onChange={(e) => {
                setQuestion(e.target.value);
                setErrors((v) => ({ ...v, question: '' }));
              }}
              rows={2}
              placeholder="输入学生可能会问的问题..."
              className={`w-full border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-slate-400 resize-none transition-colors placeholder:text-gray-300 ${errors.question ? 'border-red-400 bg-red-50' : 'border-[#E8E4DC] bg-white'}`}
            />
            {errors.question && <p className="mt-1 text-xs text-red-500">{errors.question}</p>}
          </div>

          {/* 答案 */}
          <div>
            <label className="block text-xs font-semibold text-[#334155] uppercase tracking-wide mb-2">
              标准答案 <span className="text-red-400 normal-case">*</span>
            </label>
            <textarea
              value={answer}
              onChange={(e) => {
                setAnswer(e.target.value);
                setErrors((v) => ({ ...v, answer: '' }));
              }}
              rows={6}
              placeholder="输入官方标准答案，将被向量化用于 RAG 检索..."
              className={`w-full border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-slate-400 resize-none transition-colors placeholder:text-gray-300 ${errors.answer ? 'border-red-400 bg-red-50' : 'border-[#E8E4DC] bg-white'}`}
            />
            {errors.answer && <p className="mt-1 text-xs text-red-500">{errors.answer}</p>}
          </div>

          {/* 分类 + 排序 */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-[#334155] uppercase tracking-wide mb-2">
                分类
              </label>
              <div className="relative">
                <Hash
                  size={13}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="如：入学手续、毕业答辩..."
                  className="w-full border border-[#E8E4DC] rounded-xl pl-8 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>
            </div>
            <div className="w-24">
              <label className="block text-xs font-semibold text-[#334155] uppercase tracking-wide mb-2">
                排序
              </label>
              <input
                type="number"
                min={0}
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
                className="w-full border border-[#E8E4DC] rounded-xl px-3 py-2.5 text-sm text-center outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2.5 px-6 py-4 border-t border-[#F0EDE8] bg-[#FAFAF9] rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-xl border border-[#E8E4DC] hover:bg-[#F8F6F2] transition-colors text-[#334155]"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-5 py-2 text-sm rounded-xl bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50 flex items-center gap-2 transition-colors"
          >
            {loading && <Loader2 size={13} className="animate-spin" />}
            {loading ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
