import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { userService } from '../services/userService';
import { extractError } from '@shared/lib/errorHandler';
import type { UserInfo } from '@shared/types/api';

export function ResetPasswordModal({ user, onClose }: { user: UserInfo; onClose: () => void }) {
  const [pwd, setPwd] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () => userService.resetPassword(user.id, pwd),
    onSuccess: onClose,
    onError: (err) => setError(extractError(err)),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-apple-fade">
      <div className="glass-card rounded-2xl p-6 w-full max-w-sm animate-apple-pop">
        <h2 className="text-base font-semibold text-[#334155] mb-1">重置密码</h2>
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
          <button onClick={onClose} className="px-4 py-2 text-sm text-[#6A6A6A]">
            取消
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || pwd.length < 6}
            className="px-4 py-2 bg-slate-700 text-white text-sm rounded-xl hover:bg-slate-800 disabled:opacity-50 transition"
          >
            {mut.isPending ? '重置中...' : '确认重置'}
          </button>
        </div>
      </div>
    </div>
  );
}
