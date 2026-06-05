import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthUser } from '@shared/store/authStore';
import type { UserRole } from '@shared/types/api';

interface RouteGuardProps {
  allowedRoles?: UserRole[];
}

function loginPathFor(pathname: string): string {
  if (pathname.startsWith('/student')) return '/student/login';
  if (pathname.startsWith('/teacher')) return '/teacher/login';
  return '/admin/login';
}

/**
 * 路由守卫：
 * - 未登录 → 按路径前缀跳对应登录页（/student/* → /student/login，/teacher/* → /teacher/login，其他 → /admin/login）
 * - 已登录但角色不匹配 → 跳到自己的首页
 * - 通过 → 渲染子路由
 */
export default function RouteGuard({ allowedRoles }: RouteGuardProps) {
  const user = useAuthUser();
  const { pathname } = useLocation();

  if (!user) {
    return <Navigate to={loginPathFor(pathname)} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // 角色不匹配时，跳到当前门户的登录页
    // LoginPage 会自动清除不匹配的会话，实现两端真正分离
    return <Navigate to={loginPathFor(pathname)} replace />;
  }

  return <Outlet />;
}
