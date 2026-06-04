import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { userService } from '../services/userService';
import { userKeys } from '../hooks/queryKeys';
import { extractError } from '@shared/lib/errorHandler';
import type { UserInfo, UserCreate, StudentProfileCreate } from '@shared/types/api';

export { ResetPasswordModal } from './ResetPasswordModal';

// ── 创建学生弹窗 ──────────────────────────────────────────────

export function CreateStudentModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Omit<UserCreate, 'username'> & Partial<StudentProfileCreate>>({
    password: '',
    display_name: '',
    role: 'student',
    student_id: '',
    grade: '',
    major: '',
    class_name: '',
  });
  const [error, setError] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: async () => {
      const user = await userService.create({
        username: form.student_id ?? '',
        password: form.password,
        display_name: form.display_name,
        role: 'student',
      });
      await userService.updateStudentProfile(user.id, {
        student_id: form.student_id ?? '',
        grade: form.grade ?? '',
        major: form.major ?? '',
        class_name: form.class_name ?? '',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userKeys.all() });
      onClose();
    },
    onError: (err) => setError(extractError(err)),
  });

  const field = (key: keyof typeof form, label: string, placeholder: string, type = 'text') => (
    <div key={key} className="flex flex-col gap-1">
      <label className="text-xs text-[#6A6A6A] font-medium">{label}</label>
      <input
        type={type}
        value={(form[key] as string) ?? ''}
        onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
        placeholder={placeholder}
        className="px-3 py-2 rounded-lg border border-[#E8E5E0] bg-[#FAFAF9] text-sm outline-none focus:border-slate-400 transition"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-apple-fade">
      <div className="glass-card rounded-2xl p-6 w-full max-w-md animate-apple-pop">
        <h2 className="text-base font-semibold text-[#334155] mb-4">添加学生账号</h2>
        <div className="flex flex-col gap-3">
          {field('student_id', '学号 *', '如 202212345678')}
          {field('password', '初始密码 *', '至少 6 位', 'password')}
          {field('display_name', '姓名', '学生真实姓名')}
          <div className="flex gap-3">
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-xs text-[#6A6A6A] font-medium">年级</label>
              <input
                type="text"
                value={form.grade ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, grade: e.target.value }))}
                placeholder="如 2022"
                className="px-3 py-2 rounded-lg border border-[#E8E5E0] bg-[#FAFAF9] text-sm outline-none focus:border-slate-400 transition"
              />
            </div>
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-xs text-[#6A6A6A] font-medium">班级</label>
              <input
                type="text"
                value={form.class_name ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, class_name: e.target.value }))}
                placeholder="如 计科一班"
                className="px-3 py-2 rounded-lg border border-[#E8E5E0] bg-[#FAFAF9] text-sm outline-none focus:border-slate-400 transition"
              />
            </div>
          </div>
          {field('major', '专业', '如 计算机科学与技术')}
        </div>
        {error && (
          <div className="mt-3 text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</div>
        )}
        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[#6A6A6A]">
            取消
          </button>
          <button
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending || !form.student_id || !form.password}
            className="px-4 py-2 bg-slate-700 text-white text-sm rounded-xl hover:bg-slate-800 disabled:opacity-50 transition"
          >
            {createMut.isPending ? '创建中...' : '创建'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 编辑学生弹窗 ──────────────────────────────────────────────

export function EditStudentModal({ user, onClose }: { user: UserInfo; onClose: () => void }) {
  const qc = useQueryClient();
  const profile = user.profile as {
    student_id?: string;
    grade?: string;
    major?: string;
    class_name?: string;
  } | null;
  const [form, setForm] = useState({
    display_name: user.display_name || '',
    student_id: profile?.student_id || '',
    grade: profile?.grade || '',
    major: profile?.major || '',
    class_name: profile?.class_name || '',
  });
  const [error, setError] = useState<string | null>(null);

  const editMut = useMutation({
    mutationFn: async () => {
      await userService.update(user.id, { display_name: form.display_name });
      await userService.updateStudentProfile(user.id, {
        student_id: form.student_id,
        grade: form.grade,
        major: form.major,
        class_name: form.class_name,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userKeys.all() });
      onClose();
    },
    onError: (err) => setError(extractError(err)),
  });

  const field = (key: keyof typeof form, label: string, placeholder: string) => (
    <div key={key} className="flex flex-col gap-1">
      <label className="text-xs text-[#6A6A6A] font-medium">{label}</label>
      <input
        type="text"
        value={form[key]}
        onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
        placeholder={placeholder}
        className="px-3 py-2 rounded-lg border border-[#E8E5E0] bg-[#FAFAF9] text-sm outline-none focus:border-slate-400 transition"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-apple-fade">
      <div className="glass-card rounded-2xl p-6 w-full max-w-md animate-apple-pop">
        <h2 className="text-base font-semibold text-[#334155] mb-4">编辑学生信息</h2>
        <div className="flex flex-col gap-3">
          {field('student_id', '学号', '如 202212345678')}
          {field('display_name', '姓名', '学生真实姓名')}
          <div className="flex gap-3">
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-xs text-[#6A6A6A] font-medium">年级</label>
              <input
                type="text"
                value={form.grade}
                onChange={(e) => setForm((p) => ({ ...p, grade: e.target.value }))}
                placeholder="如 2022"
                className="px-3 py-2 rounded-lg border border-[#E8E5E0] bg-[#FAFAF9] text-sm outline-none focus:border-slate-400 transition"
              />
            </div>
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-xs text-[#6A6A6A] font-medium">班级</label>
              <input
                type="text"
                value={form.class_name}
                onChange={(e) => setForm((p) => ({ ...p, class_name: e.target.value }))}
                placeholder="如 计科一班"
                className="px-3 py-2 rounded-lg border border-[#E8E5E0] bg-[#FAFAF9] text-sm outline-none focus:border-slate-400 transition"
              />
            </div>
          </div>
          {field('major', '专业', '如 计算机科学与技术')}
        </div>
        {error && (
          <div className="mt-3 text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</div>
        )}
        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[#6A6A6A]">
            取消
          </button>
          <button
            onClick={() => editMut.mutate()}
            disabled={editMut.isPending || !form.student_id}
            className="px-4 py-2 bg-slate-700 text-white text-sm rounded-xl hover:bg-slate-800 disabled:opacity-50 transition"
          >
            {editMut.isPending ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
