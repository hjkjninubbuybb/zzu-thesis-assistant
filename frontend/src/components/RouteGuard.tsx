import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import type { UserRole } from '@/types/api'

interface RouteGuardProps {
  allowedRoles?: UserRole[]
}

/**
 * 路由守卫：
 * - 未登录 → /login
 * - 已登录但角色不匹配 → / （首页）
 * - 通过 → 渲染子路由
 */
export default function RouteGuard({ allowedRoles }: RouteGuardProps) {
  const { user } = useAuth()

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
