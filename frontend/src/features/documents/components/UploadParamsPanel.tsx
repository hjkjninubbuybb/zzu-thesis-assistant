import { ChevronDown, ChevronUp } from "lucide-react";
import type { SplitterType, UploadParams } from "@shared/types/api";

const SPLITTERS: {
  value: SplitterType;
  label: string;
  ndcg: number;
  desc: string;
}[] = [
  {
    value: "recursive",
    label: "Recursive",
    ndcg: 0.85,
    desc: "按标点和 Markdown 递归分割",
  },
  { value: "sentence", label: "Sentence", ndcg: 0.81, desc: "按句子边界分割" },
  { value: "token", label: "Token", ndcg: 0.81, desc: "固定 Token 数分割" },
];

interface UploadParamsPanelProps {
  params: UploadParams;
  open: boolean;
  onToggle: () => void;
  onChange: <K extends keyof UploadParams>(
    key: K,
    value: UploadParams[K],
  ) => void;
}

export function UploadParamsPanel({
  params,
  open,
  onToggle,
  onChange,
}: UploadParamsPanelProps) {
  return (
    <>
      <button
        onClick={onToggle}
        className="mt-4 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
      >
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        高级参数
      </button>

      {open && (
        <div className="mt-3 border-t border-gray-100 pt-3 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">
              切分策略
            </label>
            <div className="flex flex-wrap gap-2">
              {SPLITTERS.map((s) => (
                <button
                  key={s.value}
                  onClick={() => onChange("splitter_type", s.value)}
                  title={s.desc}
                  className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                    params.splitter_type === s.value
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {s.label}
                  <span
                    className={`ml-1.5 opacity-75 ${
                      params.splitter_type === s.value
                        ? "text-blue-100"
                        : "text-gray-400"
                    }`}
                  >
                    NDCG {s.ndcg}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Chunk 大小{" "}
                <span className="text-gray-400 font-normal">
                  {params.chunk_size} tokens
                </span>
              </label>
              <input
                type="range"
                min={64}
                max={1024}
                step={64}
                value={params.chunk_size}
                onChange={(e) => onChange("chunk_size", Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Overlap 比例{" "}
                <span className="text-gray-400 font-normal">
                  {params.chunk_overlap_ratio.toFixed(2)}
                </span>
              </label>
              <input
                type="range"
                min={0}
                max={0.5}
                step={0.05}
                value={params.chunk_overlap_ratio}
                onChange={(e) =>
                  onChange("chunk_overlap_ratio", Number(e.target.value))
                }
                className="w-full"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="cleaning"
              checked={params.enable_cleaning}
              onChange={(e) => onChange("enable_cleaning", e.target.checked)}
              className="rounded"
            />
            <label
              htmlFor="cleaning"
              className="text-sm text-gray-600 cursor-pointer"
            >
              启用 LLM 清洗{" "}
              <span className="text-xs text-gray-400">
                （较慢，适合格式杂乱的文档）
              </span>
            </label>
          </div>
        </div>
      )}
    </>
  );
}
