import { Loader2, X } from 'lucide-react';

interface StatusBannerProps {
  icon: React.ElementType;
  kbName: string | null;
  label: string;
  subLabel: string;
  emptyLabel: string;
  emptySubLabel: string;
  accentColor: 'indigo' | 'emerald';
  onClear: () => void;
  clearing: boolean;
}

export function StatusBanner({
  icon: Icon,
  kbName,
  label,
  subLabel,
  emptyLabel,
  emptySubLabel,
  accentColor,
  onClear,
  clearing,
}: StatusBannerProps) {
  const isIndigo = accentColor === 'indigo';
  return (
    <div
      className={`flex items-center gap-3 px-5 py-3.5 rounded-2xl ${
        kbName
          ? isIndigo
            ? 'bg-[#EEF2FF] border border-[#C7D2FE]'
            : 'bg-emerald-50 border border-emerald-200'
          : 'bg-amber-50 border border-amber-200'
      }`}
    >
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
          kbName ? (isIndigo ? 'bg-[#4F46E5]/10' : 'bg-emerald-100') : 'bg-amber-100'
        }`}
      >
        <Icon
          size={16}
          className={kbName ? (isIndigo ? 'text-[#4F46E5]' : 'text-emerald-600') : 'text-amber-600'}
        />
      </div>
      <div className="flex-1 min-w-0">
        {kbName ? (
          <>
            <p
              className={`text-sm font-medium ${isIndigo ? 'text-[#312E81]' : 'text-emerald-900'}`}
            >
              {label}：<span className="font-bold">{kbName}</span>
            </p>
            <p className={`text-xs mt-0.5 ${isIndigo ? 'text-[#4338CA]' : 'text-emerald-700'}`}>
              {subLabel}
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-amber-800">{emptyLabel}</p>
            <p className="text-xs text-amber-700 mt-0.5">{emptySubLabel}</p>
          </>
        )}
      </div>
      {kbName && (
        <button
          onClick={onClear}
          disabled={clearing}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border disabled:opacity-50 transition-colors ${
            isIndigo
              ? 'border-[#A5B4FC] text-[#4338CA] hover:bg-[#EEF2FF]'
              : 'border-emerald-300 text-emerald-700 hover:bg-emerald-100'
          }`}
        >
          {clearing ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
          取消分配
        </button>
      )}
    </div>
  );
}
