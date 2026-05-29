import type { SplitterType } from "@shared/types/api";
import type { DocTypeSplitterForm } from "../hooks/useSettings";

const SPLITTER_TYPES: { value: SplitterType; label: string }[] = [
  { value: "recursive", label: "Recursive" },
  { value: "sentence", label: "Sentence" },
  { value: "token", label: "Token" },
  { value: "manual_step", label: "Manual Step" },
];

export function DocTypeSplitterCard({
  label,
  badge,
  value,
  onChange,
}: {
  label: string;
  badge: string;
  value: DocTypeSplitterForm;
  onChange: (v: DocTypeSplitterForm) => void;
}) {
  const set = <K extends keyof DocTypeSplitterForm>(
    k: K,
    v: DocTypeSplitterForm[K],
  ) => onChange({ ...value, [k]: v });

  return (
    <div className="border border-stone-200 rounded-xl p-4 space-y-3">
      <span
        className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${badge}`}
      >
        {label}
      </span>

      <div>
        <p className="text-xs text-stone-500 mb-1.5">切分策略</p>
        <div className="flex flex-wrap gap-1.5">
          {SPLITTER_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => set("splitter_type", t.value)}
              className={`px-2 py-1 text-xs rounded-lg border transition-colors ${
                value.splitter_type === t.value
                  ? "bg-stone-800 text-white border-stone-800"
                  : "border-stone-300 text-stone-600 hover:bg-stone-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs text-stone-500 mb-1">
          Chunk 大小{" "}
          <span className="text-stone-400">{value.chunk_size} tokens</span>
        </p>
        <input
          type="range"
          min={64}
          max={1024}
          step={64}
          value={value.chunk_size}
          onChange={(e) => set("chunk_size", Number(e.target.value))}
          className="w-full"
        />
      </div>

      <div>
        <p className="text-xs text-stone-500 mb-1">
          Overlap 比例{" "}
          <span className="text-stone-400">
            {value.chunk_overlap_ratio.toFixed(2)}
          </span>
        </p>
        <input
          type="range"
          min={0}
          max={0.5}
          step={0.05}
          value={value.chunk_overlap_ratio}
          onChange={(e) => set("chunk_overlap_ratio", Number(e.target.value))}
          className="w-full"
        />
      </div>

      <label className="flex items-center gap-2 text-xs text-stone-600 cursor-pointer">
        <input
          type="checkbox"
          checked={value.enable_cleaning}
          onChange={(e) => set("enable_cleaning", e.target.checked)}
          className="rounded"
        />
        启用 LLM 清洗
      </label>
    </div>
  );
}
