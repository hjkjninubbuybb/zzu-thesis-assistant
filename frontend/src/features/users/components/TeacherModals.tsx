import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { userService } from "../services/userService";
import { userKeys } from "../hooks/queryKeys";
import { extractError } from "@shared/lib/api";
import type {
  UserInfo,
  UserCreate,
  TeacherProfileCreate,
} from "@shared/types/api";

// ── 创建教师弹窗 ──────────────────────────────────────────────

export function CreateTeacherModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<
    Omit<UserCreate, "username"> & Partial<TeacherProfileCreate>
  >({
    password: "",
    display_name: "",
    role: "teacher",
    employee_id: "",
    department: "",
    title: "",
  });
  const [error, setError] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: async () => {
      const user = await userService.create({
        username: form.employee_id ?? "",
        password: form.password,
        display_name: form.display_name,
        role: "teacher",
      });
      await userService.updateTeacherProfile(user.id, {
        employee_id: form.employee_id ?? "",
        department: form.department ?? "",
        title: form.title ?? "",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userKeys.all() });
      onClose();
    },
    onError: (err) => setError(extractError(err)),
  });

  const field = (
    key: keyof typeof form,
    label: string,
    placeholder: string,
    type = "text",
  ) => (
    <div key={key} className="flex flex-col gap-1">
      <label className="text-xs text-[#6A6A6A] font-medium">{label}</label>
      <input
        type={type}
        value={(form[key] as string) ?? ""}
        onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
        placeholder={placeholder}
        className="px-3 py-2 rounded-lg border border-[#E8E5E0] bg-[#FAFAF9] text-sm outline-none focus:border-slate-400 transition"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-apple-fade">
      <div className="glass-card rounded-2xl p-6 w-full max-w-md animate-apple-pop">
        <h2 className="text-base font-semibold text-[#334155] mb-4">
          添加教师账号
        </h2>
        <div className="flex flex-col gap-3">
          {field("employee_id", "工号 *", "如 T2022001")}
          {field("password", "初始密码 *", "至少 6 位", "password")}
          {field("display_name", "姓名", "教师真实姓名")}
          {field("department", "院系", "如 计算机学院")}
          {field("title", "职称", "如 教授、副教授")}
        </div>
        {error && (
          <div className="mt-3 text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        <div className="flex gap-2 mt-5 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-[#6A6A6A]"
          >
            取消
          </button>
          <button
            onClick={() => createMut.mutate()}
            disabled={
              createMut.isPending || !form.employee_id || !form.password
            }
            className="px-4 py-2 bg-slate-700 text-white text-sm rounded-xl hover:bg-slate-800 disabled:opacity-50 transition"
          >
            {createMut.isPending ? "创建中..." : "创建"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 编辑教师弹窗 ──────────────────────────────────────────────

export function EditTeacherModal({
  user,
  onClose,
}: {
  user: UserInfo;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const profile = user.profile as {
    employee_id?: string;
    department?: string;
    title?: string;
  } | null;
  const [form, setForm] = useState({
    display_name: user.display_name || "",
    employee_id: profile?.employee_id || "",
    department: profile?.department || "",
    title: profile?.title || "",
  });
  const [error, setError] = useState<string | null>(null);

  const editMut = useMutation({
    mutationFn: async () => {
      await userService.update(user.id, { display_name: form.display_name });
      await userService.updateTeacherProfile(user.id, {
        employee_id: form.employee_id,
        department: form.department,
        title: form.title,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userKeys.all() });
      onClose();
    },
    onError: (err) => setError(extractError(err)),
  });

  const field = (
    key: keyof typeof form,
    label: string,
    placeholder: string,
  ) => (
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
        <h2 className="text-base font-semibold text-[#334155] mb-4">
          编辑教师信息
        </h2>
        <div className="flex flex-col gap-3">
          {field("employee_id", "工号", "如 T2022001")}
          {field("display_name", "姓名", "教师真实姓名")}
          {field("department", "院系", "如 计算机学院")}
          {field("title", "职称", "如 教授、副教授")}
        </div>
        {error && (
          <div className="mt-3 text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        <div className="flex gap-2 mt-5 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-[#6A6A6A]"
          >
            取消
          </button>
          <button
            onClick={() => editMut.mutate()}
            disabled={editMut.isPending || !form.employee_id}
            className="px-4 py-2 bg-slate-700 text-white text-sm rounded-xl hover:bg-slate-800 disabled:opacity-50 transition"
          >
            {editMut.isPending ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 重置密码弹窗 ──────────────────────────────────────────────

export function TeacherResetPasswordModal({
  user,
  onClose,
}: {
  user: UserInfo;
  onClose: () => void;
}) {
  const [pwd, setPwd] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () => userService.resetPassword(user.id, pwd),
    onSuccess: onClose,
    onError: (err) => setError(extractError(err)),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-apple-fade">
      <div className="glass-card rounded-2xl p-6 w-full max-w-sm animate-apple-pop">
        <h2 className="text-base font-semibold text-[#334155] mb-1">
          重置密码
        </h2>
        <p className="text-xs text-[#9A9A9A] mb-4">
          为 <b>{user.display_name || user.username}</b> 设置新密码
        </p>
        <input
          type="password"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          placeholder="新密码（至少 6 位）"
          className="w-full px-3 py-2 rounded-lg border border-[#E8E5E0] bg-[#FAFAF9] text-sm outline-none focus:border-slate-400 transition"
        />
        {error && <div className="mt-2 text-xs text-red-500">{error}</div>}
        <div className="flex gap-2 mt-4 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-[#6A6A6A]"
          >
            取消
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || pwd.length < 6}
            className="px-4 py-2 bg-slate-700 text-white text-sm rounded-xl hover:bg-slate-800 disabled:opacity-50 transition"
          >
            {mut.isPending ? "重置中..." : "确认重置"}
          </button>
        </div>
      </div>
    </div>
  );
}
