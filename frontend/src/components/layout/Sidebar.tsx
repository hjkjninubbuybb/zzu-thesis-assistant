import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Database,
  FileText,
  MessageSquareQuote,
  Users,
  MessagesSquare,
  BarChart2,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', label: '概览', icon: LayoutDashboard, end: true },
  { to: '/knowledge', label: '知识库', icon: Database },
  { to: '/documents', label: '文档', icon: FileText },
  { to: '/faq', label: 'FAQ 管理', icon: MessageSquareQuote },
  { to: '/students', label: '学生账号', icon: Users },
  { to: '/conversations', label: '对话记录', icon: MessagesSquare },
  { to: '/analytics', label: '使用统计', icon: BarChart2 },
  { to: '/settings', label: '系统配置', icon: Settings },
]

export default function Sidebar() {
  return (
    <aside className="w-56 shrink-0 border-r border-border bg-card flex flex-col h-full">
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-border">
        <span className="font-semibold text-foreground text-sm">答辩助手管理端</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border">
        <p className="text-xs text-muted-foreground">RAG 1.0</p>
      </div>
    </aside>
  )
}
