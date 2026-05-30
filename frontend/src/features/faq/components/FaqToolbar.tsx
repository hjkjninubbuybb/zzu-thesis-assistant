import { useRef, useState, useEffect } from "react";
import {
  Plus,
  Search,
  Loader2,
  Sparkles,
  Download,
  FileText,
  Upload,
  ChevronDown,
  X,
} from "lucide-react";
import type { KBInfo } from "@shared/types/api";

interface StatPillProps {
  label: string;
  value: number;
}

function StatPill({ label, value }: StatPillProps) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F2EFE9] rounded-full">
      <span className="text-sm font-bold text-[#334155]">{value}</span>
      <span className="text-xs text-[#8A8A8A]">{label}</span>
    </div>
  );
}

interface FaqToolbarProps {
  kbs: KBInfo[] | undefined;
  selectedKb: string;
  onKbChange: (val: string) => void;
  searchText: string;
  onSearchChange: (val: string) => void;
  isSearching: boolean;
  isAiSearch: boolean;
  totalCount: number;
  approvedCount: number;
  isAdmin: boolean;
  onImportClick: () => void;
  onCreateClick: () => void;
  onExportExcel: () => void;
  onDownloadTemplate: () => void;
  onClearSearch: () => void;
}

/** Toolbar row: KB selector, search, stats, import/export menu, create button. */
export function FaqToolbar({
  kbs,
  selectedKb,
  onKbChange,
  searchText,
  onSearchChange,
  isSearching,
  isAiSearch,
  totalCount,
  approvedCount,
  isAdmin,
  onImportClick,
  onCreateClick,
  onExportExcel,
  onDownloadTemplate,
  onClearSearch,
}: FaqToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
    };
    if (menuOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <select
        value={selectedKb}
        onChange={(e) => onKbChange(e.target.value)}
        className="border border-[#E8E4DC] rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400 bg-white min-w-[140px]"
      >
        <option value="">— 选择知识库 —</option>
        {kbs?.map((kb) => (
          <option key={kb.id} value={kb.name}>
            {kb.name}
          </option>
        ))}
      </select>

      {selectedKb && (
        <>
          <div className="relative flex-1 min-w-[200px]">
            {isSearching ? (
              <Loader2
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A8A8A] animate-spin"
              />
            ) : (
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
            )}
            <input
              value={searchText}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="混合搜索 FAQ（语义+关键词）..."
              className="w-full border border-[#E8E4DC] rounded-xl pl-9 pr-12 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400 bg-white transition-colors"
            />
            {searchText ? (
              <button
                onClick={onClearSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-[#8A8A8A] hover:text-[#334155] hover:bg-[#F2EFE9] transition-colors"
              >
                <X size={12} />
              </button>
            ) : (
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#F2EFE9] text-[#8A8A8A]">
                <Sparkles size={10} />
                AI
              </div>
            )}
          </div>

          <StatPill label="条 FAQ" value={totalCount} />
          <StatPill label="已发布" value={approvedCount} />

          {isAdmin && (
            <div ref={menuRef} className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 px-3.5 py-2 border border-[#E8E4DC] text-[#334155] text-sm rounded-xl hover:bg-[#F8F6F2] transition-colors"
              >
                <Download size={14} />
                导入/导出
                <ChevronDown
                  size={12}
                  className={`transition-transform duration-150 ${menuOpen ? "rotate-180" : ""}`}
                />
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 top-full mt-1 bg-white border border-[#F0EDE8] rounded-xl shadow-lg z-30 overflow-hidden w-44 py-1 animate-apple-pop"
                  style={{ transformOrigin: "top right" }}
                >
                  <button
                    onClick={() => {
                      onDownloadTemplate();
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#334155] hover:bg-[#F8F6F2] transition-colors text-left"
                  >
                    <FileText size={14} className="text-[#8A8A8A]" />
                    下载模板
                  </button>
                  <button
                    onClick={() => {
                      onExportExcel();
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#334155] hover:bg-[#F8F6F2] transition-colors text-left"
                  >
                    <Download size={14} className="text-[#8A8A8A]" />
                    导出 Excel
                  </button>
                  <div className="my-1 border-t border-[#F0EDE8]" />
                  <button
                    onClick={() => {
                      onImportClick();
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#334155] hover:bg-[#F8F6F2] transition-colors text-left"
                  >
                    <Upload size={14} className="text-[#8A8A8A]" />从 Excel 导入
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            onClick={onCreateClick}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white text-sm rounded-xl hover:bg-slate-800 transition-colors"
          >
            <Plus size={15} />
            新增 FAQ
          </button>
        </>
      )}
    </div>
  );
}
