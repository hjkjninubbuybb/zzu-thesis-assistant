import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { userService } from '../services/userService';
import type { UserInfo } from '@shared/types/api';

interface AddStudentsModalProps {
  mentor: UserInfo;
  existingStudentIds: Set<number>;
  onClose: () => void;
}

export function AddStudentsModal({ mentor, existingStudentIds, onClose }: AddStudentsModalProps) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const { data } = useQuery({
    queryKey: ['users', 'student', 'all-for-bind'],
    queryFn: () => userService.list({ role: 'student', page: 1, page_size: 500 }),
  });

  const addMut = useMutation({
    mutationFn: () => userService.addMentorRelations(mentor.id, Array.from(selected)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mentor-students', mentor.id] });
      onClose();
    },
  });

  const allStudents = data?.items ?? [];
  const available = allStudents.filter((s) => !existingStudentIds.has(s.id));
  const filtered = search.trim()
    ? available.filter((s) => {
        const profile = s.profile as { student_id?: string } | null;
        return s.display_name.includes(search) || (profile?.student_id ?? '').includes(search);
      })
    : available;

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-apple-fade">
      <div className="glass-card rounded-2xl p-6 w-full max-w-md animate-apple-pop flex flex-col max-h-[80vh]">
        <h2 className="text-base font-semibold text-[#334155] mb-1">
          为 {mentor.display_name || mentor.username} 添加学生
        </h2>
        <p className="text-xs text-[#9A9A9A] mb-3">勾选要绑定的学生，可多选</p>

        <div className="relative mb-3">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#C0BDB8]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索姓名或学号..."
            className="w-full pl-8 pr-4 py-2 rounded-lg border border-[#E8E5E0] bg-[#FAFAF9] text-sm outline-none focus:border-slate-400 transition"
          />
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar border border-[#F0EDE8] rounded-xl divide-y divide-[#F8F6F3]">
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-[#9A9A9A]">
              {search ? '没有匹配的学生' : '暂无可绑定的学生'}
            </div>
          ) : (
            filtered.map((s) => {
              const profile = s.profile as { student_id?: string } | null;
              return (
                <label
                  key={s.id}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#F8F6F2] cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => toggle(s.id)}
                    className="accent-slate-700"
                  />
                  <span className="text-sm text-[#334155] font-medium">
                    {s.display_name || '—'}
                  </span>
                  <span className="text-xs text-[#9A9A9A] font-mono">
                    {profile?.student_id || ''}
                  </span>
                </label>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-[#9A9A9A]">已选 {selected.size} 人</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-[#6A6A6A]">
              取消
            </button>
            <button
              onClick={() => addMut.mutate()}
              disabled={addMut.isPending || selected.size === 0}
              className="px-4 py-2 bg-slate-700 text-white text-sm rounded-xl hover:bg-slate-800 disabled:opacity-50 transition"
            >
              {addMut.isPending ? '绑定中...' : '确认绑定'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
