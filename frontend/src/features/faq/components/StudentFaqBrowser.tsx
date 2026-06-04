import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronDown, MessagesSquare, HelpCircle } from 'lucide-react';
import type { FAQItem } from '@shared/types/api';
import { useStudentActiveKb } from '../hooks/useStudentActiveKb';
import { useStudentFaqs } from '../hooks/useStudentFaqs';

const cardStyle = (delay: number): React.CSSProperties => ({
  animation: `appleSettleIn 0.75s cubic-bezier(0.25, 1, 0.5, 1) ${delay}ms both`,
});

// ── Accordion item ─────────────────────────────────────────

function FaqAccordion({
  faq,
  index,
  expanded,
  onToggle,
  onAsk,
}: {
  faq: FAQItem;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onAsk: () => void;
}) {
  return (
    <div
      className={`rounded-xl border transition-colors ${
        expanded
          ? 'border-[#2563EB]/30 bg-[#FAFBFF]'
          : 'border-[#D9DEE5] bg-white hover:border-[#B0BDD5]'
      }`}
      style={{
        animation: `appleFadeUp 0.6s cubic-bezier(0.25, 1, 0.5, 1) ${Math.min(200 + index * 55, 650)}ms both`,
      }}
    >
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-5 py-4 text-left">
        <div
          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
            expanded ? 'bg-[#2563EB]' : 'bg-[#EEF2FF]'
          }`}
        >
          <HelpCircle
            size={14}
            className={expanded ? 'text-white' : 'text-[#2563EB]'}
            strokeWidth={1.8}
          />
        </div>
        <span className="flex-1 text-sm font-medium text-[#202938]">{faq.question}</span>
        {faq.category && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#EEF2FF] text-[#6E7787] shrink-0">
            {faq.category}
          </span>
        )}
        <ChevronDown
          size={16}
          className="text-[#6E7787] shrink-0 transition-transform duration-300"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)' }}
        />
      </button>

      <div className={`accordion-body ${expanded ? 'open' : ''}`}>
        <div>
          <div className="px-5 pb-4">
            <div className="ml-10 text-sm text-[#4B5563] leading-relaxed whitespace-pre-line">
              {faq.answer}
            </div>
            <div className="ml-10 mt-3">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAsk();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EEF2FF] text-xs font-medium text-[#2563EB] hover:bg-[#DBEAFE] transition-colors"
              >
                <MessagesSquare size={12} />
                去提问
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── StudentFaqBrowser ──────────────────────────────────────

/** Read-only FAQ browsing view for students. */
export function StudentFaqBrowser() {
  const navigate = useNavigate();
  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: activeKb } = useStudentActiveKb();
  const kbName = activeKb?.kb_name ?? '';

  const { data: allFaqs = [], isLoading } = useStudentFaqs(kbName);

  const categories = useMemo(() => {
    const cats = new Set(allFaqs.map((f) => f.category).filter(Boolean));
    return Array.from(cats);
  }, [allFaqs]);

  const filtered = useMemo(() => {
    let result = allFaqs;
    if (selectedCategory) result = result.filter((f) => f.category === selectedCategory);
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      result = result.filter(
        (f) => f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q),
      );
    }
    return result;
  }, [allFaqs, selectedCategory, searchText]);

  return (
    <div className="p-7 flex-1 overflow-y-auto glass-card rounded-2xl">
      {/* Header */}
      <div className="mb-6" style={cardStyle(0)}>
        <h1 className="text-xl font-semibold text-[#202938] tracking-tight">常见问题</h1>
        <p className="text-sm text-[#6E7787] mt-1">浏览常见问题，快速找到你需要的答案</p>
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-3 mb-5" style={cardStyle(80)}>
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="搜索问题或答案..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#D9DEE5] bg-[#F8F9FB] text-sm text-[#202938] placeholder:text-[#9CA3AF] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 focus:bg-white transition"
          />
        </div>
      </div>

      {/* Category tabs */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5" style={cardStyle(160)}>
          <button
            onClick={() => setSelectedCategory('')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              !selectedCategory
                ? 'bg-[#2563EB] text-white'
                : 'bg-[#EEF2FF] text-[#6E7787] hover:text-[#2563EB]'
            }`}
          >
            全部
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat === selectedCategory ? '' : cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                selectedCategory === cat
                  ? 'bg-[#2563EB] text-white'
                  : 'bg-[#EEF2FF] text-[#6E7787] hover:text-[#2563EB]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* FAQ list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-sm text-[#9CA3AF]">
          加载中...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <HelpCircle size={36} className="text-[#D9DEE5] mb-3" strokeWidth={1.2} />
          <p className="text-sm text-[#9CA3AF]">
            {searchText ? '没有找到相关问题' : '暂无常见问题'}
          </p>
          <p className="text-xs text-[#C4C9D4] mt-1">
            {searchText ? '试试换个关键词搜索' : '管理员尚未添加 FAQ'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((faq, i) => (
            <FaqAccordion
              key={faq.id}
              faq={faq}
              index={i}
              expanded={expandedId === faq.id}
              onToggle={() => setExpandedId(expandedId === faq.id ? null : faq.id)}
              onAsk={() => navigate('/student/chat')}
            />
          ))}
        </div>
      )}
    </div>
  );
}
