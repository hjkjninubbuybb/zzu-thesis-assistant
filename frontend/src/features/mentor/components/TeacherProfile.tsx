// frontend/src/features/mentor/components/TeacherProfile.tsx
import { useState } from 'react';
import { useAuthUser } from '@shared/store/authStore';
import { useUpdateProfile } from '../hooks/useUpdateProfile';

export function TeacherProfile() {
  const user = useAuthUser();
  const { updateProfile, isUpdating, changePassword, isChangingPassword } = useUpdateProfile();

  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');

  if (!user) return null;

  const handleProfileSave = () => {
    const payload: { display_name?: string } = {};
    if (displayName.trim() && displayName !== user.display_name)
      payload.display_name = displayName.trim();
    if (Object.keys(payload).length === 0) return;
    updateProfile(payload);
  };

  const handlePwdSave = () => {
    if (!oldPwd || !newPwd) return;
    if (newPwd !== confirmPwd) {
      alert('两次输入的新密码不一致');
      return;
    }
    changePassword({ oldPassword: oldPwd, newPassword: newPwd });
    setOldPwd('');
    setNewPwd('');
    setConfirmPwd('');
  };

  return (
    <div className="px-8 py-8 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-4">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-[#1F2937]">个人中心</h1>
        <p className="mt-1 text-sm text-[#6F7A75]">编辑显示名、修改密码</p>
      </div>

      <div className="glass-card rounded-2xl p-6 flex flex-col gap-4 max-w-xl">
        <div className="text-sm font-semibold text-[#1F2937]">基础资料</div>
        <Field label="用户名（只读）" value={user.username} readOnly />
        <LabeledInput label="显示名" value={displayName} onChange={setDisplayName} />
        <button
          onClick={handleProfileSave}
          disabled={isUpdating}
          className="self-start mt-2 px-4 py-2 bg-[#0F766E] text-white text-sm rounded-xl hover:bg-[#0E6B61] disabled:opacity-50 transition"
        >
          {isUpdating ? '保存中...' : '保存资料'}
        </button>
      </div>

      <div className="glass-card rounded-2xl p-6 flex flex-col gap-4 max-w-xl">
        <div className="text-sm font-semibold text-[#1F2937]">修改密码</div>
        <LabeledInput label="原密码" value={oldPwd} onChange={setOldPwd} type="password" />
        <LabeledInput label="新密码" value={newPwd} onChange={setNewPwd} type="password" />
        <LabeledInput
          label="确认新密码"
          value={confirmPwd}
          onChange={setConfirmPwd}
          type="password"
        />
        <button
          onClick={handlePwdSave}
          disabled={isChangingPassword || !oldPwd || !newPwd}
          className="self-start mt-2 px-4 py-2 bg-[#0F766E] text-white text-sm rounded-xl hover:bg-[#0E6B61] disabled:opacity-50 transition"
        >
          {isChangingPassword ? '提交中...' : '修改密码'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, readOnly }: { label: string; value: string; readOnly?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-[#6F7A75]">{label}</label>
      <input
        value={value}
        readOnly={readOnly}
        className="px-3 py-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-sm text-[#1F2937]"
      />
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-[#6F7A75]">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        className="px-3 py-2 rounded-xl border border-[#D5DDD9] bg-white text-sm text-[#1F2937] outline-none focus:border-[#0F766E] focus:ring-2 focus:ring-[#0F766E]/20 transition"
      />
    </div>
  );
}
