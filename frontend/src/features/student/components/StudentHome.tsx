import React from "react";
import { useNavigate } from "react-router-dom";
import {
  MessagesSquare,
  MessageSquare,
  Database,
  Sparkles,
} from "lucide-react";
import { useAuthUser } from "@shared/store/authStore";
import type { StudentProfile } from "@shared/types/api";
import { useStudentHome } from "../hooks/useStudentHome";
import { StatCard } from "./StatCard";
import { RecentConversationsList } from "./RecentConversationsList";
import { FaqList } from "./FaqList";
import { ThesisDashboard } from "./ThesisDashboard";

const cardStyle = (delay: number): React.CSSProperties => ({
  animation: `appleSettleIn 0.75s cubic-bezier(0.25, 1, 0.5, 1) ${delay}ms both`,
});

function HomeSkeleton() {
  return (
    <div className="p-7 flex-1 overflow-y-auto glass-card rounded-2xl animate-pulse">
      <div className="mb-7">
        <div className="h-9 bg-gray-100 rounded-lg w-48 mb-2" />
        <div className="h-4 bg-gray-50 rounded-md w-64" />
      </div>
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div
          className="col-span-1 rounded-2xl p-5 bg-gray-100"
          style={{ minHeight: 160 }}
        />
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="glass-card rounded-2xl p-5 flex flex-col justify-between"
            style={{ minHeight: 160 }}
          >
            <div className="w-10 h-10 rounded-xl bg-gray-100" />
            <div className="space-y-2">
              <div className="h-7 bg-gray-100 rounded-md w-16" />
              <div className="h-3 bg-gray-50 rounded-md w-12" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="glass-card rounded-2xl p-5 h-64 flex flex-col gap-4"
          >
            <div className="flex justify-between">
              <div className="h-5 bg-gray-100 rounded-md w-24" />
              <div className="h-4 bg-gray-50 rounded-md w-16" />
            </div>
            <div className="space-y-3">
              {[1, 2, 3].map((j) => (
                <div key={j} className="flex gap-3 items-center">
                  <div className="w-8 h-8 rounded-lg bg-gray-50" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-gray-100 rounded-md w-3/4" />
                    <div className="h-2 bg-gray-50 rounded-md w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StudentHome() {
  const navigate = useNavigate();
  const user = useAuthUser();
  const {
    conversations,
    recentConversations,
    todayConversations,
    activeKb,
    faqs,
    isLoading,
  } = useStudentHome();

  const profile = user?.profile as StudentProfile | null | undefined;
  const displayName = user?.display_name || user?.username || "同学";

  if (isLoading) {
    return <HomeSkeleton />;
  }

  return (
    <div className="p-7 flex-1 overflow-y-auto glass-card rounded-2xl">
      {/* 问候区 */}
      <div className="mb-7" style={cardStyle(0)}>
        <h1 className="text-[28px] font-semibold text-[#202938] tracking-tight leading-tight">
          你好，{displayName}
        </h1>
        <p className="text-sm text-[#6E7787] mt-1">
          {profile?.major
            ? `${profile.grade} · ${profile.major} · ${profile.class_name}`
            : "欢迎使用毕业设计智能问答系统"}
        </p>
      </div>

      {/* 快捷操作 + 统计 */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div
          className="col-span-1 rounded-2xl p-5 flex flex-col justify-between hover-lift cursor-pointer"
          style={{
            ...cardStyle(80),
            background:
              "linear-gradient(135deg, #2563EB 0%, #3B82F6 50%, #60A5FA 100%)",
            minHeight: 160,
          }}
          onClick={() => navigate("/student/chat")}
        >
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            <Sparkles size={20} className="text-white" strokeWidth={1.8} />
          </div>
          <div>
            <p className="text-white font-semibold text-sm">开始提问</p>
            <p className="text-blue-100 text-xs mt-0.5">
              向 AI 助手咨询毕设问题
            </p>
          </div>
        </div>

        <StatCard
          delay={160}
          icon={MessagesSquare}
          label="对话总数"
          value={conversations.length}
          suffix="次"
          color="#2563EB"
        />
        <StatCard
          delay={240}
          icon={MessageSquare}
          label="今日提问"
          value={todayConversations.length}
          suffix="次"
          color="#10B981"
        />
        <StatCard
          delay={320}
          icon={Database}
          label="知识库已分配"
          value={activeKb ? 1 : 0}
          suffix="个"
          color="#8B5CF6"
        />
      </div>

      {/* 毕设进度仪表盘 */}
      <ThesisDashboard />

      {/* 下半区：最近对话 + FAQ */}
      <div className="grid grid-cols-2 gap-4">
        <RecentConversationsList
          conversations={recentConversations}
          onViewAll={() => navigate("/student/chat")}
          cardStyle={cardStyle(500)}
        />
        <FaqList
          faqs={faqs}
          onViewMore={() => navigate("/student/faq")}
          cardStyle={cardStyle(480)}
        />
      </div>
    </div>
  );
}
