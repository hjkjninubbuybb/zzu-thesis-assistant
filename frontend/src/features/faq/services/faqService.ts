import { faqApi } from "@shared/lib/api";
import type { FAQCreate, FAQUpdate } from "@shared/types/api";

export const faqService = {
  list: (kbName: string) => faqApi.list(kbName),
  create: (kbName: string, payload: FAQCreate) =>
    faqApi.create(kbName, payload),
  update: (kbName: string, id: number, payload: FAQUpdate) =>
    faqApi.update(kbName, id, payload),
  delete: (kbName: string, id: number) => faqApi.delete(kbName, id),
  search: (kbName: string, query: string) => faqApi.search(kbName, query),
  importExcel: (kbName: string, file: File) => faqApi.importExcel(kbName, file),
  exportExcel: (kbName: string) => faqApi.exportExcel(kbName),
  downloadTemplate: (kbName: string) => faqApi.downloadTemplate(kbName),
};
