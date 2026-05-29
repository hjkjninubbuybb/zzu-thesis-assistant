import { Loader2, Check } from "lucide-react";

export interface ThinkingStep {
  id: string;
  label: string;
  status: "pending" | "active" | "done";
  input?: string;
}

export function ThinkingProcess({ steps }: { steps: ThinkingStep[] }) {
  if (steps.length === 0) return null;
  return (
    <div className="flex flex-col gap-2.5 mb-6 pl-12 animate-apple-fade-up">
      <div className="flex items-center gap-2 text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">
        <Loader2 size={12} className="animate-spin" />
        Agent 思考过程
      </div>
      <div className="space-y-2">
        {steps.map((step) => (
          <div key={step.id} className="flex items-center gap-3">
            <div
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                step.status === "active"
                  ? "bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                  : step.status === "done"
                    ? "bg-emerald-500"
                    : "bg-gray-200"
              }`}
            />
            <div className="flex flex-col min-w-0">
              <span
                className={`text-xs font-medium truncate ${
                  step.status === "pending" ? "text-gray-300" : "text-gray-600"
                }`}
              >
                {step.label}
              </span>
              {step.input && step.status !== "pending" && (
                <span className="text-[10px] text-gray-400 truncate italic">
                  "{step.input}"
                </span>
              )}
            </div>
            {step.status === "done" && (
              <Check size={10} className="text-emerald-500 shrink-0" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ConversationSkeleton() {
  return (
    <div className="flex-1 overflow-hidden p-6 space-y-8 animate-pulse">
      <div className="flex gap-4">
        <div className="w-8 h-8 rounded-xl bg-gray-100 shrink-0" />
        <div className="flex-1 space-y-3 pt-1">
          <div className="h-4 bg-gray-100 rounded-md w-3/4" />
          <div className="h-4 bg-gray-100 rounded-md w-1/2" />
        </div>
      </div>
      <div className="flex justify-end">
        <div className="h-10 bg-gray-100 rounded-2xl w-2/3" />
      </div>
      <div className="flex gap-4">
        <div className="w-8 h-8 rounded-xl bg-gray-100 shrink-0" />
        <div className="flex-1 space-y-3 pt-1">
          <div className="h-4 bg-gray-100 rounded-md w-full" />
          <div className="h-4 bg-gray-100 rounded-md w-5/6" />
          <div className="h-4 bg-gray-100 rounded-md w-4/6" />
        </div>
      </div>
    </div>
  );
}
