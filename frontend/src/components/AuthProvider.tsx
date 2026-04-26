import { useState, useEffect, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import type { UserInfo } from '@/types/api'
import { AuthContext } from '@/hooks/useAuth'
import { useTokenAutoRefresh } from '@/hooks/useTokenAutoRefresh'
import { authApi } from '@/lib/api'
import { saveAuth, clearAuth, getStoredUser, getRefreshToken, type Portal } from '@/lib/auth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const portal: Portal = pathname.startsWith('/student') ? 'student' : 'admin'

  const [user, setUserState] = useState<UserInfo | null>(null)
  const [ready, setReady] = useState(false)

  // portal 变化时重新加载对应会话
  useEffect(() => {
    setReady(false)
    const refreshToken = getRefreshToken(portal)
    if (!refreshToken) {
      setUserState(getStoredUser(portal))
      setReady(true)
      return
    }
    authApi.refresh(refreshToken)
      .then(data => {
        saveAuth(data, portal)
        setUserState(data.user)
      })
      .catch(() => {
        clearAuth(portal)
        setUserState(null)
      })
      .finally(() => setReady(true))
  }, [portal])

  useTokenAutoRefresh(portal, !!user, (u) => setUserState(u))

  const login = async (username: string, password: string) => {
    const data = await authApi.login(username, password)
    saveAuth(data, portal)
    setUserState(data.user)
  }

  const logout = () => {
    clearAuth(portal)
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
