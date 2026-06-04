import { configApi } from '@shared/lib/api';
import type { ConfigUpdate } from '@shared/types/api';

export const settingsService = {
  get: () => configApi.get(),
  update: (payload: ConfigUpdate) => configApi.update(payload),
  getApiInfo: () => configApi.getApiInfo(),
  testConnection: () => configApi.testConnection(),
};
