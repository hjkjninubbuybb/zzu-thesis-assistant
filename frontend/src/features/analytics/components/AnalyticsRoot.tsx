import { MessageSquare, Zap, BookOpen, Users, Loader2, AlertCircle } from 'lucide-react';
import { useAnalytics } from '../hooks/useAnalytics';
import { useCountUp, useDelayedTrue } from '../hooks/animationHooks';
import { StatCard } from './analytics/StatCard';
import { BarChart } from './analytics/BarChart';
import { RecentQuestionsCard } from './analytics/RecentQuestionsCard';
import { FeedbackCard } from './analytics/FeedbackCard';

export function AnalyticsRoot() {
  const { data, isLoading, isError } = useAnalytics();

  const headerReady = useDelayedTrue(50);
  const statsReady = useDelayedTrue(data ? 100 : 99999);
  const chartReady = useDelayedTrue(data ? 200 : 99999);
  const recentReady = useDelayedTrue(data ? 340 : 99999);
  const fbReady = useDelayedTrue(data ? 280 : 99999);

  const totalDisplay = useCountUp(data?.total_questions ?? 0, 1200, statsReady);
  const todayDisplay = useCountUp(data?.today_questions ?? 0, 900, statsReady);
  const convDisplay = useCountUp(data?.total_conversations ?? 0, 1000, statsReady);

  const feedbackTotal = (data?.feedback_up ?? 0) + (data?.feedback_down ?? 0);
  const upPct =
    feedbackTotal > 0 ? Math.round(((data?.feedback_up ?? 0) / feedbackTotal) * 100) : 0;
  const upPctDisplay = useCountUp(upPct, 1100, statsReady);

  return (
    <div className="p-7 flex-1 overflow-y-auto glass-card rounded-2xl">
      <div
        className="mb-7"
        style={{
          opacity: headerReady ? 1 : 0,
          transform: headerReady ? 'translateY(0)' : 'translateY(16px)',
          transition: 'opacity 0.5s ease, transform 0.5s ease',
        }}
      >
        <h1 className="text-[28px] font-semibold text-[#1A1A1A] tracking-tight leading-tight">
          使用统计
        </h1>
        <p className="text-sm text-[#9A9A9A] mt-1">师生交互热度与系统服务质量追踪</p>
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
              value={feedbackTotal > 0 ? `${upPctDisplay}%` : '--'}
              sub={feedbackTotal > 0 ? `共 ${feedbackTotal} 条真实评价` : '暂无评价'}
              icon={<Zap size={15} />}
              color="#F0C040"
              animate={statsReady}
              delay={320}
            />
          </div>

          <div className="grid grid-cols-3 gap-4 mb-4" style={{ minHeight: 320 }}>
            <div className="col-span-2">
              <BarChart data={data.week_data} animate={chartReady} />
            </div>
            <div className="col-span-1">
              <FeedbackCard up={data.feedback_up} down={data.feedback_down} animate={fbReady} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <RecentQuestionsCard questions={data.recent_questions} animate={recentReady} />
          </div>
        </>
      )}
    </div>
  );
}
