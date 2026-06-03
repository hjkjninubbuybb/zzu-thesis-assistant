import { ThumbsUp } from 'lucide-react';
import { useCountUp } from '../../hooks/animationHooks';

function RingProgress({
  value,
  max,
  size = 110,
  color = '#E85D4A',
  animate,
}: {
  value: number;
  max: number;
  size?: number;
  color?: string;
  animate: boolean;
}) {
  const strokeW = size * 0.075;
  const r = (size - strokeW * 2) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const arcFrac = 0.75;
  const arcLen = circumference * arcFrac;
  const filled = animate ? Math.min(value / max, 1) * arcLen : 0;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-225deg)', display: 'block' }}>
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
        stroke={color}
        strokeWidth={strokeW}
        strokeDasharray={`${filled} ${circumference}`}
        strokeLinecap="round"
        style={{
          transition: 'stroke-dasharray 1.4s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      />
    </svg>
  );
}

export function SatisfactionCard({
  upPct,
  feedbackCount,
  animate,
}: {
  upPct: number;
  feedbackCount: number;
  animate: boolean;
}) {
  const displayPct = useCountUp(upPct, 900, animate);
  return (
    <div className="glass-card rounded-2xl p-5 flex flex-col gap-3 hover-lift">
      <div>
        <h3 className="text-sm font-semibold text-[#1A1A1A]">用户满意度</h3>
        <p className="text-xs text-[#9A9A9A] mt-0.5">累计收到 {feedbackCount} 条反馈</p>
      </div>
      <div className="flex items-center gap-4">
        <div
          className="relative flex items-center justify-center"
          style={{ width: 110, height: 110 }}
        >
          <RingProgress value={upPct} max={100} animate={animate} color="#5EE67A" />
          <div className="absolute text-center">
            <p className="text-2xl font-bold text-[#1A1A1A] leading-none">{displayPct}%</p>
            <p className="text-[10px] text-[#9A9A9A] mt-1">好评率</p>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <ThumbsUp size={16} className="text-[#5EE67A]" />
          <p className="text-xs text-[#9A9A9A]">整体反馈</p>
          <p className="text-sm font-bold text-[#1A1A1A]">
            {upPct > 80 ? '极好' : upPct > 50 ? '一般' : '需优化'}
          </p>
        </div>
      </div>
    </div>
  );
}
