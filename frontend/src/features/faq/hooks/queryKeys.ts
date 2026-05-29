export const faqKeys = {
  all: (kbName: string) => ["faq", kbName] as const,
  list: (kbName: string) => ["faq", kbName, "list"] as const,
  search: (kbName: string, q: string) => ["faq", kbName, "search", q] as const,
};
