import { useState } from 'react';
import { Loader2, Download } from 'lucide-react';
import { chatService } from '../services/chatService';
import type { FileItem } from '@shared/types/api';

const EXT_COLORS: Record<string, string> = {
  pdf: 'bg-red-500',
  docx: 'bg-blue-500',
  doc: 'bg-blue-500',
  xlsx: 'bg-green-600',
  xls: 'bg-green-600',
  pptx: 'bg-orange-500',
  ppt: 'bg-orange-500',
  txt: 'bg-gray-500',
};

export function FileCard({ file }: { file: FileItem }) {
  const ext = file.file_name.split('.').pop()?.toLowerCase() ?? '';
  const badgeColor = EXT_COLORS[ext] ?? 'bg-gray-500';
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const { token } = await chatService.getDownloadToken(file.url);
      const a = document.createElement('a');
      a.href = `${file.url}?token=${token}`;
      a.download = file.file_name;
      a.click();
    } catch {
      // 静默失败，不打断用户
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      onClick={handleDownload}
      className="cursor-pointer flex items-center gap-3 bg-[#F7F5F1] border border-[#E8E4DC] rounded-xl px-3 py-2.5 hover:bg-[#F0EDE8] transition-colors group"
    >
      <div
        className={`${badgeColor} text-white text-[10px] font-bold uppercase rounded-md px-1.5 py-1 min-w-[2.2rem] text-center leading-none`}
      >
        {ext || 'FILE'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{file.file_name}</p>
        <p className="text-xs text-gray-400">{file.size_kb} KB</p>
      </div>
      {downloading ? (
        <Loader2 size={14} className="text-gray-400 shrink-0 animate-spin" />
      ) : (
        <Download size={14} className="text-gray-400 group-hover:text-gray-600 shrink-0" />
      )}
    </div>
  );
}
