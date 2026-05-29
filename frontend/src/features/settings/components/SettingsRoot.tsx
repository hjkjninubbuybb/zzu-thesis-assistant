import { Loader2, Save } from "lucide-react";
import { useSettings, useModelOptions } from "../hooks/useSettings";
import { useApiKeyManager } from "../hooks/useApiKeyManager";
import { ApiKeySection } from "./ApiKeySection";
import { ModelSettings } from "./ModelSettings";
import { RetrievalSettings } from "./RetrievalSettings";
import { AgentSettings } from "./AgentSettings";
import { SplitterSettings } from "./SplitterSettings";

const settle = (d: number): React.CSSProperties => ({
  animation: `appleSettleIn 0.75s cubic-bezier(0.25, 1, 0.5, 1) ${d}ms both`,
});

export function SettingsRoot() {
  const { form, isLoading, set, saveMutation } = useSettings();
  const apiKeyManager = useApiKeyManager();
  const { combinedLlmModels, combinedEmbeddingModels, combinedRerankerModels } =
    useModelOptions(apiKeyManager.availableModels);

  if (isLoading) {
    return (
      <div className="p-6 flex items-center gap-2 text-stone-500 text-sm">
        <Loader2 size={16} className="animate-spin" />
        加载配置中...
      </div>
    );
  }

  return (
    <div className="p-6 flex-1 overflow-y-auto glass-card rounded-2xl">
      <div className="flex items-center justify-between mb-6" style={settle(0)}>
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">系统配置</h1>
          <p className="mt-1 text-sm text-stone-500">
            管理模型、检索和 RAG 核心参数
          </p>
        </div>
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="flex items-center gap-2 px-5 py-2.5 bg-stone-800 text-white text-sm rounded-lg hover:bg-stone-900 disabled:opacity-60 transition-colors shadow-sm"
        >
          {saveMutation.isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Save size={14} />
          )}
          保存配置
        </button>
      </div>

      <div className="space-y-4">
        <div style={settle(80)}>
          <ApiKeySection manager={apiKeyManager} />
        </div>

        <div style={settle(160)}>
          <ModelSettings
            form={form}
            set={set}
            llmModels={combinedLlmModels}
            embeddingModels={combinedEmbeddingModels}
            rerankerModels={combinedRerankerModels}
          />
        </div>

        <div style={settle(240)}>
          <RetrievalSettings form={form} set={set} />
        </div>

        <div style={settle(320)}>
          <AgentSettings form={form} set={set} />
        </div>

        <div style={settle(400)}>
          <SplitterSettings form={form} set={set} />
        </div>
      </div>
    </div>
  );
}
