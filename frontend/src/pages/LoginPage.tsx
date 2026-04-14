import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { extractError } from '@/lib/api'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) return
    setLoading(true)
    setError(null)
    try {
      await login(username.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4" style={{ background: 'hsl(38, 22%, 91%)' }}>
      <div className="w-full max-w-sm bg-white rounded-2xl border border-[#F0EDE8] shadow-sm p-8">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-[#1A1A1A] rounded-xl flex items-center justify-center shadow-sm shrink-0">
            <span className="text-white text-sm font-bold tracking-tight">R</span>
          </div>
          <div>
            <div className="text-sm font-semibold text-[#1A1A1A] tracking-tight">RAG 1.0</div>
            <div className="text-xs text-[#9A9A9A]">郑州大学毕业设计问答系统</div>
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
              placeholder="用户名 / 学号 / 工号"
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
    </div>
  )
}
