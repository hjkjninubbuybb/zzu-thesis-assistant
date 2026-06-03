export function StatCard({
  label,
  value,
  sub,
  icon,
  color,
  animate,
  delay,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  color: string;
  animate: boolean;
  delay: number;
}) {
  return (
    <div
      className="glass-card rounded-2xl p-5 flex flex-col gap-3 hover-lift"
      style={{
        animation: animate
          ? `appleSettleIn 0.75s cubic-bezier(0.25,1,0.5,1) ${delay}ms both`
          : 'none',
      }}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-[#9A9A9A]">{label}</p>
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: `${color}18` }}
        >
          <span style={{ color }}>{icon}</span>
        </div>
      </div>
      <div>
        <p className="text-[28px] font-bold text-[#1A1A1A] leading-none">{value}</p>
        <p className="text-xs text-[#B8B4AC] mt-1.5">{sub}</p>
      </div>
    </div>
  );
}
