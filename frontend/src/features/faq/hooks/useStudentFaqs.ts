import { useQuery } from '@tanstack/react-query';
import { faqService } from '../services/faqService';
import { faqKeys } from './queryKeys';
import type { FAQItem } from '@shared/types/api';

export function useStudentFaqs(kbName: string) {
  return useQuery({
    queryKey: faqKeys.studentList(kbName),
    queryFn: () => faqService.list(kbName),
    enabled: !!kbName,
    select: (data: FAQItem[]) => data.filter((f) => f.enabled),
  });
}
