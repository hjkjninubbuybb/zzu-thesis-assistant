import { useState, useRef } from 'react';
import { X, Loader2, Upload, FileText } from 'lucide-react';
import { faqService } from '../services/faqService';
import { getErrorMessage } from '@shared/lib/errorHandler';
import type { FAQImportResult } from '@shared/types/api';

interface FaqImportDialogProps {
  kbName: string;
  onClose: () => void;
  onImported: () => void;
  showToast: (msg: string, type: 'success' | 'error') => void;
}

/** Excel import dialog for bulk FAQ upload. */
export function FaqImportDialog({ kbName, onClose, onImported, showToast }: FaqImportDialogProps) {
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'result'>('idle');
  const [result, setResult] = useState<FAQImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      showToast('请上传 .xlsx 格式的 Excel 文件', 'error');
      return;
    }
    setPhase('uploading');
    try {
      const r = await faqService.importExcel(kbName, file);
      setResult(r);
      setPhase('result');
      if (r.success > 0) onImported();
    } catch (e) {
      setPhase('idle');
      showToast(getErrorMessage(e), 'error');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-40 p-4 animate-apple-fade">
      <div className="glass-card rounded-2xl w-full max-w-md animate-apple-pop">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#F0EDE8]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#F2EFE9] flex items-center justify-center">
              <Upload size={14} className="text-[#334155]" />
            </div>
            <h3 className="text-sm font-semibold text-[#334155]">从 Excel 导入 FAQ</h3>
          </div>
          {phase !== 'uploading' && (
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-[#F8F6F2] flex items-center justify-center transition-colors"
            >
              <X size={15} />
            </button>
          )}
        </div>

        <div className="px-6 py-5">
          {phase === 'idle' && (
            <>
              <div
                onDrop={handleDrop}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-3 transition-colors ${
                  dragOver
                    ? 'border-slate-400 bg-[#F2EFE9]'
                    : 'border-[#E8E4DC] hover:border-[#C8C4BC] hover:bg-[#FAFAF9]'
                }`}
              >
                <div className="w-12 h-12 rounded-xl bg-[#F2EFE9] flex items-center justify-center">
                  <FileText size={22} className="text-[#334155]" strokeWidth={1.4} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-[#334155]">点击选择或拖拽文件到此处</p>
                  <p className="text-xs mt-1 text-[#A0A0A0]">
                    仅支持 .xlsx 格式，文件大小不超过 5MB
                  </p>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="mt-4 flex items-center justify-center gap-1 text-xs text-[#8A8A8A]">
                <span>没有模板？</span>
                <button
                  onClick={() => faqService.downloadTemplate(kbName)}
                  className="text-[#334155] font-medium underline underline-offset-2 hover:opacity-70 transition-opacity"
                >
                  下载填写模板
                </button>
              </div>
            </>
          )}

          {phase === 'uploading' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 size={32} className="animate-spin text-[#334155]" />
              <div className="text-center">
                <p className="text-sm font-semibold text-[#334155]">正在上传并向量化…</p>
                <p className="text-xs mt-1 text-[#A0A0A0]">
                  批量向量化可能需要一些时间，请耐心等待
                </p>
              </div>
            </div>
          )}

          {phase === 'result' && result && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { label: '总行数', value: result.total, color: '#334155' },
                  { label: '成功', value: result.success, color: '#10B981' },
                  { label: '跳过', value: result.skipped, color: '#F59E0B' },
                  { label: '失败', value: result.failed, color: '#EF4444' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-[#F8F6F2] rounded-xl py-3 px-2">
                    <p className="text-lg font-bold" style={{ color }}>
                      {value}
                    </p>
                    <p className="text-[11px] mt-0.5 text-[#8A8A8A]">{label}</p>
                  </div>
                ))}
              </div>
              {result.errors.length > 0 && (
                <div className="max-h-48 overflow-y-auto space-y-1.5">
                  <p className="text-xs font-semibold text-[#334155] uppercase tracking-wide mb-2">
                    错误明细
                  </p>
                  {result.errors.map((err, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2.5 bg-red-50 rounded-lg px-3 py-2.5 text-xs"
                    >
                      {err.row > 0 && (
                        <span className="shrink-0 font-mono text-red-400">第{err.row}行</span>
                      )}
                      <span className="text-red-600 flex-1 leading-relaxed">
                        {err.question && (
                          <span className="font-medium text-red-700">"{err.question}" — </span>
                        )}
                        {err.reason}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {phase === 'result' && (
          <div className="flex justify-end px-6 py-4 border-t border-[#F0EDE8] bg-[#FAFAF9] rounded-b-2xl">
            <button
              onClick={onClose}
              className="px-5 py-2 text-sm rounded-xl bg-slate-700 text-white hover:bg-slate-800 transition-colors"
            >
              完成
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
