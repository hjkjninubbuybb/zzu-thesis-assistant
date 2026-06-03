import { useQuery } from '@tanstack/react-query';
import { knowledgeSharedService } from '@shared/services/knowledgeSharedService';

export function useAdminKb() {
  return useQuery({
    queryKey: ['admin-active-kb'],
    queryFn: knowledgeSharedService.getAdminKb,
  });
}
