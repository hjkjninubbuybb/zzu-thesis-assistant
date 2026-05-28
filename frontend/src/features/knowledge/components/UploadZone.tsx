import { useRef, useCallback } from "react";
import {
  FileText,
  Loader2,
  Upload,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  Clock,
  AlertCircle,
  X,
} from "lucide-react";
import type { DocType, SplitterType, UploadParams } from "@shared/types/api";

// ── Types ──────────────────────────────────────────────────

export type FileStatus = "pending" | "uploading" | "done" | "error";

export interface QueueItem {
  id: string;
  file: File;
  status: FileStatus;
  progress: number;
  chunks?: number;
  error?: string;
}

// ── Constants ──────────────────────────────────────────────

export const DEFAULT_UPLOAD_PARAMS: UploadParams = {
  splitter_type: "recursive",
  chunk_size: 256,
  chunk_overlap_ratio: 0.2,
  enable_cleaning: true,
  doc_type: "policy",
};

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  policy: "政策文件",
  manual: "操作手册",
  form: "填报模板",
};

// ── Helpers ────────────────────────────────────────────────

export function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function StatusIcon({ status }: { status: FileStatus }) {
  if (status === "pending")
    return <Clock size={13} className="text-gray-400" />;
  if (status === "uploading")
    return <Loader2 size={13} className="animate-spin text-[#334155]" />;
  if (status === "done")
    return <CheckCircle size={13} className="text-emerald-500" />;
  return <AlertCircle size={13} className="text-red-500" />;
}

// ── UploadZone ─────────────────────────────────────────────

interface UploadZoneProps {
  kbName: string;
  queue: QueueItem[];
  params: UploadParams;
  advancedOpen: boolean;
  uploading: boolean;
  onAddFiles: (files: FileList | File[]) => void;
  onRemoveItem: (id: string) => void;
  onClearDone: () => void;
  onParamsChange: (p: UploadParams) => void;
  onToggleAdvanced: () => void;
  onStartUpload: () => void;
}

export function UploadZone({
  kbName,
  queue,
  params,
  advancedOpen,
  uploading,
  onAddFiles,
  onRemoveItem,
  onClearDone,
  onParamsChange,
  onToggleAdvanced,
  onStartUpload,
}: UploadZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer.files.length) onAddFiles(e.dataTransfer.files);
    },
    [onAddFiles],
  );

  const pendingCount = queue.filter((q) => q.status === "pending").length;
  const hasDone = queue.some((q) => q.status === "done");

  return (
    <div className="p-5 border-b border-[#F0EDE8]">
      <p className="text-xs font-semibold text-[#334155] mb-3">上传文档</p>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors border-[#E8E4DE] hover:border-[#C8C4BE]"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.md,.docx,.doc"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) onAddFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <Upload
          size={20}
          className="mx-auto mb-2"
          style={{ color: "#8A8A8A" }}
        />
        <p className="text-sm" style={{ color: "#8A8A8A" }}>
          拖拽文件到此处，或{" "}
          <span className="text-[#334155] font-medium">点击选择</span>
        </p>
        <p className="text-xs mt-1" style={{ color: "#AAAAAA" }}>
          支持 .pdf / .txt / .md / .docx / .doc，可多选
        </p>
      </div>

      {queue.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {queue.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white border border-[#F0EDE8]"
            >
              <StatusIcon status={item.status} />
              <FileText size={13} className="text-gray-400 shrink-0" />
              <span className="text-sm text-gray-800 truncate flex-1 min-w-0">
                {item.file.name}
              </span>
              <span className="text-xs shrink-0" style={{ color: "#8A8A8A" }}>
                {formatSize(item.file.size)}
              </span>
              {item.status === "uploading" && (
                <div className="w-20 bg-gray-200 rounded-full h-1 shrink-0">
                  <div
                    className="bg-slate-700 h-1 rounded-full transition-all"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              )}
              {item.status === "done" && item.chunks !== undefined && (
                <span className="text-xs text-emerald-600 shrink-0">
                  {item.chunks} chunks
                </span>
              )}
              {item.status === "error" && (
                <span
                  className="text-xs text-red-500 shrink-0 max-w-32 truncate"
                  title={item.error}
                >
                  {item.error}
                </span>
              )}
              {item.status === "pending" && (
                <button
                  onClick={() => onRemoveItem(item.id)}
                  className="text-gray-400 hover:text-gray-600 shrink-0"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4">
        <p className="text-xs font-medium text-gray-600 mb-2">文档类型</p>
        <div className="flex gap-2">
          {(Object.entries(DOC_TYPE_LABELS) as [DocType, string][]).map(
            ([val, label]) => (
              <button
                key={val}
                onClick={() => onParamsChange({ ...params, doc_type: val })}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                  params.doc_type === val
                    ? "bg-slate-700 text-white border-slate-400"
                    : "border-[#E8E4DE] text-gray-700 hover:bg-[#F2EFE9]"
                }`}
              >
                {label}
              </button>
            ),
          )}
        </div>
      </div>

      <button
        onClick={onToggleAdvanced}
        className="mt-4 flex items-center gap-1 text-xs hover:text-gray-700 transition-colors"
        style={{ color: "#8A8A8A" }}
      >
        {advancedOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        高级参数
      </button>

      {advancedOpen && (
        <div className="mt-3 grid grid-cols-2 gap-4 pt-3 border-t border-[#F0EDE8]">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              切分策略
            </label>
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
              Chunk 大小{" "}
              <span className="text-gray-400">{params.chunk_size}</span>
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
              Overlap 比例{" "}
              <span className="text-gray-400">
                {params.chunk_overlap_ratio.toFixed(2)}
              </span>
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
              onChange={(e) =>
                onParamsChange({ ...params, enable_cleaning: e.target.checked })
              }
              className="rounded"
            />
            <label
              htmlFor={`cleaning-${kbName}`}
              className="text-sm text-gray-600 cursor-pointer"
            >
              启用 LLM 清洗{" "}
              <span className="text-xs text-gray-400">（较慢）</span>
            </label>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={onStartUpload}
          disabled={pendingCount === 0 || uploading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white text-sm rounded-xl hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {uploading ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Upload size={13} />
          )}
          {uploading
            ? "入库中..."
            : `上传入库${pendingCount > 0 ? ` (${pendingCount})` : ""}`}
        </button>
        {hasDone && !uploading && (
          <button
            onClick={onClearDone}
            className="text-xs hover:text-gray-700 transition-colors"
            style={{ color: "#8A8A8A" }}
          >
            清除已完成
          </button>
        )}
      </div>
    </div>
  );
}
