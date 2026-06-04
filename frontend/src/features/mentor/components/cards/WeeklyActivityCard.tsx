import type { WeeklyActivityBucket } from '@shared/types/api';

interface Props {
  data: WeeklyActivityBucket[];
}

export function WeeklyActivityCard({ data }: Props) {
  const max = data.reduce((m, x) => Math.max(m, x.count), 0) || 1;
  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="text-xs text-[#6F7A75] font-medium mb-3">本周学生活跃</div>
      {data.length === 0 ? (
        <div className="text-sm text-[#9CA3AF]">暂无活跃记录</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.map((b) => (
            <li key={b.student_id} className="flex items-center gap-3">
              <div className="w-20 truncate text-xs text-[#1F2937]">{b.display_name}</div>
              <div className="flex-1 h-2 bg-[#0F766E]/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#0F766E]"
                  style={{ width: `${(b.count / max) * 100}%` }}
                />
              </div>
              <div className="w-8 text-right text-xs text-[#6F7A75]">{b.count}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
