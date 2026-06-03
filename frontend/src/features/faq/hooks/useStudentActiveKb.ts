import { useQuery } from '@tanstack/react-query';
import { faqService } from '../services/faqService';
import { faqKeys } from './queryKeys';

/**
 * 学生端激活知识库查询，供 FAQ 浏览页确定要展示哪个知识库的 FAQ。
 */
export function useStudentActiveKb() {
  return useQuery({
    queryKey: faqKeys.studentActiveKb(),
    queryFn: faqService.getActiveKb,
  });
}
