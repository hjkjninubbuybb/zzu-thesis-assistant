// frontend/src/features/mentor/components/StudentCard.tsx
import { Link } from 'react-router-dom';
import type { UserInfo } from '@shared/types/api';

interface Props {
  student: UserInfo;
}

export function StudentCard({ student }: Props) {
  const initial = (student.display_name || student.username).slice(0, 1).toUpperCase();
  return (
    <Link
      to={`/teacher/students/${student.id}`}
      className="glass-card rounded-2xl p-5 flex items-center gap-4 hover:shadow-md transition"
    >
      <div className="w-12 h-12 rounded-full bg-[#0F766E]/10 text-[#0F766E] flex items-center justify-center text-base font-semibold shrink-0">
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-[#1F2937] truncate">{student.display_name}</div>
        <div className="text-xs text-[#6F7A75] truncate">{student.username}</div>
      </div>
    </Link>
  );
}
