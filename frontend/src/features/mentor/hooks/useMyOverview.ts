import { useQuery } from '@tanstack/react-query';
import { mentorService } from '../services/mentorService';
import { mentorKeys } from './queryKeys';

export function useMyOverview() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: mentorKeys.overview(),
    queryFn: mentorService.getOverview,
  });
  return { overview: data, isLoading, isError, refetch };
}
