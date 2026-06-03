import { useQuery } from '@tanstack/react-query';
import { analyticsService } from '../services/analyticsService';
import { analyticsKeys } from './queryKeys';

export function useAnalytics() {
  return useQuery({
    queryKey: analyticsKeys.summary(),
    queryFn: analyticsService.getSummary,
    staleTime: 60_000,
  });
}
