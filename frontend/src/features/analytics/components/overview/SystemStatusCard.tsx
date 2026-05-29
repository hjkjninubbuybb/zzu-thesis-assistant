import { CheckCircle2, Loader2, AlertCircle, Cpu } from "lucide-react";
import type { SystemConfig } from "@shared/types/api";

export function SystemStatusCard({
  animate,
  config,
  activeKbName,
  health,
  healthLoading,
}: {
  animate: boolean;
  config: SystemConfig | undefined;
  activeKbName: string | undefined;
  health: Record<string, boolean> | undefined;
  healthLoading: boolean;
}) {
  const services = [
    { label: "FastAPI 后端", ok: health?.fastapi ?? null, delay: 200 },
    { label: "Qdrant 向量库", ok: health?.qdrant ?? null, delay: 350 },
    { label: "DashScope LLM", ok: health?.dashscope ?? null, delay: 500 },
    { label: "Reranker 引擎", ok: health?.reranker ?? null, delay: 800 },
  ];

  const allOk = health != null && Object.values(health).every(Boolean);

  return (
    <div
      className="rounded-2xl p-6 flex flex-col gap-5 hover-lift h-full"
      style={{ background: "#4A4438", color: "#FFFFFF" }}
    >
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[15px] font-semibold">系统运行状态</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-[11px]" style={{ color: "#A09A8D" }}>
              生效知识库：
            </p>
            <span className="text-[11px] font-medium text-[#5EE67A]">
              {activeKbName || "未分配"}
            </span>
          </div>
        </div>
        <div
          className="w-2 h-2 rounded-full"
          style={{
            background:
              health == null ? "#5A5A5A" : allOk ? "#5EE67A" : "#FF6B6B",
            boxShadow:
              health == null
                ? "none"
                : allOk
                  ? "0 0 8px #5EE67A"
                  : "0 0 8px #FF6B6B",
            animation:
              animate && allOk ? "dotPulse 2s ease-in-out infinite" : "none",
          }}
        />
      </div>

      <div className="flex flex-col gap-2.5">
        {healthLoading
          ? services.map((s) => (
              <div
                key={s.label}
                className="flex items-center justify-between"
                style={{
                  opacity: animate ? 1 : 0,
                  transition: `opacity 0.4s ease ${s.delay}ms`,
                }}
              >
                <span className="text-xs" style={{ color: "#A09A8D" }}>
                  {s.label}
                </span>
                <div className="flex items-center gap-1.5">
                  <Loader2
                    size={12}
                    className="animate-spin"
                    style={{ color: "#5A5A5A" }}
                  />
                  <span className="text-xs" style={{ color: "#5A5A5A" }}>
                    检测中
                  </span>
                </div>
              </div>
            ))
          : services.map((s) => (
              <div
                key={s.label}
                className="flex items-center justify-between"
                style={{
                  opacity: animate ? 1 : 0,
                  transform: animate ? "translateX(0)" : "translateX(-8px)",
                  transition: `opacity 0.4s ease ${s.delay}ms, transform 0.4s ease ${s.delay}ms`,
                }}
              >
                <span className="text-xs" style={{ color: "#A09A8D" }}>
                  {s.label}
                </span>
                <div className="flex items-center gap-1.5">
                  {s.ok === null ? (
                    <Loader2
                      size={12}
                      className="animate-spin"
                      style={{ color: "#5A5A5A" }}
                    />
                  ) : s.ok ? (
                    <CheckCircle2 size={12} style={{ color: "#5EE67A" }} />
                  ) : (
                    <AlertCircle size={12} style={{ color: "#FF6B6B" }} />
                  )}
                  <span
                    className="text-xs"
                    style={{
                      color:
                        s.ok === null
                          ? "#5A5A5A"
                          : s.ok
                            ? "#5EE67A"
                            : "#FF6B6B",
                    }}
                  >
                    {s.ok === null ? "检测中" : s.ok ? "运行中" : "不可用"}
                  </span>
                </div>
              </div>
            ))}
      </div>

      <div
        className="pt-4 flex flex-col gap-2"
        style={{ borderTop: "1px solid #5C564D" }}
      >
        <div className="flex items-center gap-1.5">
          <Cpu size={12} style={{ color: "#8A8478" }} strokeWidth={1.6} />
          <span className="text-[11px]" style={{ color: "#8A8478" }}>
            模型配置
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            config?.llm.model || "未加载",
            config?.reranker.model || "无重排",
          ].map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-2 py-0.5 rounded-full"
              style={{
                background: "#3D382E",
                color: "#A09A8D",
                border: "1px solid #544E45",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
