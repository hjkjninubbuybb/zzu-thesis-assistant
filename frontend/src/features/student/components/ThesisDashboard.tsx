import React from 'react';

const cardStyle = (delay: number): React.CSSProperties => ({
  animation: `appleSettleIn 0.75s cubic-bezier(0.25, 1, 0.5, 1) ${delay}ms both`,
});

const STAGES = [
  { label: '选题确认', date: '2025-12-22' },
  { label: '开题报告', date: '2026-03-06' },
  { label: '中期检查', date: '2026-04-10' },
  { label: '论文定稿', date: '2026-05-22' },
  { label: '毕业答辩', date: '2026-06-15' },
];

export function ThesisDashboard() {
  const today = new Date();
  let currentIndex = STAGES.findIndex((s) => new Date(s.date) >= today);
  if (currentIndex === -1) currentIndex = STAGES.length;

  return (
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
            当前日期：{today.toLocaleDateString()}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3">
        {STAGES.map((s, i) => {
          let status: 'completed' | 'current' | 'pending' = 'pending';
          if (i < currentIndex) status = 'completed';
          else if (i === currentIndex) status = 'current';

          return (
            <div
              key={s.label}
              className={`relative p-4 rounded-2xl border transition-all duration-300 ${
                status === 'completed'
                  ? 'bg-emerald-50/30 border-emerald-100'
                  : status === 'current'
                    ? 'bg-white border-blue-200 shadow-md ring-4 ring-blue-50'
                    : 'bg-gray-50/50 border-gray-100 opacity-60'
              }`}
            >
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      status === 'completed'
                        ? 'bg-emerald-500 text-white'
                        : status === 'current'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {status === 'completed' ? '✓' : i + 1}
                  </div>
                  <span
                    className={`text-[9px] font-bold uppercase tracking-tighter px-1.5 py-0.5 rounded ${
                      status === 'completed'
                        ? 'text-emerald-600 bg-emerald-100/50'
                        : status === 'current'
                          ? 'text-blue-600 bg-blue-100/50'
                          : 'text-gray-400 bg-gray-100'
                    }`}
                  >
                    {status === 'completed' ? '已完成' : status === 'current' ? '进行中' : '未开始'}
                  </span>
                </div>
                <div>
                  <p
                    className={`text-xs font-bold ${status === 'pending' ? 'text-gray-400' : 'text-[#202938]'}`}
                  >
                    {s.label}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">截止: {s.date}</p>
                </div>
              </div>

              {i < 4 && (
                <div className="absolute top-1/2 -right-1.5 w-3 h-px bg-gray-200 z-0 hidden lg:block" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
