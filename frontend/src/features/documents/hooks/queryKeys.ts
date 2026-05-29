export const documentKeys = {
  all: (kbName: string) => ["documents", kbName] as const,
  list: (kbName: string) => ["documents", kbName, "list"] as const,
  review: (kbName: string, docId: number) =>
    ["documents", kbName, docId, "review"] as const,
};
