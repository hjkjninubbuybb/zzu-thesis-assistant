import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type {
  DocType,
  SplitterType,
  UploadParams,
  SystemConfig,
} from "@shared/types/api";
import {
  useUploadQueue,
  useEnqueue,
  useRemoveItem,
} from "@shared/store/uploadStore";
import { documentService } from "../services/documentService";
import { UploadPanel } from "./UploadPanel";
import { DocumentList } from "./DocumentList";

const DOC_TYPES: {
  type: DocType;
  label: string;
  color: string;
  barColor: string;
  badge: string;
}[] = [
  {
    type: "policy",
    label: "政策文件",
    color: "text-blue-600",
    barColor: "bg-blue-500",
    badge: "bg-blue-50 text-blue-700",
  },
  {
    type: "manual",
    label: "操作手册",
    color: "text-purple-600",
    barColor: "bg-purple-500",
    badge: "bg-purple-50 text-purple-700",
  },
  {
    type: "form",
    label: "填报模板",
    color: "text-amber-600",
    barColor: "bg-amber-500",
    badge: "bg-amber-50 text-amber-700",
  },
];

function buildDefaultParamsMap(
  cfg: SystemConfig | undefined,
): Record<DocType, UploadParams> {
  const gs = cfg?.splitter?.chunk_size ?? 256;
  const go = cfg?.splitter?.chunk_overlap_ratio ?? 0.2;
  return {
    policy: {
      splitter_type: (cfg?.splitter?.policy?.type ??
        "recursive") as SplitterType,
      chunk_size: cfg?.splitter?.policy?.chunk_size ?? gs,
      chunk_overlap_ratio: cfg?.splitter?.policy?.chunk_overlap_ratio ?? go,
      enable_cleaning: cfg?.splitter?.policy?.enable_cleaning ?? true,
      doc_type: "policy",
    },
    manual: {
      splitter_type: (cfg?.splitter?.manual?.type ??
        "recursive") as SplitterType,
      chunk_size: cfg?.splitter?.manual?.chunk_size ?? gs,
      chunk_overlap_ratio: cfg?.splitter?.manual?.chunk_overlap_ratio ?? go,
      enable_cleaning: cfg?.splitter?.manual?.enable_cleaning ?? true,
      doc_type: "manual",
    },
    form: {
      splitter_type: (cfg?.splitter?.form?.type ?? "recursive") as SplitterType,
      chunk_size: cfg?.splitter?.form?.chunk_size ?? gs,
      chunk_overlap_ratio: cfg?.splitter?.form?.chunk_overlap_ratio ?? 0.0,
      enable_cleaning: cfg?.splitter?.form?.enable_cleaning ?? false,
      doc_type: "form",
    },
  };
}

const settle = (d: number): React.CSSProperties => ({
  animation: `appleSettleIn 0.75s cubic-bezier(0.25, 1, 0.5, 1) ${d}ms both`,
});

export function DocumentManagement() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedKb = searchParams.get("kb") ?? "";
  const activeType = (searchParams.get("type") as DocType) ?? "policy";
  const navigate = useNavigate();

  const allQueue = useUploadQueue();
  const enqueue = useEnqueue();
  const removeItem = useRemoveItem();

  const [defaultParamsMap, setDefaultParamsMap] = useState<
    Record<DocType, UploadParams>
  >(buildDefaultParamsMap(undefined));
  const [paramsInitialized, setParamsInitialized] = useState(false);

  const { data: sysConfig } = useQuery({
    queryKey: ["system-config"],
    queryFn: () => documentService.getSystemConfig(),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (sysConfig && !paramsInitialized) {
      setDefaultParamsMap(buildDefaultParamsMap(sysConfig));
      setParamsInitialized(true);
    }
  }, [sysConfig, paramsInitialized]);

  const { data: kbs } = useQuery({
    queryKey: ["knowledge-bases"],
    queryFn: () => documentService.listKBs(),
  });

  // Watch for completed uploads with cleanResult and navigate to review page
  useEffect(() => {
    const justDone = allQueue.find(
      (q) => q.status === "done" && q.cleanResult && q.kbName === selectedKb,
    );
    if (justDone?.cleanResult) {
      const { doc_id } = justDone.cleanResult;
      navigate(`/admin/document/${selectedKb}/${doc_id}/review`, {
        state: { cleanedContent: justDone.cleanResult.cleaned_content },
      });
    }
  }, [allQueue, selectedKb, navigate]);

  const activeUploads = allQueue.filter(
    (q) =>
      q.kbName === selectedKb &&
      q.docType === activeType &&
      (q.status === "pending" || q.status === "uploading"),
  );

  const isUploading = activeUploads.length > 0;

  const switchType = (type: DocType) => {
    const next: Record<string, string> = { type };
    if (selectedKb) next.kb = selectedKb;
    setSearchParams(next);
  };

  const switchKb = (kb: string) => {
    const next: Record<string, string> = { type: activeType };
    if (kb) next.kb = kb;
    setSearchParams(next);
  };

  const activeTypeMeta = DOC_TYPES.find((t) => t.type === activeType)!;

  const handleUpload = (files: File[], params: UploadParams) => {
    if (!selectedKb) return;
    enqueue(selectedKb, activeType, files, params);
  };

  return (
    <div className="p-6 max-w-5xl flex-1 overflow-y-auto glass-card rounded-2xl">
      <div className="mb-6" style={settle(0)}>
        <h1 className="text-2xl font-semibold text-gray-900">文档</h1>
        <p className="mt-1 text-sm text-gray-500">上传与管理知识库中的文档</p>
      </div>

      <div className="mb-6" style={settle(60)}>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          选择知识库
        </label>
        <select
          value={selectedKb}
          onChange={(e) => switchKb(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 w-60"
        >
          <option value="">— 请选择 —</option>
          {kbs?.map((kb) => (
            <option key={kb.id} value={kb.name}>
              {kb.name}
            </option>
          ))}
        </select>
      </div>

      {!selectedKb && (
        <div className="text-sm text-gray-400 py-16 text-center border border-dashed border-gray-200 rounded-lg">
          请先选择一个知识库
        </div>
      )}

      {selectedKb && (
        <>
          <div
            className="flex gap-1 mb-6 border-b border-gray-200"
            style={settle(100)}
          >
            {DOC_TYPES.map((t) => (
              <button
                key={t.type}
                onClick={() => switchType(t.type)}
                className={`px-5 py-2.5 text-sm font-medium rounded-t-lg transition-colors -mb-px border-b-2 ${
                  activeType === t.type
                    ? `border-gray-900 text-gray-900`
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div style={settle(150)}>
            <UploadPanel
              activeType={activeType}
              badge={activeTypeMeta.badge}
              typeLabel={activeTypeMeta.label}
              activeUploads={activeUploads}
              onUpload={handleUpload}
              onRemoveItem={removeItem}
              defaultParams={defaultParamsMap[activeType]}
            />
          </div>

          <div style={settle(200)}>
            <DocumentList
              kbName={selectedKb}
              activeType={activeType}
              barColor={activeTypeMeta.barColor}
              typeLabel={activeTypeMeta.label}
              isUploading={isUploading}
            />
          </div>
        </>
      )}
    </div>
  );
}
