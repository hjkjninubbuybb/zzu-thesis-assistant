import { useQuery } from "@tanstack/react-query";
import { faqService } from "../services/faqService";
import { faqKeys } from "./queryKeys";

export function useFaqSearch(kbName: string, query: string) {
  return useQuery({
    queryKey: faqKeys.search(kbName, query),
    queryFn: () => faqService.search(kbName, query),
    enabled: !!kbName && query.length > 0,
    staleTime: 30_000,
  });
}
