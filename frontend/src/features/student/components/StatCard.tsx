import React, { useEffect, useState } from "react";

function useCountUp(target: number, duration = 900) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!target) {
      setCount(0);
      return;
    }
    let startTs: number;
    let raf: number;
    const tick = (ts: number) => {
      startTs ??= ts;
      const p = Math.min((ts - startTs) / duration, 1);
      setCount(Math.round((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return count;
}

const cardStyle = (delay: number): React.CSSProperties => ({
  animation: `appleSettleIn 0.75s cubic-bezier(0.25, 1, 0.5, 1) ${delay}ms both`,
});

interface StatCardProps {
  delay: number;
  icon: React.ElementType;
  label: string;
  value: number;
  suffix: string;
  color: string;
}

export function StatCard({
  delay,
  icon: Icon,
  label,
  value,
  suffix,
  color,
}: StatCardProps) {
  const count = useCountUp(value);

  return (
    <div
      className="glass-card rounded-2xl p-5 flex flex-col justify-between hover-lift"
      style={{ ...cardStyle(delay), minHeight: 160 }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center"
        style={{ background: `${color}14` }}
      >
        <Icon size={20} style={{ color }} strokeWidth={1.8} />
      </div>
      <div>
        <p className="text-2xl font-bold text-[#202938] leading-none">
          {count}
          <span className="text-sm font-normal text-[#9CA3AF] ml-1">
            {suffix}
          </span>
        </p>
        <p className="text-xs text-[#6E7787] mt-1">{label}</p>
      </div>
    </div>
  );
}
