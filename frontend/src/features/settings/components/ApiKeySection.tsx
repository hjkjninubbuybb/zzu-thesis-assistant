import { CheckCircle, Key, Loader2, XCircle, Zap } from 'lucide-react';
import { Section } from './SettingsPrimitives';
import type { ApiGroup, GroupInfo } from '@shared/types/api';
import type { ApiGroupForm, FormState } from '../hooks/settingsForm';
import type { useApiKeyManager } from '../hooks/useApiKeyManager';
import type { ModelOption } from '../hooks/useModelOptions';

const GROUPS: { key: ApiGroup; label: string; hint: string }[] = [
  { key: 'llm', label: '推理型', hint: '逻辑路由、文档评估' },
  { key: 'fast_llm', label: '快速', hint: '最终回答生成' },
  { key: 'embedding', label: '向量', hint: '修改后需重新入库' },
  { key: 'reranker', label: '重排序', hint: '检索结果精排' },
];

interface ApiKeySectionProps {
  form: Pick<FormState, ApiGroup>;
  updateGroup: (group: ApiGroup, patch: Partial<ApiGroupForm>) => void;
  manager: ReturnType<typeof useApiKeyManager>;
  modelOptions: Record<ApiGroup, ModelOption[]>;
}

export function ApiKeySection({ form, updateGroup, manager, modelOptions }: ApiKeySectionProps) {
  const { apiInfo, testMutation } = manager;
  const testResults = testMutation.data;

  return (
    <Section icon={Key} title="API 平台配置">
      <div className="space-y-3">
        {/* Test bar */}
        <div className="flex flex-wrap items-center gap-3 pb-3 border-b border-stone-200">
          <button
            type="button"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-stone-800 text-white text-xs font-medium rounded-lg hover:bg-stone-900 disabled:opacity-50 transition-colors"
          >
            {testMutation.isPending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Zap size={12} />
            )}
            {testMutation.isPending ? '正在测试...' : '测试所有连接'}
          </button>

          {testResults && (
            <div className="flex flex-wrap gap-3 text-xs">
              {GROUPS.map(({ key, label }) => {
                const r = testResults[key];
                return (
                  <span
                    key={key}
                    className={`flex items-center gap-1 ${
                      r.ok ? 'text-emerald-600' : 'text-red-500'
                    }`}
                    title={r.message}
                  >
                    {r.ok ? <CheckCircle size={12} /> : <XCircle size={12} />}
                    {label}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[88px_1.4fr_1fr_1fr] gap-2 text-[10px] uppercase tracking-wide text-stone-400 px-1">
          <span />
          <span>API 地址</span>
          <span>API Key</span>
          <span>模型</span>
        </div>

        {/* 4 rows */}
        {GROUPS.map(({ key, label, hint }) => (
          <Row
            key={key}
            label={label}
            hint={hint}
            form={form[key]}
            info={apiInfo?.[key]}
            options={modelOptions[key]}
            onChange={(patch) => updateGroup(key, patch)}
          />
        ))}
      </div>
    </Section>
  );
}

interface RowProps {
  label: string;
  hint: string;
  form: ApiGroupForm;
  info: GroupInfo | undefined;
  options: ModelOption[];
  onChange: (patch: Partial<ApiGroupForm>) => void;
}

function Row({ label, hint, form, info, options, onChange }: RowProps) {
  const keyPlaceholder = info?.has_key ? info.masked_key : '请输入 API Key';

  return (
    <div className="grid grid-cols-[88px_1.4fr_1fr_1fr] gap-2 items-center">
      <div className="flex flex-col gap-0.5">
        <span className="inline-flex w-fit bg-stone-800 text-white text-[10px] rounded px-1.5 py-0.5">
          {label}
        </span>
        <span className="text-[10px] text-stone-400 leading-tight">{hint}</span>
      </div>
      <input
        type="text"
        value={form.api_base_url}
        onChange={(e) => onChange({ api_base_url: e.target.value })}
        placeholder="https://..."
        className="border border-stone-200 bg-stone-50 rounded-md px-2.5 py-1.5 text-xs font-mono text-stone-700 outline-none focus:ring-2 focus:ring-stone-400"
      />
      <input
        type="password"
        value={form.api_key}
        onChange={(e) => onChange({ api_key: e.target.value })}
        placeholder={keyPlaceholder}
        className="border border-stone-200 bg-stone-50 rounded-md px-2.5 py-1.5 text-xs font-mono text-stone-700 outline-none focus:ring-2 focus:ring-stone-400"
      />
      <select
        value={form.model}
        onChange={(e) => onChange({ model: e.target.value })}
        className="border border-stone-200 bg-white rounded-md px-2.5 py-1.5 text-xs text-stone-700 outline-none focus:ring-2 focus:ring-stone-400"
      >
        {!options.some((o) => o.value === form.model) && form.model && (
          <option value={form.model}>{form.model}</option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
