import type { MentorRecentEvent, MentorEventType } from '@shared/types/api';

const EVENT_LABEL: Record<MentorEventType, string> = {
  ticket_created: '提交了求助',
  ticket_replied: '工单已回复',
  ticket_closed: '工单已关闭',
};

function ago(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return `${sec} 秒前`;
  if (sec < 3600) return `${Math.floor(sec / 60)} 分钟前`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} 小时前`;
  return `${Math.floor(sec / 86400)} 天前`;
}

interface Props {
  events: MentorRecentEvent[];
}

export function RecentEventsCard({ events }: Props) {
  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="text-xs text-[#6F7A75] font-medium mb-3">最近事件</div>
      {events.length === 0 ? (
        <div className="text-sm text-[#9CA3AF]">暂无事件</div>
      ) : (
        <ul className="flex flex-col gap-2 max-h-72 overflow-y-auto custom-scrollbar">
          {events.map((e, idx) => (
            <li
              key={`${e.ticket_id}-${e.event_type}-${idx}`}
              className="flex items-start gap-3 text-xs"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-[#0F766E] mt-1.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[#1F2937]">
                  <span className="font-semibold">{e.student_name}</span>{' '}
                  <span className="text-[#6F7A75]">{EVENT_LABEL[e.event_type]}</span>
                </div>
                <div className="truncate text-[#9CA3AF] mt-0.5">{e.ticket_title}</div>
                <div className="text-[10px] text-[#B0B7B4] mt-0.5">{ago(e.occurred_at)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
