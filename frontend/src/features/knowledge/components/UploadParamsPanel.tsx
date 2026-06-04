import { ChevronDown, ChevronUp } from 'lucide-react';
import type { DocType, SplitterType, UploadParams } from '@shared/types/api';
import { DOC_TYPE_LABELS } from './UploadZone';

// ── UploadParamsPanel ──────────────────────────────────────

interface UploadParamsPanelProps {
  kbName: string;
  params: UploadParams;
  advancedOpen: boolean;
  onParamsChange: (p: UploadParams) => void;
  onToggleAdvanced: () => void;
}

export function UploadParamsPanel({
  kbName,
  params,
  advancedOpen,
  onParamsChange,
  onToggleAdvanced,
}: UploadParamsPanelProps) {
  return (
    <>
      {/* Doc-type selector */}
      <div className="mt-4">
        <p className="text-xs font-medium text-gray-600 mb-2">文档类型</p>
        <div className="flex gap-2">
          {(Object.entries(DOC_TYPE_LABELS) as [DocType, string][]).map(([val, label]) => (
            <button
              key={val}
              onClick={() => onParamsChange({ ...params, doc_type: val })}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                params.doc_type === val
                  ? 'bg-slate-700 text-white border-slate-400'
                  : 'border-[#E8E4DE] text-gray-700 hover:bg-[#F2EFE9]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Advanced toggle */}
      <button
        onClick={onToggleAdvanced}
        className="mt-4 flex items-center gap-1 text-xs hover:text-gray-700 transition-colors"
        style={{ color: '#8A8A8A' }}
      >
        {advancedOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        高级参数
      </button>

      {/* Advanced panel */}
      {advancedOpen && (
        <div className="mt-3 grid grid-cols-2 gap-4 pt-3 border-t border-[#F0EDE8]">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">切分策略</label>
            <select
              value={params.splitter_type}
              onChange={(e) =>
                onParamsChange({
                  ...params,
                  splitter_type: e.target.value as SplitterType,
                })
              }
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-slate-400"
            >
              <option value="recursive">Recursive（推荐）</option>
              <option value="token">Token</option>
              <option value="sentence">Sentence</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Chunk 大小 <span className="text-gray-400">{params.chunk_size}</span>
            </label>
            <input
              type="range"
              min={64}
              max={1024}
              step={64}
              value={params.chunk_size}
              onChange={(e) =>
                onParamsChange({
                  ...params,
                  chunk_size: Number(e.target.value),
                })
              }
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Overlap 比例{' '}
              <span className="text-gray-400">{params.chunk_overlap_ratio.toFixed(2)}</span>
            </label>
            <input
              type="range"
              min={0}
              max={0.5}
              step={0.05}
              value={params.chunk_overlap_ratio}
              onChange={(e) =>
                onParamsChange({
                  ...params,
                  chunk_overlap_ratio: Number(e.target.value),
                })
              }
              className="w-full"
            />
          </div>
          <div className="flex items-center gap-2 mt-4">
            <input
              type="checkbox"
              id={`cleaning-${kbName}`}
              checked={params.enable_cleaning}
              onChange={(e) => onParamsChange({ ...params, enable_cleaning: e.target.checked })}
              className="rounded"
            />
            <label htmlFor={`cleaning-${kbName}`} className="text-sm text-gray-600 cursor-pointer">
              启用 LLM 清洗 <span className="text-xs text-gray-400">（较慢）</span>
            </label>
          </div>
        </div>
      )}
    </>
  );
}
