import { useMyOverview } from '../hooks/useMyOverview';
import { TodayPendingCard } from './cards/TodayPendingCard';
import { WeeklyActivityCard } from './cards/WeeklyActivityCard';
import { SilentStudentsCard } from './cards/SilentStudentsCard';
import { RecentEventsCard } from './cards/RecentEventsCard';

export function TeacherHome() {
  const { overview, isLoading, isError } = useMyOverview();

  if (isLoading) {
    return (
      <div className="px-8 py-8 flex-1 overflow-y-auto glass-card rounded-2xl">
        <div className="text-sm text-[#6F7A75]">加载中...</div>
      </div>
    );
  }

  if (isError || !overview) {
    return (
      <div className="px-8 py-8 flex-1 overflow-y-auto glass-card rounded-2xl">
        <div className="text-sm text-red-500">加载失败，请稍后重试</div>
      </div>
    );
  }

  return (
    <div className="px-8 py-8 flex-1 overflow-y-auto glass-card rounded-2xl custom-scrollbar">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#1F2937]">导师工作台</h1>
        <p className="mt-1 text-sm text-[#6F7A75]">今天的待办、学生活跃和最近事件一览</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <TodayPendingCard count={overview.pending_tickets} />
        <div className="lg:col-span-2">
          <WeeklyActivityCard data={overview.weekly_activity} />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SilentStudentsCard students={overview.silent_students} />
        <RecentEventsCard events={overview.recent_events} />
      </div>
    </div>
  );
}
