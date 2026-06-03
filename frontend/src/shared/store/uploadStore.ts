import { create } from 'zustand';
import type { DocType, UploadParams, CleanResult } from '@shared/types/api';

export type UploadStatus = 'pending' | 'uploading' | 'done' | 'error';

export interface UploadItem {
  id: string;
  file: File;
  kbName: string;
  docType: DocType;
  params: UploadParams;
  status: UploadStatus;
  progress: number;
  cleanResult?: CleanResult;
  errorMsg?: string;
}

interface UploadState {
  queue: UploadItem[];
  enqueue: (kbName: string, docType: DocType, files: File[], params: UploadParams) => void;
  updateItem: (id: string, patch: Partial<UploadItem>) => void;
  removeItem: (id: string) => void;
  clearDone: (kbName: string, docType: DocType) => void;
}

const useUploadStore = create<UploadState>((set) => ({
  queue: [],

  enqueue: (kbName, docType, files, params) => {
    const items: UploadItem[] = files.map((file) => ({
      id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
      file,
      kbName,
      docType,
      params,
      status: 'pending',
      progress: 0,
    }));
    set((s) => ({ queue: [...s.queue, ...items] }));
  },

  updateItem: (id, patch) =>
    set((s) => ({
      queue: s.queue.map((q) => (q.id === id ? { ...q, ...patch } : q)),
    })),

  removeItem: (id) =>
    set((s) => ({
      queue: s.queue.filter((q) => !(q.id === id && q.status !== 'uploading')),
    })),

  clearDone: (kbName, docType) =>
    set((s) => ({
      queue: s.queue.filter(
        (q) => !(q.kbName === kbName && q.docType === docType && q.status === 'done'),
      ),
    })),
}));

// Selector hooks
export const useUploadQueue = () => useUploadStore((s) => s.queue);
export const useEnqueue = () => useUploadStore((s) => s.enqueue);
export const useRemoveItem = () => useUploadStore((s) => s.removeItem);
export const useClearDone = () => useUploadStore((s) => s.clearDone);
export const useUpdateItem = () => useUploadStore((s) => s.updateItem);

export default useUploadStore;
