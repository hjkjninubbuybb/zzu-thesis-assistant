import {
  FileText,
  Loader2,
  CheckCircle,
  Clock,
  AlertCircle,
  X,
} from "lucide-react";
import type { FileStatus, QueueItem } from "./UploadZone";
import { formatSize } from "./UploadZone";

// ── StatusIcon ─────────────────────────────────────────────

function StatusIcon({ status }: { status: FileStatus }) {
  if (status === "pending")
    return <Clock size={13} className="text-gray-400" />;
  if (status === "uploading")
    return <Loader2 size={13} className="animate-spin text-[#334155]" />;
  if (status === "done")
    return <CheckCircle size={13} className="text-emerald-500" />;
  return <AlertCircle size={13} className="text-red-500" />;
}

// ── UploadQueueList ────────────────────────────────────────

interface UploadQueueListProps {
  queue: QueueItem[];
  onRemoveItem: (id: string) => void;
}

export function UploadQueueList({ queue, onRemoveItem }: UploadQueueListProps) {
  if (queue.length === 0) return null;

  return (
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
  );
}
