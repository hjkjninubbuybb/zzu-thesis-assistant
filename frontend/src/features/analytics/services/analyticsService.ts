import { analyticsApi } from '@shared/lib/api';

export const analyticsService = {
  getSummary: () => analyticsApi.summary(),
};
