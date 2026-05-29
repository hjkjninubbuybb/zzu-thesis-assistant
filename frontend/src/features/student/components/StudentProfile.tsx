import { useState, type FormEvent, type CSSProperties } from "react";
import {
  User,
  GraduationCap,
  BookOpen,
  Users,
  Hash,
  Lock,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import type { StudentProfile as StudentProfileType } from "@shared/types/api";
import { getErrorMessage } from "@shared/lib/errorHandler";
import { useStudentProfile } from "../hooks/useStudentProfile";

const cardStyle = (delay: number): CSSProperties => ({
  animation: `fadeSlideUp 0.55s cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms both`,
});

export function StudentProfile() {
  const { user, changePassword, isChangingPassword } = useStudentProfile();
  const profile = user?.profile as StudentProfileType | null | undefined;
  const displayName = user?.display_name || user?.username || "同学";
  const avatarChar = displayName.slice(0, 1).toUpperCase();

  const infoItems = [
    { icon: User, label: "姓名", value: displayName },
    {
      icon: Hash,
      label: "学号",
      value: profile?.student_id || user?.username || "-",
    },
    { icon: GraduationCap, label: "年级", value: profile?.grade || "-" },
    { icon: BookOpen, label: "专业", value: profile?.major || "-" },
    { icon: Users, label: "班级", value: profile?.class_name || "-" },
  ];

  return (
    <div className="p-7 flex-1 overflow-y-auto glass-card rounded-2xl">
      <div className="max-w-lg mx-auto">
        {/* 头像 + 姓名 */}
        <div className="flex flex-col items-center mb-8" style={cardStyle(0)}>
          <div className="w-20 h-20 rounded-full bg-blue-500 flex items-center justify-center text-2xl font-bold text-white select-none mb-3 shadow-lg">
            {avatarChar}
          </div>
          <h1 className="text-xl font-semibold text-[#202938]">
            {displayName}
          </h1>
          <p className="text-sm text-[#6E7787] mt-0.5">
            {profile?.major ? `${profile.grade} · ${profile.major}` : "学生"}
          </p>
        </div>

        {/* 个人信息卡 */}
        <div className="glass-card rounded-2xl p-5 mb-5" style={cardStyle(100)}>
          <h2 className="text-sm font-semibold text-[#202938] mb-4">
            个人信息
          </h2>
          <div className="flex flex-col gap-3">
            {infoItems.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#EEF2FF] flex items-center justify-center shrink-0">
                  <Icon
                    size={16}
                    className="text-[#2563EB]"
                    strokeWidth={1.8}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-[#9CA3AF] uppercase tracking-wider">
                    {label}
                  </p>
                  <p className="text-sm font-medium text-[#202938] truncate">
                    {value}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 修改密码 */}
        <ChangePasswordCard
          onSubmit={(oldPwd, newPwd, callbacks) =>
            changePassword({ oldPwd, newPwd }, callbacks)
          }
          isLoading={isChangingPassword}
        />
      </div>
    </div>
  );
}

interface ChangePasswordCardProps {
  onSubmit: (
    oldPwd: string,
    newPwd: string,
    callbacks: { onSuccess: () => void; onError: (err: unknown) => void },
  ) => void;
  isLoading: boolean;
}

function ChangePasswordCard({ onSubmit, isLoading }: ChangePasswordCardProps) {
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const canSubmit =
    oldPwd.trim() &&
    newPwd.trim() &&
    newPwd === confirmPwd &&
    newPwd.length >= 6;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLocalError(null);
    setSuccess(false);
    onSubmit(oldPwd, newPwd, {
      onSuccess: () => {
        setSuccess(true);
        setOldPwd("");
        setNewPwd("");
        setConfirmPwd("");
      },
      onError: (err) => setLocalError(getErrorMessage(err)),
    });
  };

  return (
    <div className="glass-card rounded-2xl p-5" style={cardStyle(200)}>
      <div className="flex items-center gap-2 mb-4">
        <Lock size={16} className="text-[#2563EB]" strokeWidth={1.8} />
        <h2 className="text-sm font-semibold text-[#202938]">修改密码</h2>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="password"
          value={oldPwd}
          onChange={(e) => setOldPwd(e.target.value)}
          placeholder="当前密码"
          autoComplete="current-password"
          className="px-3 py-2.5 rounded-xl border border-[#D9DEE5] bg-[#F8F9FB] text-sm text-[#202938] placeholder:text-[#9CA3AF] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 focus:bg-white transition"
          disabled={isLoading}
        />
        <input
          type="password"
          value={newPwd}
          onChange={(e) => setNewPwd(e.target.value)}
          placeholder="新密码（至少 6 位）"
          autoComplete="new-password"
          className="px-3 py-2.5 rounded-xl border border-[#D9DEE5] bg-[#F8F9FB] text-sm text-[#202938] placeholder:text-[#9CA3AF] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 focus:bg-white transition"
          disabled={isLoading}
        />
        <input
          type="password"
          value={confirmPwd}
          onChange={(e) => setConfirmPwd(e.target.value)}
          placeholder="确认新密码"
          autoComplete="new-password"
          className="px-3 py-2.5 rounded-xl border border-[#D9DEE5] bg-[#F8F9FB] text-sm text-[#202938] placeholder:text-[#9CA3AF] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 focus:bg-white transition"
          disabled={isLoading}
        />

        {newPwd && confirmPwd && newPwd !== confirmPwd && (
          <p className="text-xs text-red-500">两次输入的密码不一致</p>
        )}

        {localError && (
          <div className="flex items-center gap-2 text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            <AlertCircle size={12} />
            {localError}
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
            <CheckCircle2 size={12} />
            密码修改成功
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit || isLoading}
          className="mt-1 w-full py-2.5 bg-[#2563EB] text-white text-sm font-medium rounded-xl hover:bg-[#1D4ED8] active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? "修改中..." : "确认修改"}
        </button>
      </form>
    </div>
  );
}
