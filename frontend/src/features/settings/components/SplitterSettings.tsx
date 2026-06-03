import { FileText } from 'lucide-react';
import { Section } from './SettingsPrimitives';
import { DocTypeSplitterCard } from './DocTypeSplitterCard';
import type { FormState, DocTypeSplitterForm } from '../hooks/useSettings';

interface SplitterSettingsProps {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
}

export function SplitterSettings({ form, set }: SplitterSettingsProps) {
  return (
    <Section icon={FileText} title="文档切分默认参数">
      <p className="text-xs text-stone-400 mb-4">
        以下为各类文档上传时的初始默认值，用户在上传时仍可临时覆盖。
      </p>
      <div className="grid grid-cols-3 gap-4">
        <DocTypeSplitterCard
          label="政策文件"
          badge="bg-blue-50 text-blue-700"
          value={form.splitter_policy}
          onChange={(v: DocTypeSplitterForm) => set('splitter_policy', v)}
        />
        <DocTypeSplitterCard
          label="操作手册"
          badge="bg-purple-50 text-purple-700"
          value={form.splitter_manual}
          onChange={(v: DocTypeSplitterForm) => set('splitter_manual', v)}
        />
        <DocTypeSplitterCard
          label="填报模板"
          badge="bg-amber-50 text-amber-700"
          value={form.splitter_form}
          onChange={(v: DocTypeSplitterForm) => set('splitter_form', v)}
        />
      </div>
    </Section>
  );
}
