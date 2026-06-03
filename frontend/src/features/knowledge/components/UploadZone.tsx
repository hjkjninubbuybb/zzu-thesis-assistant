import { useRef, useCallback } from 'react';
import { Loader2, Upload } from 'lucide-react';
import type { DocType, UploadParams } from '@shared/types/api';
import { UploadQueueList } from './UploadQueueList';
import { UploadParamsPanel } from './UploadParamsPanel';

// ── Types ──────────────────────────────────────────────────

export type FileStatus = 'pending' | 'uploading' | 'done' | 'error';

export interface QueueItem {
  id: string;
  file: File;
  status: FileStatus;
  progress: number;
  chunks?: number;
  error?: string;
}

// ── Constants ──────────────────────────────────────────────

// eslint-disable-next-line react-refresh/only-export-components
export const DEFAULT_UPLOAD_PARAMS: UploadParams = {
  splitter_type: 'recursive',
  chunk_size: 256,
  chunk_overlap_ratio: 0.2,
  enable_cleaning: true,
  doc_type: 'policy',
};

// eslint-disable-next-line react-refresh/only-export-components
export const DOC_TYPE_LABELS: Record<DocType, string> = {
  policy: '政策文件',
  manual: '操作手册',
  form: '填报模板',
};

// ── Helpers ────────────────────────────────────────────────

// eslint-disable-next-line react-refresh/only-export-components
export const formatSize = (bytes: number): string => {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

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

  const pendingCount = queue.filter((q) => q.status === 'pending').length;
  const hasDone = queue.some((q) => q.status === 'done');

  return (
    <div className="p-5 border-b border-[#F0EDE8]">
      <p className="text-xs font-semibold text-[#334155] mb-3">上传文档</p>

      {/* Drop zone */}
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
            e.target.value = '';
          }}
        />
        <Upload size={20} className="mx-auto mb-2" style={{ color: '#8A8A8A' }} />
        <p className="text-sm" style={{ color: '#8A8A8A' }}>
          拖拽文件到此处，或 <span className="text-[#334155] font-medium">点击选择</span>
        </p>
        <p className="text-xs mt-1" style={{ color: '#AAAAAA' }}>
          支持 .pdf / .txt / .md / .docx / .doc，可多选
        </p>
      </div>

      {/* Queue */}
      <UploadQueueList queue={queue} onRemoveItem={onRemoveItem} />

      {/* Params (doc-type + advanced) */}
      <UploadParamsPanel
        kbName={kbName}
        params={params}
        advancedOpen={advancedOpen}
        onParamsChange={onParamsChange}
        onToggleAdvanced={onToggleAdvanced}
      />

      {/* Action buttons */}
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={onStartUpload}
          disabled={pendingCount === 0 || uploading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white text-sm rounded-xl hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          {uploading ? '入库中...' : `上传入库${pendingCount > 0 ? ` (${pendingCount})` : ''}`}
        </button>
        {hasDone && !uploading && (
          <button
            onClick={onClearDone}
            className="text-xs hover:text-gray-700 transition-colors"
            style={{ color: '#8A8A8A' }}
          >
            清除已完成
          </button>
        )}
      </div>
    </div>
  );
}
