import { useQuery } from '@tanstack/react-query';
import { knowledgeSharedService } from '@shared/services/knowledgeSharedService';

export function useKBList() {
  return useQuery({
    queryKey: ['knowledge', 'list'],
    queryFn: knowledgeSharedService.list,
  });
}
