import { Link } from 'react-router-dom';
import type { SilentStudent } from '@shared/types/api';

interface Props {
  students: SilentStudent[];
}

export function SilentStudentsCard({ students }: Props) {
  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="text-xs text-[#6F7A75] font-medium mb-3">超过 7 天未活跃</div>
      {students.length === 0 ? (
        <div className="text-sm text-[#9CA3AF]">无沉默学生</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {students.map((s) => (
            <li key={s.id}>
              <Link
                to={`/teacher/students/${s.id}`}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/60 transition"
              >
                <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-semibold">
                  {s.display_name.slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-[#1F2937] truncate">{s.display_name}</div>
                  <div className="text-[10px] text-[#9CA3AF]">
                    {s.days_silent >= 9999 ? '从未活跃' : `${s.days_silent} 天未活跃`}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
