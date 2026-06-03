import { useEnqueue, useUploadQueue, useClearDone, useRemoveItem } from '@shared/store/uploadStore';
import type { DocType, UploadParams } from '@shared/types/api';

export function useDocumentUpload(kbName: string, docType: DocType) {
  const enqueue = useEnqueue();
  const clearDone = useClearDone();
  const removeItem = useRemoveItem();
  const queue = useUploadQueue().filter((q) => q.kbName === kbName && q.docType === docType);

  const upload = (files: File[], params: UploadParams) => enqueue(kbName, docType, files, params);

  const clearCompleted = () => clearDone(kbName, docType);

  return { queue, upload, clearCompleted, removeItem };
}
