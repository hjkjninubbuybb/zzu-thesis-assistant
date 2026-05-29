import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, MessagesSquare, MessageSquare } from "lucide-react";
import type { ConversationInfo } from "@shared/types/api";

interface ConvItemProps {
  conv: ConversationInfo;
  index: number;
}

function ConvItem({ conv, index }: ConvItemProps) {
  const navigate = useNavigate();
  const timeStr = new Date(conv.updated_at).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <button
      onClick={() => navigate("/student/chat")}
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#EEF2FF] transition-colors group w-full text-left"
      style={{
        opacity: 0,
        animation: `appleFadeUp 0.6s cubic-bezier(0.25, 1, 0.5, 1) ${500 + index * 75}ms both`,
      }}
    >
      <div className="w-8 h-8 rounded-lg bg-[#EEF2FF] flex items-center justify-center shrink-0">
        <MessageSquare size={14} className="text-[#2563EB]" strokeWidth={1.8} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-[#202938] truncate">
          {conv.title}
        </p>
        <p className="text-[10px] text-[#9CA3AF] mt-0.5">{conv.kb_name}</p>
      </div>
      <span className="text-[10px] text-[#9CA3AF] shrink-0">{timeStr}</span>
      <ArrowRight
        size={12}
        className="text-[#D9DEE5] group-hover:text-[#2563EB] group-hover:translate-x-0.5 transition-all shrink-0"
      />
    </button>
  );
}

interface RecentConversationsListProps {
  conversations: ConversationInfo[];
  onViewAll: () => void;
  cardStyle: React.CSSProperties;
}

export function RecentConversationsList({
  conversations,
  onViewAll,
  cardStyle,
}: RecentConversationsListProps) {
  return (
    <div
      className="glass-card rounded-2xl p-5 flex flex-col gap-3 hover-lift"
      style={cardStyle}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#202938]">最近对话</h3>
        <button
          onClick={onViewAll}
          className="flex items-center gap-1 text-xs text-[#6E7787] hover:text-[#2563EB] transition-colors px-2 py-1 rounded-lg hover:bg-[#EEF2FF]"
        >
          查看全部
          <ArrowRight size={12} />
        </button>
      </div>

      {conversations.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
          <MessagesSquare
            size={28}
            className="text-[#D9DEE5] mb-2"
            strokeWidth={1.2}
          />
          <p className="text-sm text-[#9CA3AF]">暂无对话记录</p>
          <p className="text-xs text-[#C4C9D4] mt-1">开始你的第一次提问吧</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {conversations.map((conv, i) => (
            <ConvItem key={conv.id} conv={conv} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
