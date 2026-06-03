import { useState, useCallback } from 'react';
import { FileText, Loader2, Trash2 } from 'lucide-react';
import { extractError } from '@shared/lib/errorHandler';
import type { DocType, UploadParams } from '@shared/types/api';
import { useKBDocuments } from '../hooks/useKBDocuments';
import {
  UploadZone,
  type QueueItem,
  DEFAULT_UPLOAD_PARAMS,
  DOC_TYPE_LABELS,
  formatSize,
} from './UploadZone';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

interface DocumentPanelProps {
  kbName: string;
  onToast: (msg: string, type: 'success' | 'error') => void;
}

export function DocumentPanel({ kbName, onToast }: DocumentPanelProps) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [params, setParams] = useState<UploadParams>(DEFAULT_UPLOAD_PARAMS);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);

  const { docs, docsLoading, deleteDoc, deleteDocPending, uploadDoc } = useKBDocuments(kbName);

  const addFiles = useCallback((files: FileList | File[]) => {
    const items: QueueItem[] = Array.from(files).map((file) => ({
      id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
      file,
      status: 'pending',
      progress: 0,
    }));
    setQueue((prev) => [...prev, ...items]);
  }, []);

  const handleDelete = (id: number) => {
    deleteDoc(id, {
      onSuccess: () => {
        setDeleteId(null);
        onToast('文档已删除', 'success');
      },
      onError: (e) => onToast(extractError(e), 'error'),
    });
  };

  const startUpload = async () => {
    const pending = queue.filter((item) => item.status === 'pending');
    if (!pending.length) return;
    setUploading(true);
    let successCount = 0;
    let failCount = 0;
    for (const item of pending) {
      setQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: 'uploading', progress: 0 } : q)),
      );
      try {
        const doc = await uploadDoc(item.file, params, (pct) =>
          setQueue((prev) => prev.map((q) => (q.id === item.id ? { ...q, progress: pct } : q))),
        );
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id ? { ...q, status: 'done', progress: 100, chunks: doc.chunk_count } : q,
          ),
        );
        successCount++;
      } catch (e) {
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id ? { ...q, status: 'error', error: extractError(e) } : q,
          ),
        );
        failCount++;
      }
    }
    setUploading(false);
    if (successCount > 0 && failCount === 0) {
      onToast(`${successCount} 个文档入库成功`, 'success');
    } else if (failCount > 0) {
      onToast(`${successCount} 成功，${failCount} 失败`, 'error');
    }
  };

  return (
    <div className="mx-0 mb-2 rounded-2xl border border-[#F0EDE8] bg-[#FDFCFA] overflow-hidden">
      <UploadZone
        kbName={kbName}
        queue={queue}
        params={params}
        advancedOpen={advancedOpen}
        uploading={uploading}
        onAddFiles={addFiles}
        onRemoveItem={(id) => setQueue((prev) => prev.filter((q) => q.id !== id))}
        onClearDone={() => setQueue((prev) => prev.filter((q) => q.status !== 'done'))}
        onParamsChange={setParams}
        onToggleAdvanced={() => setAdvancedOpen((o) => !o)}
        onStartUpload={startUpload}
      />

      {/* Document list */}
      <div className="p-5">
        <p className="text-xs font-semibold text-[#334155] mb-3">
          已入库文档{docs ? ` (${docs.length})` : ''}
        </p>

        {docsLoading && (
          <div
            className="flex items-center gap-2 text-xs py-6 justify-center"
            style={{ color: '#8A8A8A' }}
          >
            <Loader2 size={13} className="animate-spin" />
            加载中...
          </div>
        )}

        {docs && docs.length === 0 && (
          <p className="text-xs text-center py-6" style={{ color: '#AAAAAA' }}>
            暂无文档，请上传
          </p>
        )}

        {docs && docs.length > 0 && (
          <div className="space-y-1.5">
            {docs.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[#F0EDE8] bg-white hover:bg-[#F8F6F2] transition-colors"
              >
                <FileText size={14} className="text-gray-400 shrink-0" />
                <span className="text-sm text-[#334155] font-medium truncate flex-1 min-w-0">
                  {doc.file_name}
                </span>
                <span className="text-xs shrink-0 px-2 py-0.5 rounded-full bg-[#F2EFE9] text-gray-600">
                  {DOC_TYPE_LABELS[doc.doc_type as DocType] ?? doc.doc_type}
                </span>
                <span className="text-xs shrink-0" style={{ color: '#8A8A8A' }}>
                  {formatSize(doc.file_size)}
                </span>
                <span className="text-xs shrink-0" style={{ color: '#8A8A8A' }}>
                  {doc.chunk_count} chunks
                </span>
                <span className="text-xs w-24 text-right shrink-0" style={{ color: '#8A8A8A' }}>
                  {formatDate(doc.created_at)}
                </span>
                <div className="shrink-0">
                  {deleteId === doc.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: '#8A8A8A' }}>
                        确认？
                      </span>
                      <button
                        onClick={() => handleDelete(doc.id)}
                        disabled={deleteDocPending}
                        className="text-xs px-2 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 flex items-center gap-1"
                      >
                        {deleteDocPending && <Loader2 size={10} className="animate-spin" />}
                        确认
                      </button>
                      <button
                        onClick={() => setDeleteId(null)}
                        className="text-xs px-2 py-1 rounded-lg border border-gray-300 hover:bg-gray-50"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteId(doc.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
