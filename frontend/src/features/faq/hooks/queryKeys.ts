export const faqKeys = {
  all: (kbName: string) => ['faq', kbName] as const,
  list: (kbName: string, page: number) => ['faq', kbName, 'list', page] as const,
  search: (kbName: string, q: string) => ['faq', kbName, 'search', q] as const,
  studentList: (kbName: string) => ['faq', kbName, 'student-list'] as const,
  studentActiveKb: () => ['faq', 'student-active-kb'] as const,
};
