export const knowledgeKeys = {
  all: () => ["knowledge"] as const,
  list: () => ["knowledge-bases"] as const,
  active: () => ["active-kb"] as const,
  adminActive: () => ["admin-kb"] as const,
};
