/** Filter chips for FAQ category and status. */
interface FaqFilterBarProps {
  categories: string[];
  categoryFilter: string;
  onCategoryChange: (cat: string) => void;
  statusFilter: string;
  onStatusChange: (s: string) => void;
}

const STATUS_OPTIONS = ['全部', '待审核', '已发布', '已驳回', '草稿'];

export function FaqFilterBar({
  categories,
  categoryFilter,
  onCategoryChange,
  statusFilter,
  onStatusChange,
}: FaqFilterBarProps) {
  const chipClass = (active: boolean) =>
    `text-xs px-2.5 py-1 rounded-full border transition-all ${
      active
        ? 'bg-slate-700 text-white border-transparent'
        : 'bg-white border-[#E8E4DC] text-gray-600 hover:bg-[#F8F6F2]'
    }`;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-medium text-[#8A8A8A]">分类:</span>
      {['全部', ...categories].map((cat) => (
        <button
          key={cat}
          onClick={() => onCategoryChange(cat)}
          className={chipClass(categoryFilter === cat)}
        >
          {cat}
        </button>
      ))}
      <span className="mx-1 text-[#E8E4DC]">|</span>
      <span className="text-xs font-medium text-[#8A8A8A]">状态:</span>
      {STATUS_OPTIONS.map((s) => (
        <button key={s} onClick={() => onStatusChange(s)} className={chipClass(statusFilter === s)}>
          {s}
        </button>
      ))}
    </div>
  );
}
