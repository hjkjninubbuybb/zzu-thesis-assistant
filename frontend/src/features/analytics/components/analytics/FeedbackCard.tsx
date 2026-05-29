import { ThumbsUp, ThumbsDown } from "lucide-react";

export function FeedbackCard({
  up,
  down,
  animate,
}: {
  up: number;
  down: number;
  animate: boolean;
}) {
  const total = up + down,
    upPct = total > 0 ? Math.round((up / total) * 100) : 0;
  const size = 110,
    strokeW = size * 0.08,
    r = (size - strokeW * 2) / 2,
    cx = size / 2,
    cy = size / 2,
    circumference = 2 * Math.PI * r,
    arcFrac = 0.75,
    arcLen = circumference * arcFrac,
    filled = animate ? (upPct / 100) * arcLen : 0;

  return (
    <div
      className="glass-card rounded-2xl p-6 flex flex-col gap-5 hover-lift"
      style={{
        animation: animate
          ? "appleSettleIn 0.75s cubic-bezier(0.25,1,0.5,1) 400ms both"
          : "none",
      }}
    >
      <div>
        <h3 className="text-sm font-semibold text-[#1A1A1A]">满意度分布</h3>
        <p className="text-xs text-[#9A9A9A] mt-0.5">回答点赞与反馈统计</p>
      </div>
      {total === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-6 gap-2 text-[#C8C4BC]">
          <ThumbsUp size={24} strokeWidth={1.2} />
          <p className="text-xs">暂无反馈</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-center">
            <div
              className="relative flex items-center justify-center"
              style={{ width: size, height: size }}
            >
              <svg
                width={size}
                height={size}
                style={{ transform: "rotate(-225deg)", display: "block" }}
              >
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke="#F0EDE8"
                  strokeWidth={strokeW}
                  strokeDasharray={`${arcLen} ${circumference}`}
                  strokeLinecap="round"
                />
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke="#5EE67A"
                  strokeWidth={strokeW}
                  strokeDasharray={`${filled} ${circumference}`}
                  strokeLinecap="round"
                  style={{
                    transition:
                      "stroke-dasharray 1.4s cubic-bezier(0.22,1,0.36,1)",
                  }}
                />
              </svg>
              <div className="absolute text-center">
                <p className="text-2xl font-bold text-[#1A1A1A] leading-none">
                  {upPct}%
                </p>
                <p className="text-[10px] text-[#B8B4AC] mt-1">满意度</p>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2.5 pt-4 border-t border-[#F0EDE8]">
            {[
              {
                label: "好评",
                value: up,
                icon: <ThumbsUp size={12} />,
                color: "#5EE67A",
              },
              {
                label: "差评",
                value: down,
                icon: <ThumbsDown size={12} />,
                color: "#E85D4A",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between"
              >
                <div
                  className="flex items-center gap-2"
                  style={{ color: item.color }}
                >
                  {item.icon}
                  <span className="text-xs text-[#6A6A6A]">{item.label}</span>
                </div>
                <span
                  className="text-sm font-bold"
                  style={{ color: item.color }}
                >
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
