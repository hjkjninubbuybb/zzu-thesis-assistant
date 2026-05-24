import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  MessagesSquare,
  HelpCircle,
  Database,
  ArrowRight,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { conversationApi, knowledgeApi, faqApi } from "@/lib/api";
import type { StudentProfile, ConversationInfo, FAQItem } from "@/types/api";

function useCountUp(target: number, duration = 900) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!target) {
      setCount(0);
      return;
    }
    let startTs: number;
    let raf: number;
    const tick = (ts: number) => {
      startTs ??= ts;
      const p = Math.min((ts - startTs) / duration, 1);
      setCount(Math.round((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return count;
}

const cardStyle = (delay: number): React.CSSProperties => ({
  animation: `appleSettleIn 0.75s cubic-bezier(0.25, 1, 0.5, 1) ${delay}ms both`,
});

export default function StudentHomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const profile = user?.profile as StudentProfile | null | undefined;

  const { data: activeKb, isLoading: isLoadingKb } = useQuery({
    queryKey: ["active-kb"],
    queryFn: knowledgeApi.getActiveKb,
  });
  const { data: conversationData, isLoading: isLoadingConvs } = useQuery({
    queryKey: ["conversations", "__all__"],
    queryFn: () => conversationApi.list(),
  });
  const conversations = conversationData?.items ?? [];

  const activeKbName = activeKb?.kb_name;
  const { data: faqs } = useQuery({
    queryKey: ["faqs-home", activeKbName],
    queryFn: () => faqApi.list(activeKbName!),
    enabled: !!activeKbName,
    select: (data) => data.filter((f) => f.enabled).slice(0, 5),
  });

  const displayName = user?.display_name || user?.username || "同学";
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayConvs = conversations.filter((c) =>
    c.updated_at.startsWith(todayStr),
  );
  const recentConvs = conversations.slice(0, 5);

  const convCount = useCountUp(conversations.length);
  const todayCount = useCountUp(todayConvs.length);
  const kbCount = useCountUp(activeKb ? 1 : 0);

  if (isLoadingKb || isLoadingConvs) {
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
        {/* 开始提问大卡 */}
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

        {/* 统计卡片 */}
        <StatCard
          delay={160}
          icon={MessagesSquare}
          label="对话总数"
          value={convCount}
          suffix="次"
          color="#2563EB"
        />
        <StatCard
          delay={240}
          icon={MessageSquare}
          label="今日提问"
          value={todayCount}
          suffix="次"
          color="#10B981"
        />
        <StatCard
          delay={320}
          icon={Database}
          label="知识库已分配"
          value={kbCount}
          suffix="个"
          color="#8B5CF6"
        />
      </div>

      {/* 毕设进度仪表盘 */}
      <div className="mb-8" style={cardStyle(400)}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[#202938] flex items-center gap-2">
            <div className="w-1.5 h-4 bg-blue-600 rounded-full" />
            毕设进度仪表盘
          </h3>
          <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 rounded-full border border-blue-100">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">
              当前日期：{new Date().toLocaleDateString()}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-3">
          {(() => {
            const today = new Date();
            const stages = [
              { label: "选题确认", date: "2025-12-22" },
              { label: "开题报告", date: "2026-03-06" },
              { label: "中期检查", date: "2026-04-10" },
              { label: "论文定稿", date: "2026-05-22" },
              { label: "毕业答辩", date: "2026-06-15" },
            ];

            // 找到第一个未过期的阶段作为当前阶段
            let currentIndex = stages.findIndex(
              (s) => new Date(s.date) >= today,
            );
            if (currentIndex === -1) currentIndex = stages.length; // 全部完成

            return stages.map((s, i) => {
              let status: "completed" | "current" | "pending" = "pending";
              if (i < currentIndex) status = "completed";
              else if (i === currentIndex) status = "current";

              return (
                <div
                  key={s.label}
                  className={`relative p-4 rounded-2xl border transition-all duration-300 ${
                    status === "completed"
                      ? "bg-emerald-50/30 border-emerald-100"
                      : status === "current"
                        ? "bg-white border-blue-200 shadow-md ring-4 ring-blue-50"
                        : "bg-gray-50/50 border-gray-100 opacity-60"
                  }`}
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          status === "completed"
                            ? "bg-emerald-500 text-white"
                            : status === "current"
                              ? "bg-blue-600 text-white"
                              : "bg-gray-200 text-gray-500"
                        }`}
                      >
                        {status === "completed" ? "✓" : i + 1}
                      </div>
                      <span
                        className={`text-[9px] font-bold uppercase tracking-tighter px-1.5 py-0.5 rounded ${
                          status === "completed"
                            ? "text-emerald-600 bg-emerald-100/50"
                            : status === "current"
                              ? "text-blue-600 bg-blue-100/50"
                              : "text-gray-400 bg-gray-100"
                        }`}
                      >
                        {status === "completed"
                          ? "已完成"
                          : status === "current"
                            ? "进行中"
                            : "未开始"}
                      </span>
                    </div>
                    <div>
                      <p
                        className={`text-xs font-bold ${status === "pending" ? "text-gray-400" : "text-[#202938]"}`}
                      >
                        {s.label}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        截止: {s.date}
                      </p>
                    </div>
                  </div>

                  {/* 连接线 */}
                  {i < 4 && (
                    <div className="absolute top-1/2 -right-1.5 w-3 h-px bg-gray-200 z-0 hidden lg:block" />
                  )}
                </div>
              );
            });
          })()}
        </div>
      </div>

      {/* 下半区：最近对话 + FAQ */}
      <div className="grid grid-cols-2 gap-4">
        {/* 最近对话 */}
        <div
          className="glass-card rounded-2xl p-5 flex flex-col gap-3 hover-lift"
          style={cardStyle(500)}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#202938]">最近对话</h3>
            <button
              onClick={() => navigate("/student/chat")}
              className="flex items-center gap-1 text-xs text-[#6E7787] hover:text-[#2563EB] transition-colors px-2 py-1 rounded-lg hover:bg-[#EEF2FF]"
            >
              查看全部
              <ArrowRight size={12} />
            </button>
          </div>

          {recentConvs.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
              <MessagesSquare
                size={28}
                className="text-[#D9DEE5] mb-2"
                strokeWidth={1.2}
              />
              <p className="text-sm text-[#9CA3AF]">暂无对话记录</p>
              <p className="text-xs text-[#C4C9D4] mt-1">
                开始你的第一次提问吧
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {recentConvs.map((conv, i) => (
                <ConvItem key={conv.id} conv={conv} index={i} />
              ))}
            </div>
          )}
        </div>

        {/* 热门问题 */}
        <div
          className="glass-card rounded-2xl p-5 flex flex-col gap-3 hover-lift"
          style={cardStyle(480)}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#202938]">常见问题</h3>
            <button
              onClick={() => navigate("/student/faq")}
              className="flex items-center gap-1 text-xs text-[#6E7787] hover:text-[#2563EB] transition-colors px-2 py-1 rounded-lg hover:bg-[#EEF2FF]"
            >
              更多
              <ArrowRight size={12} />
            </button>
          </div>

          {!faqs || faqs.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
              <HelpCircle
                size={28}
                className="text-[#D9DEE5] mb-2"
                strokeWidth={1.2}
              />
              <p className="text-sm text-[#9CA3AF]">暂无常见问题</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {faqs.map((faq, i) => (
                <FaqItem key={faq.id} faq={faq} index={i} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="p-7 flex-1 overflow-y-auto glass-card rounded-2xl animate-pulse">
      {/* 问候区 */}
      <div className="mb-7">
        <div className="h-9 bg-gray-100 rounded-lg w-48 mb-2" />
        <div className="h-4 bg-gray-50 rounded-md w-64" />
      </div>

      {/* 快捷操作 + 统计 */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div
          className="col-span-1 rounded-2xl p-5 bg-gray-100"
          style={{ minHeight: 160 }}
        />
        <div
          className="glass-card rounded-2xl p-5 flex flex-col justify-between"
          style={{ minHeight: 160 }}
        >
          <div className="w-10 h-10 rounded-xl bg-gray-100" />
          <div className="space-y-2">
            <div className="h-7 bg-gray-100 rounded-md w-16" />
            <div className="h-3 bg-gray-50 rounded-md w-12" />
          </div>
        </div>
        <div
          className="glass-card rounded-2xl p-5 flex flex-col justify-between"
          style={{ minHeight: 160 }}
        >
          <div className="w-10 h-10 rounded-xl bg-gray-100" />
          <div className="space-y-2">
            <div className="h-7 bg-gray-100 rounded-md w-16" />
            <div className="h-3 bg-gray-50 rounded-md w-12" />
          </div>
        </div>
        <div
          className="glass-card rounded-2xl p-5 flex flex-col justify-between"
          style={{ minHeight: 160 }}
        >
          <div className="w-10 h-10 rounded-xl bg-gray-100" />
          <div className="space-y-2">
            <div className="h-7 bg-gray-100 rounded-md w-16" />
            <div className="h-3 bg-gray-50 rounded-md w-12" />
          </div>
        </div>
      </div>

      {/* 下半区 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="glass-card rounded-2xl p-5 h-64 flex flex-col gap-4">
          <div className="flex justify-between">
            <div className="h-5 bg-gray-100 rounded-md w-24" />
            <div className="h-4 bg-gray-50 rounded-md w-16" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3 items-center">
                <div className="w-8 h-8 rounded-lg bg-gray-50" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-100 rounded-md w-3/4" />
                  <div className="h-2 bg-gray-50 rounded-md w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="glass-card rounded-2xl p-5 h-64 flex flex-col gap-4">
          <div className="flex justify-between">
            <div className="h-5 bg-gray-100 rounded-md w-24" />
            <div className="h-4 bg-gray-50 rounded-md w-16" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3 items-center">
                <div className="w-8 h-8 rounded-lg bg-gray-50" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-100 rounded-md w-3/4" />
                  <div className="h-2 bg-gray-50 rounded-md w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  delay,
  icon: Icon,
  label,
  value,
  suffix,
  color,
}: {
  delay: number;
  icon: React.ElementType;
  label: string;
  value: number;
  suffix: string;
  color: string;
}) {
  return (
    <div
      className="glass-card rounded-2xl p-5 flex flex-col justify-between hover-lift"
      style={{ ...cardStyle(delay), minHeight: 160 }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center"
        style={{ background: `${color}14` }}
      >
        <Icon size={20} style={{ color }} strokeWidth={1.8} />
      </div>
      <div>
        <p className="text-2xl font-bold text-[#202938] leading-none">
          {value}
          <span className="text-sm font-normal text-[#9CA3AF] ml-1">
            {suffix}
          </span>
        </p>
        <p className="text-xs text-[#6E7787] mt-1">{label}</p>
      </div>
    </div>
  );
}

function ConvItem({ conv, index }: { conv: ConversationInfo; index: number }) {
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

function FaqItem({ faq, index }: { faq: FAQItem; index: number }) {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(`/s/faq`)}
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#EEF2FF] transition-colors group w-full text-left"
      style={{
        opacity: 0,
        animation: `appleFadeUp 0.6s cubic-bezier(0.25, 1, 0.5, 1) ${500 + index * 75}ms both`,
      }}
    >
      <div className="w-8 h-8 rounded-lg bg-[#F0FDF4] flex items-center justify-center shrink-0">
        <HelpCircle size={14} className="text-[#10B981]" strokeWidth={1.8} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-[#202938] truncate">
          {faq.question}
        </p>
        <p className="text-[10px] text-[#9CA3AF] mt-0.5">{faq.category}</p>
      </div>
      <ArrowRight
        size={12}
        className="text-[#D9DEE5] group-hover:text-[#2563EB] group-hover:translate-x-0.5 transition-all shrink-0"
      />
    </button>
  );
}
