export const documentKeys = {
  all: (kbName: string) => ['documents', kbName] as const,
  list: (kbName: string, page: number, docType?: string) =>
    ['documents', kbName, 'list', page, docType ?? ''] as const,
  review: (kbName: string, docId: number) => ['documents', kbName, docId, 'review'] as const,
};
