import { useState } from "react";
import { BookOpen, ChevronUp, ChevronDown } from "lucide-react";
import type { SourceItem } from "@shared/types/api";

export function SourcesPanel({ sources }: { sources: SourceItem[] }) {
  const [open, setOpen] = useState(false);
  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-4 pt-3 border-t border-gray-100">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400 hover:text-gray-700 transition-colors uppercase tracking-wider"
      >
        <BookOpen size={12} />
        知识库参考 ({sources.length})
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {open && (
        <div className="mt-3 grid grid-cols-1 gap-2 animate-apple-fade-up">
          {sources.map((s, i) => (
            <div
              key={s.node_id}
              className="bg-gray-50/50 rounded-xl p-3 border border-gray-100/50"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-5 h-5 rounded-md bg-white border border-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500 shadow-sm">
                  {i + 1}
                </span>
                <span className="text-[11px] font-semibold text-gray-700 break-all">
                  {s.source_file}
                </span>
                <div className="ml-auto flex items-center gap-1 opacity-40">
                  <div className="w-1 h-1 rounded-full bg-gray-400" />
                  <span className="text-[9px] font-medium">
                    REL {Math.round(s.score * 100)}%
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-gray-500 leading-relaxed italic whitespace-pre-wrap">
                "{s.text}"
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
