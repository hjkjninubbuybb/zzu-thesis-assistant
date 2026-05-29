import { MessageSquare } from "lucide-react";
import type { AnalyticsSummary } from "@shared/types/api";

export function RecentQuestionsCard({
  questions,
  animate,
}: {
  questions: AnalyticsSummary["recent_questions"];
  animate: boolean;
}) {
  const formatTime = (iso: string) => {
    const d = new Date(iso),
      today = new Date();
    if (d.toDateString() === today.toDateString())
      return d.toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
      });
    return `${d.getMonth() + 1}/${d.getDate()} ${d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  };

  return (
    <div
      className="glass-card rounded-2xl p-6 flex flex-col gap-4 hover-lift"
      style={{
        animation: animate
          ? "appleSettleIn 0.75s cubic-bezier(0.25,1,0.5,1) 340ms both"
          : "none",
      }}
    >
      <div>
        <h3 className="text-sm font-semibold text-[#1A1A1A]">最近提问明细</h3>
        <p className="text-xs text-[#9A9A9A] mt-0.5">
          展示学生最近 10 条真实提问内容
        </p>
      </div>
      {questions.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-10 gap-2 text-[#C8C4BC]">
          <MessageSquare size={28} strokeWidth={1.2} />
          <p className="text-xs">暂无提问记录</p>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {questions.map((q, i) => (
            <div
              key={i}
              className="flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-[#F8F6F2] transition-colors"
              style={{
                opacity: animate ? 1 : 0,
                transform: animate ? "translateX(0)" : "translateX(12px)",
                transition: `opacity 0.35s ease ${200 + i * 50}ms, transform 0.35s ease ${200 + i * 50}ms`,
              }}
            >
              <div
                className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-bold text-white shrink-0 mt-0.5"
                style={{ background: i < 3 ? "#E85D4A" : "#D4D0C8" }}
              >
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[#2A2A2A] leading-relaxed line-clamp-2">
                  {q.content}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[9px] text-[#C0BAB0]">
                    {formatTime(q.created_at)}
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#F0EDE8] text-[#9A9A9A]">
                    {q.kb_name}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
