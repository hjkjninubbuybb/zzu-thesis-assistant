// frontend/src/features/mentor/components/MyStudentDetail.tsx
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useStudentDetail } from '../hooks/useStudentDetail';

// MentorTicketList will be added once Task 19 creates it in features/tickets

interface Props {
  studentId: number;
}

export function MyStudentDetail({ studentId }: Props) {
  const { student, isLoading } = useStudentDetail(studentId);

  if (isLoading) {
    return (
      <div className="px-8 py-8 flex-1 overflow-y-auto glass-card rounded-2xl">
        <div className="text-sm text-[#6F7A75]">加载中...</div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="px-8 py-8 flex-1 overflow-y-auto glass-card rounded-2xl">
        <div className="text-sm text-red-500">学生不存在或无权访问</div>
      </div>
    );
  }

  const initial = (student.display_name || student.username).slice(0, 1).toUpperCase();
  const profile = (student.profile ?? {}) as Record<string, unknown>;

  return (
    <div className="px-8 py-8 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-4">
      <Link
        to="/teacher/students"
        className="self-start flex items-center gap-1 text-xs text-[#6F7A75] hover:text-[#0F766E] transition"
      >
        <ChevronLeft size={14} /> 返回我的学生
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
        {/* 左：学生信息 */}
        <div className="glass-card rounded-2xl p-6 flex flex-col gap-4 h-fit">
          <div className="flex flex-col items-center gap-2">
            <div className="w-16 h-16 rounded-full bg-[#0F766E]/10 text-[#0F766E] flex items-center justify-center text-2xl font-semibold">
              {initial}
            </div>
            <div className="text-base font-semibold text-[#1F2937]">{student.display_name}</div>
            <div className="text-xs text-[#6F7A75]">{student.username}</div>
          </div>
          <div className="flex flex-col gap-2 text-xs">
            {['student_id', 'grade', 'major', 'class_name'].map((k) => {
              const v = profile[k];
              if (v === undefined || v === null || v === '') return null;
              return (
                <div key={k} className="flex justify-between gap-2">
                  <span className="text-[#9CA3AF]">{k}</span>
                  <span className="text-[#1F2937] truncate">{String(v)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 右：工单（placeholder for MentorTicketList from Task 19） */}
        <div className="glass-card rounded-2xl p-6 flex items-center justify-center text-sm text-[#9CA3AF]">
          {/* TODO: MentorTicketList */}
          工单列表（待 Task 19 集成）
        </div>
      </div>
    </div>
  );
}
