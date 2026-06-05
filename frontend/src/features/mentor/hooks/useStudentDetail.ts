import { useQuery } from '@tanstack/react-query';
import { mentorService } from '../services/mentorService';
import { mentorKeys } from './queryKeys';

export function useStudentDetail(id: number) {
  const { data, isLoading } = useQuery({
    queryKey: mentorKeys.student(id),
    queryFn: () => mentorService.getStudent(id),
    enabled: Number.isFinite(id) && id > 0,
  });
  return { student: data, isLoading };
}
