import { useQuery } from "@tanstack/react-query";
import { configSharedService } from "@shared/services/configSharedService";

export function useSystemConfig() {
  return useQuery({
    queryKey: ["system-config"],
    queryFn: configSharedService.get,
  });
}
