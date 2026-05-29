import { Cpu } from "lucide-react";
import { Section, Field, ModelSelect } from "./SettingsPrimitives";
import type { FormState } from "../hooks/useSettings";

interface ModelSettingsProps {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  llmModels: { value: string; label: string }[];
  embeddingModels: { value: string; label: string; desc?: string }[];
  rerankerModels: { value: string; label: string; desc?: string }[];
}

export function ModelSettings({
  form,
  set,
  llmModels,
  embeddingModels,
  rerankerModels,
}: ModelSettingsProps) {
  return (
    <Section icon={Cpu} title="模型配置">
      <div className="space-y-6">
        <Field label="推理型模型 (慢)" hint="用于逻辑路由、文档评估">
          <ModelSelect
            value={form.llm_model}
            options={llmModels}
            onChange={(v) => set("llm_model", v)}
          />
        </Field>
        <Field label="常规/极速模型 (快)" hint="用于最终回答生成">
          <ModelSelect
            value={form.llm_fast_model}
            options={llmModels}
            onChange={(v) => set("llm_fast_model", v)}
          />
        </Field>
        <Field label="向量模型" hint="修改后需重新入库">
          <ModelSelect
            value={form.embedding_model}
            options={embeddingModels}
            onChange={(v) => set("embedding_model", v)}
          />
        </Field>
        <Field label="重排序模型" hint="检索结果精排">
          <ModelSelect
            value={form.reranker_model}
            options={rerankerModels}
            onChange={(v) => set("reranker_model", v)}
          />
        </Field>
      </div>
    </Section>
  );
}
