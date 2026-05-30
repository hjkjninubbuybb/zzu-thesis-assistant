import { useQuery } from "@tanstack/react-query";
import { knowledgeSharedService } from "@shared/services/knowledgeSharedService";

export function useActiveKb() {
  return useQuery({
    queryKey: ["active-kb"],
    queryFn: knowledgeSharedService.getActiveKb,
  });
}
