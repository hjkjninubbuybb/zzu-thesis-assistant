import { NavLink, useNavigate } from 'react-router-dom'
import {
  Home,
  MessagesSquare,
  HelpCircle,
  User,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'

const STUDENT_NAV = [
  { to: '/student', label: '首页', icon: Home, end: true },
  { to: '/student/chat', label: '智能问答', icon: MessagesSquare },
  { to: '/student/faq', label: '常见问题', icon: HelpCircle },
  { to: '/student/profile', label: '我的', icon: User },
]

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
            ? 'bg-[#2563EB] text-white shadow-sm'
            : 'text-[#6E7787] hover:bg-[#EEF2FF] hover:text-[#2563EB] active:scale-[0.97]'
        )
      }
    >
      <Icon size={17} strokeWidth={1.8} className="shrink-0" />
      <span className="font-medium">{label}</span>
    </NavLink>
  )
}

export default function StudentSidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/student/login', { replace: true })
  }

  const displayName = user?.display_name || user?.username || '同学'
  const avatarChar = displayName.slice(0, 1).toUpperCase()

  return (
    <aside className="w-48 shrink-0 flex flex-col bg-white rounded-2xl border border-[#D9DEE5] shadow-sm">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <div className="w-9 h-9 bg-[#2563EB] rounded-xl flex items-center justify-center shadow-sm shrink-0">
          <span className="text-white text-xs font-bold tracking-tight">R</span>
        </div>
        <span className="text-sm font-semibold text-[#202938] tracking-tight">RAG 1.0</span>
      </div>

      {/* Divider */}
      <div className="mx-3 h-px bg-[#D9DEE5]" />

      {/* Navigation */}
      <nav className="flex-1 flex flex-col px-2 py-4 gap-0.5">
        {STUDENT_NAV.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
      </nav>

      {/* User info + logout */}
      <div className="flex flex-col px-2 pb-4 gap-0.5">
        <div className="mx-1 mb-2 h-px bg-[#D9DEE5]" />
        <div className="flex items-center gap-2 px-3 py-2 mt-1">
          <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-[11px] font-semibold text-white select-none shrink-0">
            {avatarChar}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-[#202938] font-medium truncate">{displayName}</div>
            <div className="text-[10px] text-[#6E7787]">学生</div>
          </div>
          <button
            onClick={handleLogout}
            title="退出登录"
            className="shrink-0 text-[#6E7787] hover:text-[#202938] transition"
          >
            <LogOut size={14} strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </aside>
  )
}
