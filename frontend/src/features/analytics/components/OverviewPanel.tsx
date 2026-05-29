import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { knowledgeApi, configApi } from "@shared/lib/api";
import { useIsAdmin } from "@shared/store/authStore";
import { useAnalytics } from "../hooks/useAnalytics";
import { useDelayedTrue } from "../hooks/animationHooks";
import { BlobCard } from "./overview/BlobCard";
import { SystemStatusCard } from "./overview/SystemStatusCard";
import { SatisfactionCard } from "./overview/SatisfactionCard";
import { ActivityCard } from "./overview/ActivityCard";
import { KBListCard } from "./overview/KBListCard";

export function OverviewPanel() {
  const isAdmin = useIsAdmin();
  const { data: kbs, isLoading: kbLoading } = useQuery({
    queryKey: ["knowledge-bases"],
    queryFn: knowledgeApi.list,
  });
  const { data: analytics, isLoading: statsLoading } = useAnalytics();
  const { data: config } = useQuery({
    queryKey: ["system-config"],
    queryFn: configApi.get,
  });
  const { data: activeKb } = useQuery({
    queryKey: ["admin-active-kb"],
    queryFn: knowledgeApi.getAdminKb,
  });

  const isLoading = kbLoading || statsLoading;
  const blobReady = useDelayedTrue(50);
  const statusReady = useDelayedTrue(150);
  const satReady = useDelayedTrue(250);
  const actReady = useDelayedTrue(350);
  const listReady = useDelayedTrue(200);

  const cardStyle = (delay: number): React.CSSProperties => ({
    animation: `appleSettleIn 0.75s cubic-bezier(0.25, 1, 0.5, 1) ${delay}ms both`,
  });

  const upTotal =
    (analytics?.feedback_up ?? 0) + (analytics?.feedback_down ?? 0);
  const upPct =
    upTotal > 0 ? Math.round((analytics!.feedback_up / upTotal) * 100) : 0;

  return (
    <div className="p-7 flex-1 overflow-y-auto glass-card rounded-2xl">
      <div className="mb-7" style={cardStyle(0)}>
        <h1 className="text-[28px] font-semibold text-[#1A1A1A] tracking-tight leading-tight">
          概览
        </h1>
        <p className="text-sm text-[#9A9A9A] mt-1">
          系统资产概况与实时运行监控
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-[#9A9A9A] py-16 justify-center">
          <Loader2 size={16} className="animate-spin" />
          正在构建概览视图...
        </div>
      )}

      {!isLoading && (
        <div className="grid grid-cols-3 gap-6">
          <div
            className={isAdmin ? "col-span-2" : "col-span-3"}
            style={cardStyle(80)}
          >
            <BlobCard
              animate={blobReady}
              kbCount={kbs?.length || 0}
              docCount={analytics?.doc_count || 0}
              faqCount={analytics?.faq_count || 0}
            />
          </div>
          {isAdmin && (
            <div className="col-span-1" style={cardStyle(160)}>
              <SystemStatusCard
                animate={statusReady}
                config={config}
                activeKbName={activeKb?.kb_name}
              />
            </div>
          )}
          <div className="col-span-1 flex flex-col gap-4">
            <div style={cardStyle(240)}>
              <SatisfactionCard
                upPct={upPct}
                feedbackCount={upTotal}
                animate={satReady}
              />
            </div>
            <div style={cardStyle(320)}>
              <ActivityCard
                todayQs={analytics?.today_questions || 0}
                animate={actReady}
              />
            </div>
          </div>
          <div className="col-span-2" style={cardStyle(200)}>
            <KBListCard kbs={kbs || []} animate={listReady} />
          </div>
        </div>
      )}
    </div>
  );
}
