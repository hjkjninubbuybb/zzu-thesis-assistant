import { knowledgeApi } from "@shared/lib/api";

export const knowledgeSharedService = {
  list: () => knowledgeApi.list(),
};
