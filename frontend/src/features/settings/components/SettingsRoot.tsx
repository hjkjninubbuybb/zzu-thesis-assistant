import { Loader2, Save } from 'lucide-react';
import { useSettings } from '../hooks/useSettings';
import { useModelOptions } from '../hooks/useModelOptions';
import { useApiKeyManager } from '../hooks/useApiKeyManager';
import { ApiKeySection } from './ApiKeySection';
import { RetrievalSettings } from './RetrievalSettings';
import { AgentSettings } from './AgentSettings';
import { SplitterSettings } from './SplitterSettings';

const settle = (d: number): React.CSSProperties => ({
  animation: `appleSettleIn 0.75s cubic-bezier(0.25, 1, 0.5, 1) ${d}ms both`,
});

export function SettingsRoot() {
  const { config, isLoading, updateConfig, updateGroup, isSaving, save } = useSettings();
  const apiKeyManager = useApiKeyManager();
  const modelOptions = useModelOptions(apiKeyManager.perGroupModels);

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
          <p className="mt-1 text-sm text-stone-500">管理模型、检索和 RAG 核心参数</p>
        </div>
        <button
          onClick={save}
          disabled={isSaving}
          className="flex items-center gap-2 px-5 py-2.5 bg-stone-800 text-white text-sm rounded-lg hover:bg-stone-900 disabled:opacity-60 transition-colors shadow-sm"
        >
          {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          保存配置
        </button>
      </div>

      <div className="space-y-4">
        <div style={settle(80)}>
          <ApiKeySection
            form={config}
            updateGroup={updateGroup}
            manager={apiKeyManager}
            modelOptions={modelOptions}
          />
        </div>

        <div style={settle(160)}>
          <RetrievalSettings form={config} set={updateConfig} />
        </div>

        <div style={settle(240)}>
          <AgentSettings form={config} set={updateConfig} />
        </div>

        <div style={settle(320)}>
          <SplitterSettings form={config} set={updateConfig} />
        </div>
      </div>
    </div>
  );
}
