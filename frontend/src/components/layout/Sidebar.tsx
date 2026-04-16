import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Database,
  MessageSquareQuote,
  Users,
  MessagesSquare,
  BarChart2,
  Settings,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'

const ADMIN_TEACHER_NAV = [
  { to: '/admin', label: '概览', icon: LayoutDashboard, end: true },
  { to: '/admin/conversations', label: '对话', icon: MessagesSquare },
  { to: '/admin/knowledge', label: '知识库', icon: Database },
  { to: '/admin/faq', label: 'FAQ 管理', icon: MessageSquareQuote },
  { to: '/admin/students', label: '学生账号', icon: Users },
  { to: '/admin/analytics', label: '使用统计', icon: BarChart2 },
]

const ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  teacher: '教师',
}

function NavItem({
  to,
  label,
  icon: Icon,
  end,
}: {
  to: string
  label: string
  icon: React.ElementType
  end?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 text-sm',
          isActive
            ? 'bg-[#1A1A1A] text-white shadow-sm'
            : 'text-[#9A9A9A] hover:bg-[#F2EFE9] hover:text-[#1A1A1A] active:scale-[0.97]'
        )
      }
    >
      <Icon size={17} strokeWidth={1.8} className="shrink-0" />
      <span className="font-medium">{label}</span>
    </NavLink>
  )
}

export default function Sidebar() {
  const { user, isStudent, logout } = useAuth()
  const navigate = useNavigate()
  const navItems = ADMIN_TEACHER_NAV

  const handleLogout = () => {
    logout()
    navigate('/admin/login', { replace: true })
  }

  // 显示名：优先 display_name，退而求其次 username
  const displayName = user?.display_name || user?.username || '用户'
  const roleLabel = ROLE_LABELS[user?.role ?? ''] ?? ''
  // 头像字：取 display_name 或 username 第一个字
  const avatarChar = displayName.slice(0, 1).toUpperCase()

  return (
    <aside className="w-48 shrink-0 flex flex-col bg-white rounded-2xl border border-[#F0EDE8] shadow-sm">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <div className="w-9 h-9 bg-[#1A1A1A] rounded-xl flex items-center justify-center shadow-sm shrink-0">
          <span className="text-white text-xs font-bold tracking-tight">R</span>
        </div>
        <span className="text-sm font-semibold text-[#1A1A1A] tracking-tight">RAG 1.0</span>
      </div>

      {/* Divider */}
      <div className="mx-3 h-px bg-[#F0EDE8]" />

      {/* Main Navigation */}
      <nav className="flex-1 flex flex-col px-2 py-4 gap-0.5">
        {navItems.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
      </nav>

      {/* Bottom: Settings + Avatar */}
      <div className="flex flex-col px-2 pb-4 gap-0.5">
        <div className="mx-1 mb-2 h-px bg-[#F0EDE8]" />
        {!isStudent && <NavItem to="/admin/settings" label="系统配置" icon={Settings} />}

        {/* 用户信息 + 退出 */}
        <div className="flex items-center gap-2 px-3 py-2 mt-1">
          <div
            className="w-7 h-7 rounded-full bg-amber-400 flex items-center justify-center text-[11px] font-semibold text-white select-none shrink-0"
          >
            {avatarChar}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-[#1A1A1A] font-medium truncate">{displayName}</div>
            <div className="text-[10px] text-[#9A9A9A]">{roleLabel}</div>
          </div>
          <button
            onClick={handleLogout}
            title="退出登录"
            className="shrink-0 text-[#9A9A9A] hover:text-[#1A1A1A] transition"
          >
            <LogOut size={14} strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </aside>
  )
}
