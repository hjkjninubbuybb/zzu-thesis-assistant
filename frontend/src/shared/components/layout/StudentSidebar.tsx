import { NavLink, useNavigate } from "react-router-dom";
import {
  Home,
  MessagesSquare,
  HelpCircle,
  User,
  LogOut,
  Ticket,
} from "lucide-react";
import { cn } from "@shared/lib/utils";
import { useAuthUser, useAuthLogout } from "@shared/store/authStore";

const STUDENT_NAV = [
  { to: "/student", label: "首页", icon: Home, end: true },
  { to: "/student/chat", label: "智能问答", icon: MessagesSquare },
  { to: "/student/tickets", label: "答疑记录", icon: Ticket },
  { to: "/student/faq", label: "常见问题", icon: HelpCircle },
  { to: "/student/profile", label: "我的", icon: User },
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
          "w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 text-sm",
          isActive
            ? "bg-[#2563EB] text-white shadow-md"
            : "text-[#6E7787] hover:bg-white/50 hover:text-[#2563EB] active:scale-[0.97]",
        )
      }
    >
      <Icon size={17} strokeWidth={1.8} className="shrink-0" />
      <span className="font-medium">{label}</span>
    </NavLink>
  );
}

export default function StudentSidebar() {
  const user = useAuthUser();
  const logout = useAuthLogout();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/student/login", { replace: true });
  };

  const displayName = user?.display_name || user?.username || "同学";
  const avatarChar = displayName.slice(0, 1).toUpperCase();

  return (
    <aside className="glass-soft w-48 shrink-0 flex flex-col rounded-2xl border-none">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-4">
        <div className="w-9 h-9 bg-[#2563EB] rounded-xl flex items-center justify-center shadow-md shrink-0">
          <span className="text-white text-xs font-bold tracking-tight">R</span>
        </div>
        <span className="text-sm font-bold text-[#202938] tracking-tight">
          RAG 1.0
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col px-2 py-4 gap-1">
        {STUDENT_NAV.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
      </nav>

      {/* User info + logout */}
      <div className="flex flex-col px-2 pb-5 gap-1">
        <div className="mx-2 mb-2 h-px bg-white/40" />
        <div className="flex items-center gap-2 px-3 py-2 mt-1 bg-white/30 rounded-xl mx-1">
          <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-[11px] font-semibold text-white select-none shrink-0 shadow-sm">
            {avatarChar}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-[#202938] font-semibold truncate leading-tight">
              {displayName}
            </div>
            <div className="text-[9px] text-[#6E7787]">学生</div>
          </div>
          <button
            onClick={handleLogout}
            title="退出登录"
            className="shrink-0 text-[#6E7787] hover:text-[#202938] transition-colors"
          >
            <LogOut size={13} strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </aside>
  );
}
