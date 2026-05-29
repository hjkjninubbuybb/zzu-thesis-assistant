import { Search } from "lucide-react";
import { Section, Field, NumberInput } from "./SettingsPrimitives";
import type { FormState } from "../hooks/useSettings";

interface RetrievalSettingsProps {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
}

export function RetrievalSettings({ form, set }: RetrievalSettingsProps) {
  return (
    <Section icon={Search} title="检索参数">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          <Field label="Vector Top-K">
            <NumberInput
              value={form.vector_top_k}
              min={1}
              max={50}
              onChange={(v) => set("vector_top_k", v)}
            />
          </Field>
          <Field label="BM25 Top-K">
            <NumberInput
              value={form.bm25_top_k}
              min={1}
              max={50}
              onChange={(v) => set("bm25_top_k", v)}
            />
          </Field>
          <Field label="Hybrid Top-K">
            <NumberInput
              value={form.hybrid_top_k}
              min={1}
              max={50}
              onChange={(v) => set("hybrid_top_k", v)}
            />
          </Field>
          <Field label="RRF K">
            <NumberInput
              value={form.rrf_k}
              min={1}
              max={200}
              onChange={(v) => set("rrf_k", v)}
            />
          </Field>
        </div>
        <div className="border-t border-stone-100 pt-4">
          <Field label="Reranker Top-N">
            <NumberInput
              value={form.reranker_top_n}
              min={1}
              max={20}
              onChange={(v) => set("reranker_top_n", v)}
            />
          </Field>
        </div>
      </div>
    </Section>
  );
}
