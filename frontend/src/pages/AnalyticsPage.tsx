import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  MessageSquare,
  Zap,
  BookOpen,
  Users,
  ThumbsUp,
  ThumbsDown,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { analyticsApi } from "@/lib/api";
import type { AnalyticsSummary } from "@/types/api";

/* ══════════════════════ Animation hooks ══════════════════════ */

function useCountUp(target: number, duration = 1000, enabled = true) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    setCount(0);
    if (!target) return;
    let startTs: number;
    let raf: number;
    const tick = (ts: number) => {
      startTs ??= ts;
      const p = Math.min((ts - startTs) / duration, 1);
      setCount(Math.round((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, enabled]);
  return count;
}

function useDelayedTrue(delayMs: number) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);
  return ready;
}

/* ══════════════════════ Stat Card ══════════════════════ */

function StatCard({
  label,
  value,
  sub,
  icon,
  color,
  animate,
  delay,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  color: string;
  animate: boolean;
  delay: number;
}) {
  return (
    <div
      className="glass-card rounded-2xl p-5 flex flex-col gap-3 hover-lift"
      style={{
        animation: animate
          ? `appleSettleIn 0.75s cubic-bezier(0.25,1,0.5,1) ${delay}ms both`
          : "none",
      }}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-[#9A9A9A]">{label}</p>
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: `${color}18` }}
        >
          <span style={{ color }}>{icon}</span>
        </div>
      </div>
      <div>
        <p className="text-[28px] font-bold text-[#1A1A1A] leading-none">
          {value}
        </p>
        <p className="text-xs text-[#B8B4AC] mt-1.5">{sub}</p>
      </div>
    </div>
  );
}

/* ══════════════════════ Bar Chart ══════════════════════ */

