import { useState, useEffect, type ReactNode } from 'react'
import type { UserInfo } from '@/types/api'
import { AuthContext } from '@/hooks/useAuth'
import { authApi } from '@/lib/api'
import { saveAuth, clearAuth, getStoredUser, getRefreshToken } from '@/lib/auth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<UserInfo | null>(null)
  const [ready, setReady] = useState(false)

  // 启动时静默刷新：用 refresh token 换新 access token
  useEffect(() => {
    const refreshToken = getRefreshToken()
    if (!refreshToken) {
      // 没有 refresh token，直接用 localStorage 里的用户信息（或 null）
      setUserState(getStoredUser())
      setReady(true)
      return
    }
    authApi.refresh(refreshToken)
      .then(data => {
        saveAuth(data)
        setUserState(data.user)
      })
      .catch(() => {
        clearAuth()
        setUserState(null)
      })
      .finally(() => setReady(true))
  }, [])

  const login = async (username: string, password: string) => {
    const data = await authApi.login(username, password)
    saveAuth(data)
    setUserState(data.user)
  }

  const logout = () => {
    clearAuth()
    setUserState(null)
  }

  const setUser = (u: UserInfo) => setUserState(u)

  const role = user?.role ?? null

  // 静默刷新完成前不渲染，避免路由守卫因状态未就绪而误跳登录
  if (!ready) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'hsl(38,22%,91%)' }}>
        <div style={{ width: 32, height: 32, border: '3px solid #e0dbd3', borderTopColor: '#1a1a1a', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAdmin: role === 'admin',
        isTeacher: role === 'teacher',
        isStudent: role === 'student',
        login,
        logout,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
