import { documentApi, knowledgeApi, configApi } from "@shared/lib/api";
import type { DocUpdate } from "@shared/types/api";

export const documentService = {
  list: (kbName: string) => documentApi.list(kbName),
  get: (kbName: string, docId: number) => documentApi.get(kbName, docId),
  delete: (kbName: string, docId: number) => documentApi.delete(kbName, docId),
  reindex: (kbName: string, docId: number) =>
    documentApi.reindex(kbName, docId),
  update: (kbName: string, docId: number, payload: DocUpdate) =>
    documentApi.update(kbName, docId, payload),
  getReview: (kbName: string, docId: number) =>
    documentApi.getReview(kbName, docId).then((r) => r.data),
  confirmClean: (kbName: string, docId: number, content: string) =>
    documentApi.confirmClean(kbName, docId, content).then((r) => r.data),
  confirmIndex: (kbName: string, docId: number) =>
    documentApi.confirmIndex(kbName, docId).then((r) => r.data),
  discardDoc: (kbName: string, docId: number) =>
    documentApi.delete(kbName, docId),
  getDownloadToken: (downloadUrl: string) =>
    documentApi.getDownloadToken(downloadUrl),
  listKBs: () => knowledgeApi.list(),
  getSystemConfig: () => configApi.get(),
};
