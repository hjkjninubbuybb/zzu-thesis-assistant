import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { extractError } from '@/lib/api'
import { getStoredUser } from '@/lib/auth'

interface LoginPageProps {
  variant: 'admin' | 'student'
}

export default function LoginPage({ variant }: LoginPageProps) {
  const { login, logout, user } = useAuth()
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isStudent = variant === 'student'

  // 已登录的用户访问登录页时：角色匹配则直接跳转，否则清除会话
  useEffect(() => {
    if (!user) return
    if (isStudent && user.role === 'student') {
      navigate('/student', { replace: true })
    } else if (!isStudent && (user.role === 'admin' || user.role === 'teacher')) {
      navigate('/admin', { replace: true })
    } else {
      // 角色与登录页不匹配（如学生访问管理员登录页），清除旧会话
      logout()
    }
  }, [user, isStudent, navigate, logout])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) return
    setLoading(true)
    setError(null)
    try {
      await login(username.trim(), password)
      const storedUser = getStoredUser()
      navigate(storedUser?.role === 'student' ? '/student' : '/admin', { replace: true })
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }

  const settle = (d: number): React.CSSProperties => ({
    animation: `appleSettleIn 0.8s cubic-bezier(0.25, 1, 0.5, 1) ${d}ms both`,
  })

  if (isStudent) {
    return (
      <div
        className="flex-1 flex items-center justify-center p-4 flex-col gap-6"
        style={{ background: 'hsl(215, 25%, 94%)' }}
      >
        <div className="w-full max-w-sm bg-white rounded-2xl border border-[#D9DEE5] shadow-sm p-8" style={settle(0)}>
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
                onChange={e => setUsername(e.target.value)}
                placeholder="请输入学号"
                autoComplete="username"
                className="px-3 py-2.5 rounded-xl border border-[#D9DEE5] bg-[#F8F9FB] text-sm text-[#202938] placeholder:text-[#9CA3AF] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 focus:bg-white transition"
                disabled={loading}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-[#4A5568] font-medium">密码</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="请输入密码"
                autoComplete="current-password"
                className="px-3 py-2.5 rounded-xl border border-[#D9DEE5] bg-[#F8F9FB] text-sm text-[#202938] placeholder:text-[#9CA3AF] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 focus:bg-white transition"
                disabled={loading}
              />
            </div>

            {error && (
              <div className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !username.trim() || !password.trim()}
              className="mt-2 w-full py-2.5 bg-[#2563EB] text-white text-sm font-medium rounded-xl hover:bg-[#1D4ED8] active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '登录中...' : '登录'}
            </button>
          </form>
        </div>

        <Link
          to="/admin/login"
          className="text-xs text-[#6E7787] hover:text-[#2563EB] transition-colors"
          style={settle(150)}
        >
          教师 / 管理员登录 →
        </Link>
      </div>
    )
  }

  // Admin / Teacher variant
  return (
    <div
      className="flex-1 flex items-center justify-center p-4 flex-col gap-6"
      style={{ background: 'hsl(38, 22%, 91%)' }}
    >
      <div className="w-full max-w-sm bg-white rounded-2xl border border-[#F0EDE8] shadow-sm p-8" style={settle(0)}>
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-[#1A1A1A] rounded-xl flex items-center justify-center shadow-sm shrink-0">
            <span className="text-white text-sm font-bold tracking-tight">R</span>
          </div>
          <div>
            <div className="text-sm font-semibold text-[#1A1A1A] tracking-tight">RAG 1.0</div>
            <div className="text-xs text-[#9A9A9A]">管理员 / 教师登录</div>
          </div>
        </div>

        <h1 className="text-xl font-semibold text-[#1A1A1A] mb-6">登录</h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-[#4A4A4A] font-medium">账号</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="用户名 / 工号"
              autoComplete="username"
              className="px-3 py-2.5 rounded-xl border border-[#E8E5E0] bg-[#FAFAF9] text-sm text-[#1A1A1A] placeholder:text-[#C0BDB8] outline-none focus:border-[#1A1A1A] focus:bg-white transition"
              disabled={loading}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-[#4A4A4A] font-medium">密码</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="请输入密码"
              autoComplete="current-password"
              className="px-3 py-2.5 rounded-xl border border-[#E8E5E0] bg-[#FAFAF9] text-sm text-[#1A1A1A] placeholder:text-[#C0BDB8] outline-none focus:border-[#1A1A1A] focus:bg-white transition"
              disabled={loading}
            />
          </div>

          {error && (
            <div className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !username.trim() || !password.trim()}
            className="mt-2 w-full py-2.5 bg-[#1A1A1A] text-white text-sm font-medium rounded-xl hover:bg-[#333] active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
      </div>

      <Link
        to="/student/login"
        className="text-xs text-[#9A9A9A] hover:text-[#1A1A1A] transition-colors"
        style={settle(150)}
      >
        学生登录 →
      </Link>
    </div>
  )
}
