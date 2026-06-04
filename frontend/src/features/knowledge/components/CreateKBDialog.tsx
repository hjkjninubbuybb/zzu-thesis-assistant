import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import type { KBCreate } from '@shared/types/api';

interface CreateKBDialogProps {
  isCreating: boolean;
  createError: Error | null;
  onClose: () => void;
  onSubmit: (payload: KBCreate) => void;
}

const NAME_PATTERN = /^[a-zA-Z0-9_\-一-鿿]+$/;

export function CreateKBDialog({
  isCreating,
  createError,
  onClose,
  onSubmit,
}: CreateKBDialogProps) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [nameError, setNameError] = useState('');

  const validate = () => {
    if (!name.trim()) {
      setNameError('名称不能为空');
      return false;
    }
    if (!NAME_PATTERN.test(name.trim())) {
      setNameError('只支持字母、数字、下划线、中文');
      return false;
    }
    setNameError('');
    return true;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    onSubmit({ name: name.trim(), description: desc.trim() });
  };

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-40 animate-apple-fade">
      <div className="glass-card rounded-xl p-6 w-full max-w-sm mx-4 animate-apple-pop">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">新建知识库</h3>
          <button onClick={onClose}>
            <X size={18} className="text-gray-400 hover:text-gray-600" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              名称 <span className="text-red-500">*</span>
            </label>
            <input
              className={`w-full border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400 ${nameError ? 'border-red-400' : 'border-gray-300'}`}
              placeholder="字母/数字/下划线/中文"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              autoFocus
            />
            {nameError && <p className="text-xs text-red-500 mt-1">{nameError}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
            <input
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
              placeholder="可选"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          </div>
          {createError && (
            <p className="text-xs text-red-500">
              {createError instanceof Error ? createError.message : String(createError)}
            </p>
          )}
        </div>
        <div className="mt-5 flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md border border-gray-300 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={isCreating}
            className="px-4 py-2 text-sm rounded-md bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-60 flex items-center gap-2"
          >
            {isCreating && <Loader2 size={14} className="animate-spin" />}
            创建
          </button>
        </div>
      </div>
    </div>
  );
}
