import { NavLink, useNavigate } from 'react-router-dom';
import { Home, Users, Ticket, User, LogOut } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { useAuthUser, useAuthLogout } from '@shared/store/authStore';

const TEACHER_NAV = [
  { to: '/teacher', label: '首页', icon: Home, end: true },
  { to: '/teacher/students', label: '我的学生', icon: Users },
  { to: '/teacher/tickets', label: '答疑请求', icon: Ticket },
  { to: '/teacher/profile', label: '个人中心', icon: User },
];

function NavItem({
  to,
  label,
  icon: Icon,
  end,
}: {
  to: string;
  label: string;
  icon: React.ElementType;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 text-sm',
          isActive
            ? 'bg-[#0F766E] text-white shadow-md'
            : 'text-[#5F6E68] hover:bg-white/50 hover:text-[#0F766E] active:scale-[0.97]',
        )
      }
    >
      <Icon size={17} strokeWidth={1.8} className="shrink-0" />
      <span className="font-medium">{label}</span>
    </NavLink>
  );
}

export default function TeacherSidebar() {
  const user = useAuthUser();
  const logout = useAuthLogout();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/teacher/login', { replace: true });
  };

  const displayName = user?.display_name || user?.username || '导师';
  const avatarChar = displayName.slice(0, 1).toUpperCase();

  return (
    <aside className="glass-soft w-48 shrink-0 flex flex-col rounded-2xl border-none">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-4">
        <div className="w-9 h-9 bg-[#0F766E] rounded-xl flex items-center justify-center shadow-md shrink-0">
          <span className="text-white text-xs font-bold tracking-tight">R</span>
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-bold text-[#1F2937] tracking-tight">RAG 1.0</span>
          <span className="text-[10px] text-[#6F7A75]">导师工作台</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col px-2 py-4 gap-1">
        {TEACHER_NAV.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
      </nav>

      {/* User info + logout */}
      <div className="flex flex-col px-2 pb-5 gap-1">
        <div className="mx-2 mb-2 h-px bg-white/40" />
        <div className="flex items-center gap-2 px-3 py-2 mt-1 bg-white/30 rounded-xl mx-1">
          <div className="w-7 h-7 rounded-full bg-[#0F766E] flex items-center justify-center text-[11px] font-semibold text-white select-none shrink-0 shadow-sm">
            {avatarChar}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-[#1F2937] font-semibold truncate leading-tight">
              {displayName}
            </div>
            <div className="text-[9px] text-[#6F7A75]">导师</div>
          </div>
          <button
            onClick={handleLogout}
            title="退出登录"
            className="shrink-0 text-[#6F7A75] hover:text-[#1F2937] transition-colors"
          >
            <LogOut size={13} strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </aside>
  );
}
