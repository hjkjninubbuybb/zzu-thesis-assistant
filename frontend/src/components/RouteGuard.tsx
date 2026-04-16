import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import type { UserRole } from '@/types/api'

interface RouteGuardProps {
  allowedRoles?: UserRole[]
}

/**
 * 路由守卫：
 * - 未登录 → 按路径前缀跳对应登录页（/s/* → /s/login，其他 → /admin/login）
 * - 已登录但角色不匹配 → 跳到自己的首页
 * - 通过 → 渲染子路由
 */
export default function RouteGuard({ allowedRoles }: RouteGuardProps) {
  const { user } = useAuth()
  const { pathname } = useLocation()

  if (!user) {
    const loginPath = pathname.startsWith('/s') ? '/s/login' : '/admin/login'
    return <Navigate to={loginPath} replace />
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // 学生访问管理端 → 引导到管理员登录页（LoginPage 会自动清除 student 会话）
    // 管理员访问学生端 → 引导到管理员首页
    const target = user.role === 'student' && !pathname.startsWith('/s')
      ? '/admin/login'
      : user.role === 'student' ? '/s' : '/admin'
    return <Navigate to={target} replace />
  }

  return <Outlet />
}
