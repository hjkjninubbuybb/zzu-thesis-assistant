import { configApi } from '@shared/lib/api';

export const configSharedService = {
  get: () => configApi.get(),
};
