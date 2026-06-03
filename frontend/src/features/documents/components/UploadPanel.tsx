import { useState, useRef, useCallback } from 'react';
import { Upload, Loader2, X, FileText, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import type { DocType, UploadParams } from '@shared/types/api';
import type { UploadItem } from '@shared/store/uploadStore';
import { UploadParamsPanel } from './UploadParamsPanel';

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function UploadStatusIcon({ status }: { status: 'pending' | 'uploading' | 'done' | 'error' }) {
  if (status === 'pending') return <Clock size={14} className="text-gray-400" />;
  if (status === 'uploading') return <Loader2 size={14} className="animate-spin text-blue-500" />;
  if (status === 'done') return <CheckCircle size={14} className="text-emerald-500" />;
  return <AlertCircle size={14} className="text-red-500" />;
}

interface UploadPanelProps {
  activeType: DocType;
  badge: string;
  typeLabel: string;
  activeUploads: UploadItem[];
  onUpload: (files: File[], params: UploadParams) => void;
  onRemoveItem: (id: string) => void;
  defaultParams: UploadParams;
}

export function UploadPanel({
  activeType,
  badge,
  typeLabel,
  activeUploads,
  onUpload,
  onRemoveItem,
  defaultParams,
}: UploadPanelProps) {
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [params, setParams] = useState<UploadParams>(defaultParams);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addStaged = useCallback((files: FileList | File[]) => {
    setStagedFiles((prev) => [...prev, ...Array.from(files)]);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length) addStaged(e.dataTransfer.files);
    },
    [addStaged],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) addStaged(e.target.files);
    e.target.value = '';
  };

  const handleStartUpload = () => {
    if (!stagedFiles.length) return;
    onUpload(stagedFiles, { ...params, doc_type: activeType });
    setStagedFiles([]);
  };

  const handleParamChange = <K extends keyof UploadParams>(key: K, value: UploadParams[K]) =>
    setParams((p) => ({ ...p, [key]: value }));

  const showQueue = activeUploads.length > 0;

  return (
    <div className="mb-6 glass-card rounded-lg p-5">
      <h2 className="text-sm font-medium text-gray-700 mb-3">
        上传
        <span className={`ml-2 text-xs px-2 py-0.5 rounded font-semibold ${badge}`}>
          {typeLabel}
        </span>
      </h2>

      {/* Drop zone (hidden while uploading) */}
      {!showQueue && (
        <>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
              dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.md,.docx,.doc"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
            <Upload size={24} className="mx-auto text-gray-400 mb-2" />
            <p className="text-sm text-gray-600">
              拖拽文件到此处，或 <span className="text-blue-600">点击选择</span>
            </p>
            <p className="text-xs text-gray-400 mt-1">支持 .pdf / .docx / .txt / .md，可多选</p>
          </div>

          {stagedFiles.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {stagedFiles.map((file, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-3 py-2 rounded-md bg-gray-50 border border-gray-100"
                >
                  <FileText size={14} className="text-gray-400 shrink-0" />
                  <span className="text-sm text-gray-800 truncate flex-1 min-w-0">{file.name}</span>
                  <span className="text-xs text-gray-400 shrink-0">{formatSize(file.size)}</span>
                  <button
                    onClick={() => setStagedFiles((prev) => prev.filter((_, j) => j !== i))}
                    className="text-gray-400 hover:text-gray-600 shrink-0"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <UploadParamsPanel
            params={params}
            open={advancedOpen}
            onToggle={() => setAdvancedOpen((v) => !v)}
            onChange={handleParamChange}
          />

          <div className="mt-4">
            <button
              onClick={handleStartUpload}
              disabled={stagedFiles.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Upload size={14} />
              开始上传
              {stagedFiles.length > 0 ? ` (${stagedFiles.length})` : ''}
            </button>
          </div>
        </>
      )}

      {/* Active upload queue */}
      {showQueue && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-3">
            <Loader2 size={14} className="animate-spin text-blue-500" />
            <span className="text-sm font-medium text-gray-700">入库中 — {typeLabel}</span>
          </div>
          {activeUploads.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 px-3 py-2 rounded-md bg-gray-50 border border-gray-100"
            >
              <UploadStatusIcon status={item.status} />
              <FileText size={14} className="text-gray-400 shrink-0" />
              <span className="text-sm text-gray-800 truncate flex-1 min-w-0">
                {item.file.name}
              </span>
              <span className="text-xs text-gray-400 shrink-0">{formatSize(item.file.size)}</span>
              {item.status === 'uploading' && (
                <div className="w-24 bg-gray-200 rounded-full h-1.5 shrink-0">
                  <div
                    className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              )}
              {item.status === 'pending' && (
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
    </div>
  );
}
