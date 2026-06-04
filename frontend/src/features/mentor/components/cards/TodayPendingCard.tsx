import { Link } from 'react-router-dom';
import { Inbox } from 'lucide-react';

interface Props {
  count: number;
}

export function TodayPendingCard({ count }: Props) {
  return (
    <div className="glass-card rounded-2xl p-6 flex items-start gap-4">
      <div className="w-12 h-12 rounded-xl bg-[#0F766E]/10 flex items-center justify-center text-[#0F766E] shrink-0">
        <Inbox size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-[#6F7A75] font-medium">今日待回复</div>
        <div className="mt-1 text-3xl font-bold text-[#1F2937]">{count}</div>
        <Link
          to="/teacher/tickets"
          className="inline-block mt-2 text-xs text-[#0F766E] hover:underline"
        >
          去回复 →
        </Link>
      </div>
    </div>
  );
}
