import { knowledgeApi } from '@shared/lib/api';
import type { KBCreate } from '@shared/types/api';

export const knowledgeService = {
  list: () => knowledgeApi.list(),
  create: (payload: KBCreate) => knowledgeApi.create(payload),
  delete: (name: string) => knowledgeApi.delete(name),
  setActive: (name: string) => knowledgeApi.setActiveKb(name),
  clearActive: () => knowledgeApi.clearActiveKb(),
  getActive: () => knowledgeApi.getActiveKb(),
  setAdminActive: (name: string) => knowledgeApi.setAdminKb(name),
  clearAdminActive: () => knowledgeApi.clearAdminKb(),
  getAdminActive: () => knowledgeApi.getAdminKb(),
};