function BarChart({
  data,
  animate,
}: {
  data: AnalyticsSummary["week_data"];
  animate: boolean;
}) {
  const maxVal = Math.max(...data.map((d) => d.count), 1);
  const today = new Date().toISOString().slice(0, 10);
  const formatDay = (iso: string) => {
    if (iso === today) return "今天";
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  return (
    <div
      className="glass-card rounded-2xl p-6 flex flex-col gap-5 hover-lift h-full"
      style={{
        animation: animate
          ? "appleSettleIn 0.75s cubic-bezier(0.25,1,0.5,1) 280ms both"
          : "none",
      }}
    >
      <div>
        <h3 className="text-sm font-semibold text-[#1A1A1A]">
          每日提问活跃趋势
        </h3>
        <p className="text-xs text-[#9A9A9A] mt-0.5">近 7 天学生提问次数统计</p>
      </div>

      {data.every((d) => d.count === 0) ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-[#C8C4BC]">
          <MessageSquare size={28} strokeWidth={1.2} />
          <p className="text-xs">暂无提问记录</p>
        </div>
      ) : (
        <div className="flex items-end gap-2 flex-1">
          {data.map((d, i) => {
            const pct = d.count / maxVal;
            const isToday = d.day === today;
            return (
              <div
                key={d.day}
                className="flex-1 flex flex-col items-center gap-1.5"
              >
                <span
                  className="text-[10px] font-semibold"
                  style={{
                    color: isToday ? "#1A1A1A" : "#C0BAB0",
                    opacity: animate ? 1 : 0,
                    transition: `opacity 0.4s ease ${400 + i * 70}ms`,
                  }}
                >
                  {d.count > 0 ? d.count : ""}
                </span>
                <div
                  className="w-full rounded-lg relative overflow-hidden"
                  style={{ height: 110, background: "#F5F2ED" }}
                >
                  <div
                    className="absolute bottom-0 left-0 right-0 rounded-lg"
                    style={{
                      height: animate ? `${pct * 100}%` : "0%",
                      background: isToday
                        ? "linear-gradient(180deg,#E85D4A,#F0C040)"
                        : pct > 0.75
                          ? "#D4CFC6"
                          : "#E8E4DC",
                      transition: `height 0.85s cubic-bezier(0.22,1,0.36,1) ${280 + i * 70}ms`,
                    }}
                  />
                </div>
                <span
                  className="text-[9px]"
                  style={{
                    color: isToday ? "#1A1A1A" : "#B8B4AC",
                    fontWeight: isToday ? 600 : 400,
                  }}
                >
                  {formatDay(d.day)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════ Recent Questions ══════════════════════ */

function RecentQuestionsCard({
  questions,
  animate,
}: {
  questions: AnalyticsSummary["recent_questions"];
  animate: boolean;
}) {
  const formatTime = (iso: string) => {
    const d = new Date(iso),
      today = new Date();
    if (d.toDateString() === today.toDateString())
      return d.toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
      });
    return `${d.getMonth() + 1}/${d.getDate()} ${d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  };
  return (
    <div
      className="glass-card rounded-2xl p-6 flex flex-col gap-4 hover-lift"
      style={{
        animation: animate
          ? "appleSettleIn 0.75s cubic-bezier(0.25,1,0.5,1) 340ms both"
          : "none",
      }}
    >
      <div>
        <h3 className="text-sm font-semibold text-[#1A1A1A]">最近提问明细</h3>
        <p className="text-xs text-[#9A9A9A] mt-0.5">
          展示学生最近 10 条真实提问内容
        </p>
      </div>
      {questions.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-10 gap-2 text-[#C8C4BC]">
          <MessageSquare size={28} strokeWidth={1.2} />
          <p className="text-xs">暂无提问记录</p>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {questions.map((q, i) => (
            <div
              key={i}
              className="flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-[#F8F6F2] transition-colors"
              style={{
                opacity: animate ? 1 : 0,
                transform: animate ? "translateX(0)" : "translateX(12px)",
                transition: `opacity 0.35s ease ${200 + i * 50}ms, transform 0.35s ease ${200 + i * 50}ms`,
              }}
            >
              <div
                className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-bold text-white shrink-0 mt-0.5"
                style={{ background: i < 3 ? "#E85D4A" : "#D4D0C8" }}
              >
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[#2A2A2A] leading-relaxed line-clamp-2">
                  {q.content}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[9px] text-[#C0BAB0]">
                    {formatTime(q.created_at)}
                  </span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#F0EDE8] text-[#9A9A9A]">
                    {q.kb_name}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════ Feedback Card ══════════════════════ */

function FeedbackCard({
  up,
  down,
  animate,
}: {
  up: number;
  down: number;
  animate: boolean;
}) {
  const total = up + down,
    upPct = total > 0 ? Math.round((up / total) * 100) : 0;
  const size = 110,
    strokeW = size * 0.08,
    r = (size - strokeW * 2) / 2,
    cx = size / 2,
    cy = size / 2,
    circumference = 2 * Math.PI * r,
    arcFrac = 0.75,
    arcLen = circumference * arcFrac,
    filled = animate ? (upPct / 100) * arcLen : 0;
  return (
    <div
      className="glass-card rounded-2xl p-6 flex flex-col gap-5 hover-lift"
      style={{
        animation: animate
          ? "appleSettleIn 0.75s cubic-bezier(0.25,1,0.5,1) 400ms both"
          : "none",
      }}
    >
      <div>
        <h3 className="text-sm font-semibold text-[#1A1A1A]">满意度分布</h3>
        <p className="text-xs text-[#9A9A9A] mt-0.5">回答点赞与反馈统计</p>
      </div>
      {total === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-6 gap-2 text-[#C8C4BC]">
          <ThumbsUp size={24} strokeWidth={1.2} />
          <p className="text-xs">暂无反馈</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-center">
            <div
              className="relative flex items-center justify-center"
              style={{ width: size, height: size }}
            >
              <svg
                width={size}
                height={size}
                style={{ transform: "rotate(-225deg)", display: "block" }}
              >
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke="#F0EDE8"
                  strokeWidth={strokeW}
                  strokeDasharray={`${arcLen} ${circumference}`}
                  strokeLinecap="round"
                />
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke="#5EE67A"
                  strokeWidth={strokeW}
                  strokeDasharray={`${filled} ${circumference}`}
                  strokeLinecap="round"
                  style={{
                    transition:
                      "stroke-dasharray 1.4s cubic-bezier(0.22,1,0.36,1)",
                  }}
                />
              </svg>
              <div className="absolute text-center">
                <p className="text-2xl font-bold text-[#1A1A1A] leading-none">
                  {upPct}%
                </p>
                <p className="text-[10px] text-[#B8B4AC] mt-1">满意度</p>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2.5 pt-4 border-t border-[#F0EDE8]">
            {[
              {
                label: "好评",
                value: up,
                icon: <ThumbsUp size={12} />,
                color: "#5EE67A",
              },
              {
                label: "差评",
                value: down,
                icon: <ThumbsDown size={12} />,
                color: "#E85D4A",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between"
              >
                <div
                  className="flex items-center gap-2"
                  style={{ color: item.color }}
                >
                  {item.icon}
                  <span className="text-xs text-[#6A6A6A]">{item.label}</span>
                </div>
                <span
                  className="text-sm font-bold"
                  style={{ color: item.color }}
                >
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ══════════════════════ Main Page ══════════════════════ */

export default function AnalyticsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["analytics-summary"],
    queryFn: analyticsApi.summary,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const headerReady = useDelayedTrue(50),
    statsReady = useDelayedTrue(data ? 100 : 99999),
    chartReady = useDelayedTrue(data ? 200 : 99999),
    recentReady = useDelayedTrue(data ? 340 : 99999),
    fbReady = useDelayedTrue(data ? 280 : 99999);
  const totalDisplay = useCountUp(data?.total_questions ?? 0, 1200, statsReady),
    todayDisplay = useCountUp(data?.today_questions ?? 0, 900, statsReady),
    convDisplay = useCountUp(data?.total_conversations ?? 0, 1000, statsReady);
  const feedbackTotal = (data?.feedback_up ?? 0) + (data?.feedback_down ?? 0),
    upPct =
      feedbackTotal > 0
        ? Math.round(((data?.feedback_up ?? 0) / feedbackTotal) * 100)
        : 0,
    upPctDisplay = useCountUp(upPct, 1100, statsReady);

  return (
    <div className="p-7 flex-1 overflow-y-auto glass-card rounded-2xl">
      <div
        className="mb-7"
        style={{
          opacity: headerReady ? 1 : 0,
          transform: headerReady ? "translateY(0)" : "translateY(16px)",
          transition: "opacity 0.5s ease, transform 0.5s ease",
        }}
      >
        <h1 className="text-[28px] font-semibold text-[#1A1A1A] tracking-tight leading-tight">
          使用统计
        </h1>
        <p className="text-sm text-[#9A9A9A] mt-1">
          师生交互热度与系统服务质量追踪
        </p>
      </div>
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-[#9A9A9A] py-16 justify-center">
          <Loader2 size={16} className="animate-spin" />
          加载深度分析中...
        </div>
      )}
      {isError && (
        <div className="flex items-center gap-2 text-sm text-red-500 py-8 justify-center">
          <AlertCircle size={16} />
          数据获取失败
        </div>
      )}
      {data && (
        <>
          <div className="grid grid-cols-4 gap-4 mb-4">
            <StatCard
              label="累计提问"
              value={totalDisplay.toLocaleString()}
              sub="系统上线至今"
              icon={<MessageSquare size={15} />}
              color="#E85D4A"
              animate={statsReady}
              delay={80}
            />
            <StatCard
              label="今日提问活跃"
              value={String(todayDisplay)}
              sub={`今日 ${new Date().toLocaleDateString()}`}
              icon={<BookOpen size={15} />}
              color="#5EE67A"
              animate={statsReady}
              delay={160}
            />
            <StatCard
              label="累计对话"
              value={convDisplay.toLocaleString()}
              sub="全校师生共建"
              icon={<Users size={15} />}
              color="#60A5FA"
              animate={statsReady}
              delay={240}
            />
            <StatCard
              label="系统满意度"
              value={feedbackTotal > 0 ? `${upPctDisplay}%` : "--"}
              sub={
                feedbackTotal > 0
                  ? `共 ${feedbackTotal} 条真实评价`
                  : "暂无评价"
              }
              icon={<Zap size={15} />}
              color="#F0C040"
              animate={statsReady}
              delay={320}
            />
          </div>
          <div
            className="grid grid-cols-3 gap-4 mb-4"
            style={{ minHeight: 320 }}
          >
            <div className="col-span-2">
              <BarChart data={data.week_data} animate={chartReady} />
            </div>
            <div className="col-span-1">
              <FeedbackCard
                up={data.feedback_up}
                down={data.feedback_down}
                animate={fbReady}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4">
            <RecentQuestionsCard
              questions={data.recent_questions}
              animate={recentReady}
            />
          </div>
        </>
      )}
    </div>
  );
}
