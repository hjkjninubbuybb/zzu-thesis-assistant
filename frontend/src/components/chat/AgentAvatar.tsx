import { memo } from "react";

export const AgentAvatar = memo(({ isStudent }: { isStudent: boolean }) => (
  <div
    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm transition-all duration-300 hover:rotate-3 border ${
      isStudent
        ? "bg-blue-50 text-[#2563EB] border-[#DBEAFE]"
        : "bg-slate-100 text-[#334155] border-[#E2E8F0]"
    }`}
  >
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* 博士帽顶部 */}
      <path d="M12 3L2 8L12 13L22 8L12 3Z" />
      {/* 博士帽帽筒 */}
      <path d="M6 10V15.5C6 15.5 8.5 17.5 12 17.5C15.5 17.5 18 15.5 18 15.5V10" />
      {/* 流苏 */}
      <path d="M22 8V13" />
      {/* AI 核心节点 - 位于帽筒中心 */}
      <circle
        cx="12"
        cy="8"
        r="1.5"
        fill="currentColor"
        className="animate-pulse"
      />
      <circle cx="12" cy="14" r="1" fill="currentColor" opacity="0.5" />
    </svg>
  </div>
));
