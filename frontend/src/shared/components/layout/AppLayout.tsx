import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Loader2, CheckCircle, AlertCircle, FileText, X } from 'lucide-react';
import Sidebar from '@shared/components/layout/Sidebar';
import BlobBackdrop from '@shared/components/layout/BlobBackdrop';
import { useUploadProcessor } from '@shared/hooks/useUploadProcessor';
import { useUploadQueue } from '@shared/store/uploadStore';

function UploadFloat() {
  const queue = useUploadQueue();
  const isUploading = queue.some((q) => q.status === 'uploading' || q.status === 'pending');
  const [visible, setVisible] = useState(false);

  const activeItems = queue.filter((q) => q.status === 'uploading' || q.status === 'pending');

  useEffect(() => {
    if (isUploading) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(true);
    } else if (visible) {
      const timer = setTimeout(() => setVisible(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isUploading, visible]);

  if (!visible) return null;

  // show active items + last few completed
  const doneItems = queue.filter((q) => q.status === 'done' || q.status === 'error').slice(-3);
  const displayItems = [...activeItems, ...doneItems].slice(0, 6);

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-white rounded-xl shadow-xl border border-gray-100 p-4 w-72 animate-fadeSlideUp">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isUploading ? (
            <Loader2 size={14} className="animate-spin text-blue-500" />
          ) : (
            <CheckCircle size={14} className="text-emerald-500" />
          )}
          <span className="text-sm font-medium text-gray-800">
            {isUploading ? `正在上传 (${activeItems.length})` : '上传完成'}
          </span>
        </div>
        {!isUploading && (
          <button onClick={() => setVisible(false)} className="text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        )}
      </div>

      <div className="space-y-2">
        {displayItems.map((item) => (
          <div key={item.id} className="flex items-center gap-2">
            <FileText size={12} className="text-gray-400 shrink-0" />
            <span className="text-xs text-gray-700 truncate flex-1 min-w-0">{item.file.name}</span>
            {item.status === 'uploading' && (
              <div className="w-16 bg-gray-200 rounded-full h-1 shrink-0">
                <div
                  className="bg-blue-500 h-1 rounded-full transition-all duration-300"
                  style={{ width: `${item.progress}%` }}
                />
              </div>
            )}
            {item.status === 'pending' && (
              <span className="text-xs text-gray-400 shrink-0">等待</span>
            )}
            {item.status === 'done' && (
              <CheckCircle size={12} className="text-emerald-500 shrink-0" />
            )}
            {item.status === 'error' && (
              <span title={item.errorMsg}>
                <AlertCircle size={12} className="text-red-500 shrink-0" />
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AppLayout() {
  useUploadProcessor();

  return (
    <div className="relative flex h-screen w-full bg-background p-3 gap-3 overflow-hidden">
      <BlobBackdrop variant="warm" />
      <div className="relative z-10 flex w-full h-full gap-3">
        <Sidebar />
        <main className="flex-1 min-h-0 flex flex-col">
          <Outlet />
        </main>
      </div>
      <UploadFloat />
    </div>
  );
}
