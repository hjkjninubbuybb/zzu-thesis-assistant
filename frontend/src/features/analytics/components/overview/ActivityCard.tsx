import { useCountUp } from "../../hooks/animationHooks";

export function ActivityCard({
  todayQs,
  animate,
}: {
  todayQs: number;
  animate: boolean;
}) {
  const TARGET = 50;
  const pct = animate ? Math.min(todayQs / TARGET, 1) : 0;
  const displayQs = useCountUp(todayQs, 900, animate);
  return (
    <div className="glass-card rounded-2xl p-5 flex flex-col gap-4 hover-lift">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[#1A1A1A]">今日活跃度</h3>
          <p className="text-xs text-[#9A9A9A] mt-0.5">今日学生提问数量</p>
        </div>
        <span className="text-xl font-bold text-[#F0C040]">{displayQs}</span>
      </div>
      <div className="relative">
        <div
          className="h-2 rounded-full overflow-hidden"
          style={{ background: "#F0EDE8" }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${pct * 100}%`,
              background: "linear-gradient(90deg, #F0C040, #E85D4A)",
              transition: "width 1.4s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-[#9A9A9A]">
        <span>活跃度：{Math.round(pct * 100)}%</span>
        <span>目标 {TARGET} 问/日</span>
      </div>
    </div>
  );
}
