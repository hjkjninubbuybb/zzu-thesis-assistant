export const conversationKeys = {
  all: () => ['conversations'] as const,
  list: (kbName: string) => ['conversations', 'list', kbName] as const,
  messages: (id: number) => ['conversations', id, 'messages'] as const,
  activeKb: () => ['active-kb'] as const,
  adminKb: () => ['admin-kb'] as const,
  faqs: (kbName: string) => ['faqs', kbName] as const,
};
