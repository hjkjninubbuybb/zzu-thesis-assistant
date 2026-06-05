import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthUser, useAuthLogout } from '@shared/store/authStore';
import BlobBackdrop from '@shared/components/layout/BlobBackdrop';
import { useLogin } from '../hooks/useLogin';
import type { Portal } from '@shared/lib/auth';

interface LoginFormProps {
  variant: 'admin' | 'teacher' | 'student';
}

export function LoginForm({ variant }: LoginFormProps) {
  const navigate = useNavigate();
  const user = useAuthUser();
  const logout = useAuthLogout();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const portal: Portal =
    variant === 'student' ? 'student' : variant === 'teacher' ? 'teacher' : 'admin';
  const mutation = useLogin(portal);

  // 已登录的用户访问登录页时：角色匹配则直接跳转，否则清除会话
  useEffect(() => {
    if (!user) return;
    if (variant === 'student' && user.role === 'student') {
      navigate('/student', { replace: true });
    } else if (variant === 'teacher' && user.role === 'teacher') {
      navigate('/teacher', { replace: true });
    } else if (variant === 'admin' && user.role === 'admin') {
      navigate('/admin', { replace: true });
    } else {
      // 角色与登录页不匹配，清除旧会话
      logout();
    }
  }, [user, variant, navigate, logout]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    mutation.mutate({ username: username.trim(), password });
  };

  const settle = (d: number): React.CSSProperties => ({
    animation: `appleSettleIn 0.8s cubic-bezier(0.25, 1, 0.5, 1) ${d}ms both`,
  });

  const errorMessage =
    mutation.isError && mutation.error instanceof Error
      ? mutation.error.message
      : mutation.isError
        ? '登录失败，请检查用户名和密码'
        : null;

  if (variant === 'teacher') {
    return (
      <div
        data-theme="teacher"
        className="relative flex-1 flex items-center justify-center p-4 flex-col gap-6 overflow-hidden"
        style={{ background: 'hsl(150 18% 93%)' }}
      >
        <BlobBackdrop variant="cool" intensity="hero" />
        <div className="glass-card relative z-10 w-full max-w-sm rounded-2xl p-8" style={settle(0)}>
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-[#0F766E] rounded-xl flex items-center justify-center shadow-sm shrink-0">
              <span className="text-white text-sm font-bold tracking-tight">R</span>
            </div>
            <div>
              <div className="text-sm font-semibold text-[#1F2937] tracking-tight">RAG 1.0</div>
              <div className="text-xs text-[#6F7A75]">导师工作台</div>
            </div>
          </div>

          <h1 className="text-xl font-semibold text-[#1F2937] mb-6">你好，老师</h1>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-[#4A5568] font-medium">工号</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入工号"
                autoComplete="username"
                className="px-3 py-2.5 rounded-xl border border-[#D5DDD9] bg-[#F8FAF9] text-sm text-[#1F2937] placeholder:text-[#9CA3AF] outline-none focus:border-[#0F766E] focus:ring-2 focus:ring-[#0F766E]/20 focus:bg-white transition"
                disabled={mutation.isPending}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-[#4A5568] font-medium">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                autoComplete="current-password"
                className="px-3 py-2.5 rounded-xl border border-[#D5DDD9] bg-[#F8FAF9] text-sm text-[#1F2937] placeholder:text-[#9CA3AF] outline-none focus:border-[#0F766E] focus:ring-2 focus:ring-[#0F766E]/20 focus:bg-white transition"
                disabled={mutation.isPending}
              />
            </div>

            {errorMessage && (
              <div className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={mutation.isPending || !username.trim() || !password.trim()}
              className="mt-2 w-full py-2.5 bg-[#0F766E] text-white text-sm font-medium rounded-xl hover:bg-[#0E6B61] active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {mutation.isPending ? '登录中...' : '登录'}
            </button>
          </form>
        </div>

        <div className="relative z-10 flex gap-4 text-xs text-[#6F7A75]" style={settle(150)}>
          <Link to="/admin/login" className="hover:text-[#0F766E] transition-colors">
            管理员登录 →
          </Link>
          <Link to="/student/login" className="hover:text-[#0F766E] transition-colors">
            学生登录 →
          </Link>
        </div>
      </div>
    );
  }

  if (variant === 'student') {
    return (
      <div
        data-theme="student"
        className="relative flex-1 flex items-center justify-center p-4 flex-col gap-6 overflow-hidden"
        style={{ background: 'hsl(215, 25%, 94%)' }}
      >
        <BlobBackdrop variant="cool" intensity="hero" />
        <div className="glass-card relative z-10 w-full max-w-sm rounded-2xl p-8" style={settle(0)}>
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-[#2563EB] rounded-xl flex items-center justify-center shadow-sm shrink-0">
              <span className="text-white text-sm font-bold tracking-tight">R</span>
            </div>
            <div>
              <div className="text-sm font-semibold text-[#202938] tracking-tight">RAG 1.0</div>
              <div className="text-xs text-[#6E7787]">学生登录</div>
            </div>
          </div>

          <h1 className="text-xl font-semibold text-[#202938] mb-6">你好，同学</h1>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-[#4A5568] font-medium">学号</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入学号"
                autoComplete="username"
                className="px-3 py-2.5 rounded-xl border border-[#D9DEE5] bg-[#F8F9FB] text-sm text-[#202938] placeholder:text-[#9CA3AF] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 focus:bg-white transition"
                disabled={mutation.isPending}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-[#4A5568] font-medium">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                autoComplete="current-password"
                className="px-3 py-2.5 rounded-xl border border-[#D9DEE5] bg-[#F8F9FB] text-sm text-[#202938] placeholder:text-[#9CA3AF] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 focus:bg-white transition"
                disabled={mutation.isPending}
              />
            </div>

            {errorMessage && (
              <div className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={mutation.isPending || !username.trim() || !password.trim()}
              className="mt-2 w-full py-2.5 bg-[#2563EB] text-white text-sm font-medium rounded-xl hover:bg-[#1D4ED8] active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {mutation.isPending ? '登录中...' : '登录'}
            </button>
          </form>
        </div>

        <div className="relative z-10 flex gap-4 text-xs text-[#6E7787]" style={settle(150)}>
          <Link to="/teacher/login" className="hover:text-[#2563EB] transition-colors">
            教师登录 →
          </Link>
          <Link to="/admin/login" className="hover:text-[#2563EB] transition-colors">
            管理员登录 →
          </Link>
        </div>
      </div>
    );
  }

  // Admin variant
  return (
    <div
      className="relative flex-1 flex items-center justify-center p-4 flex-col gap-6 overflow-hidden"
      style={{ background: 'hsl(38, 22%, 91%)' }}
    >
      <BlobBackdrop variant="warm" intensity="hero" />
      <div className="glass-card relative z-10 w-full max-w-sm rounded-2xl p-8" style={settle(0)}>
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-slate-700 rounded-xl flex items-center justify-center shadow-sm shrink-0">
            <span className="text-white text-sm font-bold tracking-tight">R</span>
          </div>
          <div>
            <div className="text-sm font-semibold text-[#334155] tracking-tight">RAG 1.0</div>
            <div className="text-xs text-[#9A9A9A]">管理员登录</div>
          </div>
        </div>

        <h1 className="text-xl font-semibold text-[#334155] mb-6">登录</h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-[#4A4A4A] font-medium">账号</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              autoComplete="username"
              className="px-3 py-2.5 rounded-xl border border-[#E8E5E0] bg-[#FAFAF9] text-sm text-[#334155] placeholder:text-[#C0BDB8] outline-none focus:border-slate-400 focus:bg-white transition"
              disabled={mutation.isPending}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-[#4A4A4A] font-medium">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              autoComplete="current-password"
              className="px-3 py-2.5 rounded-xl border border-[#E8E5E0] bg-[#FAFAF9] text-sm text-[#334155] placeholder:text-[#C0BDB8] outline-none focus:border-slate-400 focus:bg-white transition"
              disabled={mutation.isPending}
            />
          </div>

          {errorMessage && (
            <div className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={mutation.isPending || !username.trim() || !password.trim()}
            className="mt-2 w-full py-2.5 bg-slate-700 text-white text-sm font-medium rounded-xl hover:bg-slate-800 active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mutation.isPending ? '登录中...' : '登录'}
          </button>
        </form>
      </div>

      <div className="relative z-10 flex gap-4 text-xs text-[#9A9A9A]" style={settle(150)}>
        <Link to="/teacher/login" className="hover:text-[#334155] transition-colors">
          教师登录 →
        </Link>
        <Link to="/student/login" className="hover:text-[#334155] transition-colors">
          学生登录 →
        </Link>
      </div>
    </div>
  );
}
