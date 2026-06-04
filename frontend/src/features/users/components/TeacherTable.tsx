import { useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, UserCheck, UserX, KeyRound, Trash2, Pencil } from 'lucide-react';
import type { UserInfo } from '@shared/types/api';

interface TeacherTableProps {
  teachers: UserInfo[];
  menuOpen: number | null;
  onMenuToggle: (id: number | null) => void;
  onEdit: (user: UserInfo) => void;
  onToggleActive: (user: UserInfo) => void;
  onResetPassword: (user: UserInfo) => void;
  onDelete: (user: UserInfo) => void;
}

export function TeacherTable({
  teachers,
  menuOpen,
  onMenuToggle,
  onEdit,
  onToggleActive,
  onResetPassword,
  onDelete,
}: TeacherTableProps) {
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);

  const openUser = menuOpen !== null ? (teachers.find((u) => u.id === menuOpen) ?? null) : null;

  return (
    <>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#F0EDE8] bg-[#FAFAF9]/50">
            {['姓名', '工号', '院系', '职称', '状态', '创建时间', ''].map((h) => (
              <th
                key={h}
                className="text-left px-5 py-3.5 text-xs text-[#9A9A9A] font-bold uppercase tracking-wider"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {teachers.map((u, i) => {
            const profile = u.profile as {
              employee_id?: string;
              department?: string;
              title?: string;
            } | null;
            return (
              <tr
                key={u.id}
                className="border-b border-[#F8F6F3] hover:bg-white transition-colors"
                style={{
                  animation: `appleFadeUp 0.55s cubic-bezier(0.25, 1, 0.5, 1) ${Math.min(160 + i * 45, 600)}ms both`,
                }}
              >
                <td className="px-5 py-4 font-semibold text-[#334155]">{u.display_name || '—'}</td>
                <td className="px-5 py-4 text-[#4A4A4A] font-mono text-xs">
                  {profile?.employee_id || '—'}
                </td>
                <td className="px-5 py-4 text-[#6A6A6A]">{profile?.department || '—'}</td>
                <td className="px-5 py-4 text-[#6A6A6A]">{profile?.title || '—'}</td>
                <td className="px-5 py-4">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                      u.is_active
                        ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                        : 'bg-red-50 text-red-500 border border-red-100'
                    }`}
                  >
                    {u.is_active ? '正常' : '禁用'}
                  </span>
                </td>
                <td className="px-5 py-4 text-[#9A9A9A] text-xs">
                  {String(u.created_at).slice(0, 10)}
                </td>
                <td className="px-5 py-4 text-right">
                  <div className="flex justify-end items-center gap-1">
                    <button
                      onClick={(e) => {
                        if (menuOpen === u.id) {
                          onMenuToggle(null);
                        } else {
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setMenuPos({
                            top: rect.bottom + 4,
                            right: window.innerWidth - rect.right,
                          });
                          onMenuToggle(u.id);
                        }
                      }}
                      className="p-1.5 text-[#C0BDB8] hover:text-[#334155] transition-colors rounded-lg hover:bg-[#F2EFE9]"
                    >
                      <MoreHorizontal size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {openUser &&
        menuPos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => onMenuToggle(null)} />
            <div
              className="fixed z-50 bg-white border border-[#F0EDE8] rounded-xl shadow-xl py-1 min-w-[140px] animate-apple-pop"
              style={{
                top: menuPos.top,
                right: menuPos.right,
                transformOrigin: 'top right',
              }}
            >
              <button
                onClick={() => {
                  onEdit(openUser);
                  onMenuToggle(null);
                }}
                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs text-[#4A4A4A] hover:bg-[#F8F6F2] transition-colors"
              >
                <Pencil size={13} className="text-[#8A8A8A]" />
                编辑信息
              </button>
              <button
                onClick={() => {
                  onToggleActive(openUser);
                  onMenuToggle(null);
                }}
                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs text-[#4A4A4A] hover:bg-[#F8F6F2] transition-colors"
              >
                {openUser.is_active ? (
                  <>
                    <UserX size={13} className="text-[#8A8A8A]" /> 禁用账号
                  </>
                ) : (
                  <>
                    <UserCheck size={13} className="text-[#8A8A8A]" /> 启用账号
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  onResetPassword(openUser);
                  onMenuToggle(null);
                }}
                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs text-[#4A4A4A] hover:bg-[#F8F6F2] transition-colors"
              >
                <KeyRound size={13} className="text-[#8A8A8A]" />
                重置密码
              </button>
              <div className="h-px bg-[#F0EDE8] my-1" />
              <button
                onClick={() => {
                  onDelete(openUser);
                  onMenuToggle(null);
                }}
                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs text-red-500 hover:bg-red-50 transition-colors"
              >
                <Trash2 size={13} />
                删除账号
              </button>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
