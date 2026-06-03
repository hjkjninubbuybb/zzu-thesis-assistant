import { Sparkles } from 'lucide-react';
import { Section, Field, NumberInput } from './SettingsPrimitives';
import type { FormState } from '../hooks/useSettings';

interface AgentSettingsProps {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
}

export function AgentSettings({ form, set }: AgentSettingsProps) {
  return (
    <Section icon={Sparkles} title="智能体与 RAG 配置">
      <div className="space-y-6">
        <Field label="最大改写次数" hint="查询改写可提升召回，但增加延迟">
          <div className="flex gap-1.5">
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => set('max_reformulations', n)}
                className={`w-9 py-1.5 text-sm rounded-lg border transition-colors ${
                  form.max_reformulations === n
                    ? 'bg-stone-800 text-white border-stone-800'
                    : 'border-stone-300 text-stone-700 hover:bg-stone-50'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-8 border-t border-stone-100 pt-6">
          <Field label="最大图流转步数" hint="防止 StateGraph 陷入无限循环">
            <div className="flex items-center gap-3">
              <NumberInput
                value={form.agent_recursion_limit}
                min={4}
                max={50}
                onChange={(v) => set('agent_recursion_limit', v)}
              />
              <span className="text-xs text-stone-400 font-medium">步</span>
            </div>
          </Field>
          <Field label="CRAG 重试上限" hint="资料不相关时允许重试检索的次数">
            <div className="flex items-center gap-3">
              <NumberInput
                value={form.agent_retry_count}
                min={1}
                max={5}
                onChange={(v) => set('agent_retry_count', v)}
              />
              <span className="text-xs text-stone-400 font-medium">次</span>
            </div>
          </Field>
        </div>
      </div>
    </Section>
  );
}
