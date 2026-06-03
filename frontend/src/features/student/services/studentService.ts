import { conversationApi, faqApi, knowledgeApi, authApi } from '@shared/lib/api';

export const studentService = {
  getMyProfile: () => authApi.me(),
  changePassword: (oldPwd: string, newPwd: string) => authApi.changePassword(oldPwd, newPwd),
  listRecentConversations: (limit = 5) => conversationApi.list({ limit }),
  listAllConversations: () => conversationApi.list(),
  getActiveKb: () => knowledgeApi.getActiveKb(),
  listFaqs: (kbName: string) => faqApi.list(kbName),
};
