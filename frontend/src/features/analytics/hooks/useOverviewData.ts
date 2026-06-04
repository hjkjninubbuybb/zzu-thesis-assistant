import { useQuery } from '@tanstack/react-query';
import { useKBList } from '@shared/hooks/useKBList';
import { useAdminKb } from '@shared/hooks/useAdminKb';
import { useSystemConfig } from '@shared/hooks/useSystemConfig';

function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const r = await fetch('/health');
      if (!r.ok) throw new Error('health check failed');
      return r.json() as Promise<Record<string, boolean>>;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useOverviewData() {
  const kbsQuery = useKBList();
  const configQuery = useSystemConfig();
  const adminKbQuery = useAdminKb();
  const healthQuery = useHealth();

  return {
    kbs: kbsQuery.data,
    kbLoading: kbsQuery.isLoading,
    config: configQuery.data,
    activeKb: adminKbQuery.data,
    health: healthQuery.data,
    healthLoading: healthQuery.isLoading,
  };
}
