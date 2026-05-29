import { useNavigate } from "react-router-dom";
import { ArrowRight, Plus } from "lucide-react";
import type { KBInfo } from "@shared/types/api";
import { useIsAdmin } from "@shared/store/authStore";

const KB_COLORS = [
  "#E85D4A",
  "#F0C040",
  "#5EE67A",
  "#60A5FA",
  "#C084FC",
  "#FB923C",
];

function SegmentBar({
  filled,
  total,
  color,
  animate,
  baseDelay,
}: {
  filled: number;
  total: number;
  color: string;
  animate: boolean;
  baseDelay: number;
}) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="h-2 rounded-sm"
          style={{
            width: 10,
            background: i < filled ? color : "#EAE6E0",
            transformOrigin: "left center",
            animation:
              animate && i < filled
                ? `segFill 0.18s cubic-bezier(0.22,1,0.36,1) ${baseDelay + i * 45}ms both`
                : "none",
          }}
        />
      ))}
    </div>
  );
}

export function KBListCard({
  kbs,
  animate,
}: {
  kbs: KBInfo[];
  animate: boolean;
}) {
  const navigate = useNavigate();
  const isAdmin = useIsAdmin();
  const maxDocs = Math.max(...kbs.map((kb) => kb.doc_count), 1);
  const SEG_TOTAL = 10;
  return (
    <div className="glass-card rounded-2xl p-5 flex flex-col gap-4 hover-lift h-full">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#1A1A1A]">知识库列表明细</h3>
        {isAdmin && (
          <button
            onClick={() => navigate("/admin/knowledge")}
            className="flex items-center gap-1 text-xs text-[#9A9A9A] hover:text-[#1A1A1A] transition-colors px-2 py-1 rounded-lg hover:bg-[#F2EFE9]"
          >
            <Plus size={12} />
            管理
          </button>
        )}
      </div>
      <div className="flex flex-col gap-1">
        {kbs.map((kb, i) => {
          const color = KB_COLORS[i % KB_COLORS.length];
          const filled = Math.max(
            1,
            Math.round((kb.doc_count / maxDocs) * SEG_TOTAL),
          );
          return (
            <button
              key={kb.id}
              onClick={() => navigate(`/admin/documents?kb=${kb.name}`)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#F8F6F2] transition-colors group w-full text-left"
              style={{
                opacity: animate ? 1 : 0,
                transform: animate ? "translateX(0)" : "translateX(12px)",
                transition: `opacity 0.4s ease ${200 + i * 100}ms, transform 0.4s ease ${200 + i * 100}ms`,
              }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold text-white shrink-0 transition-transform duration-200 group-hover:scale-105"
                style={{ background: color }}
              >
                {kb.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[#1A1A1A] truncate">
                  {kb.name}
                </p>
                <div className="mt-1.5">
                  <SegmentBar
                    filled={filled}
                    total={SEG_TOTAL}
                    color={color}
                    animate={animate}
                    baseDelay={300 + i * 100}
                  />
                </div>
              </div>
              <div className="text-right shrink-0 ml-2">
                <p className="text-xs font-semibold text-[#1A1A1A]">
                  {kb.doc_count}
                  <span className="text-[#C8C4BC] font-normal"> 篇</span>
                </p>
              </div>
              <ArrowRight
                size={13}
                className="text-[#D4D0C8] group-hover:text-[#1A1A1A] group-hover:translate-x-0.5 transition-all duration-200 shrink-0"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
