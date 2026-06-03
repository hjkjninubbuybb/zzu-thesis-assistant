import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, UserPlus } from 'lucide-react';
import { userService } from '../services/userService';
import type { UserInfo } from '@shared/types/api';

interface MentorCardProps {
  teacher: UserInfo;
  students: UserInfo[];
  isLoadingStudents: boolean;
  animationDelay: number;
  onAddStudents: (teacher: UserInfo) => void;
}

export function MentorCard({
  teacher,
  students,
  isLoadingStudents,
  animationDelay,
  onAddStudents,
}: MentorCardProps) {
  const qc = useQueryClient();

  const removeMut = useMutation({
    mutationFn: (studentId: number) => userService.removeMentorRelation(teacher.id, studentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mentor-students', teacher.id] });
    },
  });

  const profile = teacher.profile as {
    employee_id?: string;
    department?: string;
    title?: string;
  } | null;

  return (
    <div
      className="border border-[#F0EDE8] rounded-2xl bg-white/50 p-5"
      style={{
        animation: `appleFadeUp 0.55s cubic-bezier(0.25, 1, 0.5, 1) ${animationDelay}ms both`,
      }}
    >
      {/* 教师信息头 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-semibold text-white select-none shrink-0">
            {(teacher.display_name || teacher.username).slice(0, 1)}
          </div>
          <div>
            <span className="text-sm font-semibold text-[#334155]">
              {teacher.display_name || teacher.username}
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              {profile?.employee_id && (
                <span className="text-[11px] text-[#9A9A9A] font-mono">{profile.employee_id}</span>
              )}
              {profile?.department && (
                <span className="text-[11px] text-[#9A9A9A]">{profile.department}</span>
              )}
              {profile?.title && (
                <span className="text-[11px] text-[#9A9A9A]">{profile.title}</span>
              )}
            </div>
          </div>
        </div>
        <span className="text-xs text-[#9A9A9A]">
          {isLoadingStudents ? '...' : `${students.length} 名学生`}
        </span>
      </div>

      {/* 学生标签区 */}
      <div className="flex flex-wrap items-center gap-2">
        {isLoadingStudents ? (
          <span className="text-xs text-[#C0BDB8]">加载中...</span>
        ) : students.length === 0 ? (
          <span className="text-xs text-[#C0BDB8]">暂无学生</span>
        ) : (
          students.map((s) => {
            const sp = s.profile as { student_id?: string } | null;
            return (
              <span
                key={s.id}
                className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg bg-[#F2EFE9] text-xs text-[#4A4A4A] font-medium group"
              >
                {s.display_name || '—'}
                {sp?.student_id && (
                  <span className="text-[#9A9A9A] font-mono text-[10px]">{sp.student_id}</span>
                )}
                <button
                  onClick={() => removeMut.mutate(s.id)}
                  className="ml-0.5 p-0.5 rounded text-[#C0BDB8] hover:text-red-400 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                  title="解绑"
                >
                  <X size={12} />
                </button>
              </span>
            );
          })
        )}
        <button
          onClick={() => onAddStudents(teacher)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-dashed border-[#D8D4CC] text-xs text-[#9A9A9A] hover:text-[#334155] hover:border-slate-400 transition-colors"
        >
          <UserPlus size={12} /> 添加学生
        </button>
      </div>
    </div>
  );
}
