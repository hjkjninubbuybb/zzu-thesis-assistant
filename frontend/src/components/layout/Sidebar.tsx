import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Database,
  MessageSquareQuote,
  Users,
  MessagesSquare,
  BarChart2,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const mainNavItems = [
  { to: '/', label: '概览', icon: LayoutDashboard, end: true },
  { to: '/knowledge', label: '知识库', icon: Database },
  { to: '/faq', label: 'FAQ 管理', icon: MessageSquareQuote },
  { to: '/students', label: '学生账号', icon: Users },
  { to: '/conversations', label: '对话记录', icon: MessagesSquare },
  { to: '/analytics', label: '使用统计', icon: BarChart2 },
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
            ? 'bg-[#1A1A1A] text-white shadow-sm'
            : 'text-[#9A9A9A] hover:bg-[#F2EFE9] hover:text-[#1A1A1A] active:scale-95'
        )
      }
    >
      <Icon size={17} strokeWidth={1.8} className="shrink-0" />
      <span className="font-medium">{label}</span>
    </NavLink>
  )
}

export default function Sidebar() {
  return (
    <aside className="w-48 shrink-0 flex flex-col bg-white rounded-2xl shadow-sm">
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
        {mainNavItems.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
      </nav>

      {/* Bottom: Settings + Avatar */}
      <div className="flex flex-col px-2 pb-4 gap-0.5">
        <div className="mx-1 mb-2 h-px bg-[#F0EDE8]" />
        <NavItem to="/settings" label="系统配置" icon={Settings} />
        <div className="flex items-center gap-3 px-3 py-2 mt-1">
          <div
            title="管理员"
            className="w-7 h-7 rounded-full bg-amber-400 flex items-center justify-center text-[11px] font-semibold text-white select-none shrink-0"
          >
            管
          </div>
          <span className="text-xs text-[#9A9A9A] font-medium">管理员</span>
        </div>
      </div>
    </aside>
  )
}
