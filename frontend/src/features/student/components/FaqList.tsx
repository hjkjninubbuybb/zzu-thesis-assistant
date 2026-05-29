import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, HelpCircle } from "lucide-react";
import type { FAQItem } from "@shared/types/api";

interface FaqItemProps {
  faq: FAQItem;
  index: number;
}

function FaqItem({ faq, index }: FaqItemProps) {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate("/s/faq")}
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#EEF2FF] transition-colors group w-full text-left"
      style={{
        opacity: 0,
        animation: `appleFadeUp 0.6s cubic-bezier(0.25, 1, 0.5, 1) ${500 + index * 75}ms both`,
      }}
    >
      <div className="w-8 h-8 rounded-lg bg-[#F0FDF4] flex items-center justify-center shrink-0">
        <HelpCircle size={14} className="text-[#10B981]" strokeWidth={1.8} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-[#202938] truncate">
          {faq.question}
        </p>
        <p className="text-[10px] text-[#9CA3AF] mt-0.5">{faq.category}</p>
      </div>
      <ArrowRight
        size={12}
        className="text-[#D9DEE5] group-hover:text-[#2563EB] group-hover:translate-x-0.5 transition-all shrink-0"
      />
    </button>
  );
}

interface FaqListProps {
  faqs: FAQItem[];
  onViewMore: () => void;
  cardStyle: React.CSSProperties;
}

export function FaqList({ faqs, onViewMore, cardStyle }: FaqListProps) {
  return (
    <div
      className="glass-card rounded-2xl p-5 flex flex-col gap-3 hover-lift"
      style={cardStyle}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#202938]">常见问题</h3>
        <button
          onClick={onViewMore}
          className="flex items-center gap-1 text-xs text-[#6E7787] hover:text-[#2563EB] transition-colors px-2 py-1 rounded-lg hover:bg-[#EEF2FF]"
        >
          更多
          <ArrowRight size={12} />
        </button>
      </div>

      {faqs.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
          <HelpCircle
            size={28}
            className="text-[#D9DEE5] mb-2"
            strokeWidth={1.2}
          />
          <p className="text-sm text-[#9CA3AF]">暂无常见问题</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {faqs.map((faq, i) => (
            <FaqItem key={faq.id} faq={faq} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
