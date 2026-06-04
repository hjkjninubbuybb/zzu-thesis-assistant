import { ticketApi, faqApi, knowledgeApi } from '@shared/lib/api';
import { extractError } from '@shared/lib/errorHandler';
import type { QARequestCreate } from '@shared/types/api';

export const ticketService = {
  listAll: (page: number, pageSize: number, studentId?: number) =>
    ticketApi.list(page, pageSize, studentId),
  listMine: (page: number, pageSize: number, studentId?: number) =>
    ticketApi.list(page, pageSize, studentId),
  create: (payload: QARequestCreate) => ticketApi.create(payload),
  reply: (id: number, answer: string) => ticketApi.reply(id, answer),
  close: (id: number) => ticketApi.close(id),
  createFaq: async (kbName: string, question: string, answer: string, category: string) => {
    await faqApi.create(kbName, {
      question,
      answer,
      category,
      sort_order: 0,
    });
  },
  listKbs: () => knowledgeApi.list(),
  extractError,
};
