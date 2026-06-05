import { useQuery } from '@tanstack/react-query';
import { mentorService } from '../services/mentorService';
import { mentorKeys } from './queryKeys';

export function useMyStudents() {
  const { data, isLoading } = useQuery({
    queryKey: mentorKeys.students(),
    queryFn: mentorService.listMyStudents,
  });
  return { students: data ?? [], isLoading };
}
