import { MessageSquare } from "lucide-react";
import type { AnalyticsSummary } from "@shared/types/api";

export function BarChart({
  data,
  animate,
}: {
  data: AnalyticsSummary["week_data"];
  animate: boolean;
}) {
  const maxVal = Math.max(...data.map((d) => d.count), 1);
  const today = new Date().toISOString().slice(0, 10);
  const formatDay = (iso: string) => {
    if (iso === today) return "今天";
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  return (
    <div
      className="glass-card rounded-2xl p-6 flex flex-col gap-5 hover-lift h-full"
      style={{
        animation: animate
          ? "appleSettleIn 0.75s cubic-bezier(0.25,1,0.5,1) 280ms both"
          : "none",
      }}
    >
      <div>
        <h3 className="text-sm font-semibold text-[#1A1A1A]">
          每日提问活跃趋势
        </h3>
        <p className="text-xs text-[#9A9A9A] mt-0.5">近 7 天学生提问次数统计</p>
      </div>

      {data.every((d) => d.count === 0) ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-[#C8C4BC]">
          <MessageSquare size={28} strokeWidth={1.2} />
          <p className="text-xs">暂无提问记录</p>
        </div>
      ) : (
        <div className="flex items-end gap-2 flex-1">
          {data.map((d, i) => {
            const pct = d.count / maxVal;
            const isToday = d.day === today;
            return (
              <div
                key={d.day}
                className="flex-1 flex flex-col items-center gap-1.5"
              >
                <span
                  className="text-[10px] font-semibold"
                  style={{
                    color: isToday ? "#1A1A1A" : "#C0BAB0",
                    opacity: animate ? 1 : 0,
                    transition: `opacity 0.4s ease ${400 + i * 70}ms`,
                  }}
                >
                  {d.count > 0 ? d.count : ""}
                </span>
                <div
                  className="w-full rounded-lg relative overflow-hidden"
                  style={{ height: 110, background: "#F5F2ED" }}
                >
                  <div
                    className="absolute bottom-0 left-0 right-0 rounded-lg"
                    style={{
                      height: animate ? `${pct * 100}%` : "0%",
                      background: isToday
                        ? "linear-gradient(180deg,#E85D4A,#F0C040)"
                        : pct > 0.75
                          ? "#D4CFC6"
                          : "#E8E4DC",
                      transition: `height 0.85s cubic-bezier(0.22,1,0.36,1) ${280 + i * 70}ms`,
                    }}
                  />
                </div>
                <span
                  className="text-[9px]"
                  style={{
                    color: isToday ? "#1A1A1A" : "#B8B4AC",
                    fontWeight: isToday ? 600 : 400,
                  }}
                >
                  {formatDay(d.day)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
