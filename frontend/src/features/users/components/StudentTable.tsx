import {
  MoreHorizontal,
  UserCheck,
  UserX,
  KeyRound,
  Trash2,
  Pencil,
} from "lucide-react";
import type { UserInfo } from "@shared/types/api";

interface StudentTableProps {
  students: UserInfo[];
  menuOpen: number | null;
  isAdmin: boolean;
  onMenuToggle: (id: number | null) => void;
  onEdit: (user: UserInfo) => void;
  onToggleActive: (user: UserInfo) => void;
  onResetPassword: (user: UserInfo) => void;
  onDelete: (user: UserInfo) => void;
}

export function StudentTable({
  students,
  menuOpen,
  isAdmin,
  onMenuToggle,
  onEdit,
  onToggleActive,
  onResetPassword,
  onDelete,
}: StudentTableProps) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-[#F0EDE8] bg-[#FAFAF9]/50">
          {["姓名", "学号", "年级/专业", "状态", "创建时间", ""].map((h) => (
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
        {students.map((u, i) => {
          const profile = u.profile as {
            student_id?: string;
            grade?: string;
            major?: string;
          } | null;
          return (
            <tr
              key={u.id}
              className="border-b border-[#F8F6F3] hover:bg-white transition-colors"
              style={{
                animation: `appleFadeUp 0.55s cubic-bezier(0.25, 1, 0.5, 1) ${Math.min(160 + i * 45, 600)}ms both`,
              }}
            >
              <td className="px-5 py-4 font-semibold text-[#334155]">
                {u.display_name || "—"}
              </td>
              <td className="px-5 py-4 text-[#4A4A4A] font-mono text-xs">
                {profile?.student_id || "—"}
              </td>
              <td className="px-5 py-4 text-[#6A6A6A]">
                {profile?.grade && profile?.major
                  ? `${profile.grade}级 · ${profile.major}`
                  : "—"}
              </td>
              <td className="px-5 py-4">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    u.is_active
                      ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
                      : "bg-red-50 text-red-500 border border-red-100"
                  }`}
                >
                  {u.is_active ? "正常" : "禁用"}
                </span>
              </td>
              <td className="px-5 py-4 text-[#9A9A9A] text-xs">
                {String(u.created_at).slice(0, 10)}
              </td>
              <td className="px-5 py-4 text-right">
                <div className="flex justify-end items-center gap-1">
                  <button
                    onClick={() =>
                      onMenuToggle(menuOpen === u.id ? null : u.id)
                    }
                    className="p-1.5 text-[#C0BDB8] hover:text-[#334155] transition-colors rounded-lg hover:bg-[#F2EFE9]"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                </div>
                {menuOpen === u.id && (
                  <div
                    className="absolute right-10 z-20 bg-white border border-[#F0EDE8] rounded-xl shadow-xl py-1 min-w-[140px] overflow-hidden animate-apple-pop"
                    style={{ transformOrigin: "top right" }}
                    onMouseLeave={() => onMenuToggle(null)}
                  >
                    <button
                      onClick={() => {
                        onEdit(u);
                        onMenuToggle(null);
                      }}
                      className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs text-[#4A4A4A] hover:bg-[#F8F6F2] transition-colors"
                    >
                      <Pencil size={13} className="text-[#8A8A8A]" />
                      编辑信息
                    </button>
                    <button
                      onClick={() => {
                        onToggleActive(u);
                        onMenuToggle(null);
                      }}
                      className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs text-[#4A4A4A] hover:bg-[#F8F6F2] transition-colors"
                    >
                      {u.is_active ? (
                        <>
                          <UserX size={13} className="text-[#8A8A8A]" />{" "}
                          禁用账号
                        </>
                      ) : (
                        <>
                          <UserCheck size={13} className="text-[#8A8A8A]" />{" "}
                          启用账号
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        onResetPassword(u);
                        onMenuToggle(null);
                      }}
                      className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs text-[#4A4A4A] hover:bg-[#F8F6F2] transition-colors"
                    >
                      <KeyRound size={13} className="text-[#8A8A8A]" />
                      重置密码
                    </button>
                    {isAdmin && (
                      <>
                        <div className="h-px bg-[#F0EDE8] my-1" />
                        <button
                          onClick={() => {
                            onDelete(u);
                            onMenuToggle(null);
                          }}
                          className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={13} />
                          删除账号
                        </button>
                      </>
                    )}
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
