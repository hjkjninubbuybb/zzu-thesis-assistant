import { documentApi } from "@shared/lib/api";
import type { UploadParams } from "@shared/types/api";

export const kbDocumentService = {
  list: (kbName: string) => documentApi.list(kbName),
  delete: (kbName: string, id: number) => documentApi.delete(kbName, id),
  upload: (
    kbName: string,
    file: File,
    params: UploadParams,
    onProgress: (pct: number) => void,
  ) => documentApi.upload(kbName, file, params, onProgress),
};
