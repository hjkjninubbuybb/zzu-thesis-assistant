import { streamChat, buildHistory } from "@shared/lib/streamChat";
import {
  conversationApi,
  knowledgeApi,
  faqApi,
  documentApi,
  ticketApi,
} from "@shared/lib/api";

export { buildHistory };

export const chatService = {
  stream: streamChat,
  buildHistory,

  // Knowledge
  getActiveKb: () => knowledgeApi.getActiveKb(),
  getAdminKb: () => knowledgeApi.getAdminKb(),

  // Conversations
  listConversations: (params?: {
    kb_name?: string;
    cursor_id?: number;
    cursor_updated_at?: string;
    limit?: number;
  }) => conversationApi.list(params),
  createConversation: (kbName: string, title?: string) =>
    conversationApi.create(kbName, title),
  getConversation: (convId: number) => conversationApi.get(convId),
  deleteConversation: (convId: number) => conversationApi.delete(convId),
  updateTitle: (convId: number, title: string) =>
    conversationApi.updateTitle(convId, title),
  summarizeTitle: (convId: number) => conversationApi.summarizeTitle(convId),

  // Messages
  addMessage: (
    convId: number,
    msg: {
      role: string;
      content: string;
      sources?: unknown[] | null;
      files?: unknown[] | null;
    },
  ) => conversationApi.addMessage(convId, msg),
  submitFeedback: (msgId: number, rating: "up" | "down") =>
    conversationApi.submitFeedback(msgId, rating),

  // FAQs
  listFaqs: (kbName: string) => faqApi.list(kbName),

  // Documents
  getDownloadToken: (url: string) => documentApi.getDownloadToken(url),

  // Tickets
  createTicket: (body: {
    conversation_id: number;
    message_id: number;
    question: string;
  }) => ticketApi.create(body),
};
