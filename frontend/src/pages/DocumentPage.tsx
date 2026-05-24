import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Upload,
  Trash2,
  Loader2,
  X,
  ChevronDown,
  ChevronUp,
  FileText,
  CheckCircle,
  AlertCircle,
  Clock,
  Edit3,
  Database,
  Save,
  RotateCcw,
} from "lucide-react";
import { knowledgeApi, documentApi, configApi, extractError } from "@/lib/api";
import { useUpload } from "@/lib/uploadContext";
import type {
  DocType,
  SplitterType,
  UploadParams,
  SystemConfig,
} from "@/types/api";

// ── 格式化工具 ──────────────────────────────────────────────

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("zh-CN");
}

// ── 常量 ────────────────────────────────────────────────────

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

// 根据系统配置构建每种文档类型的默认参数
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

// ── 子组件 ──────────────────────────────────────────────────

function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: "success" | "error";
  onClose: () => void;
}) {
  return (
    <div
      className={`fixed bottom-6 right-6 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-white text-sm z-50 animate-apple-toast ${type === "success" ? "bg-emerald-600" : "bg-red-600"}`}
    >
      <span>{message}</span>
      <button onClick={onClose}>
        <X size={14} />
      </button>
    </div>
  );
}

function UploadStatusIcon({
  status,
}: {
  status: "pending" | "uploading" | "done" | "error";
}) {
  if (status === "pending")
    return <Clock size={14} className="text-gray-400" />;
  if (status === "uploading")
    return <Loader2 size={14} className="animate-spin text-blue-500" />;
  if (status === "done")
    return <CheckCircle size={14} className="text-emerald-500" />;
  return <AlertCircle size={14} className="text-red-500" />;
}

// ── 主页面 ──────────────────────────────────────────────────

export default function DocumentPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedKb = searchParams.get("kb") ?? "";
  const activeType = (searchParams.get("type") as DocType) ?? "policy";
  const qc = useQueryClient();

  const navigate = useNavigate();
  const { queue, addFiles, removeItem } = useUpload();

  useEffect(() => {
    const justDone = queue.find(
      (q) => q.status === "done" && q.cleanResult && q.kbName === selectedKb,
    );
    if (justDone?.cleanResult) {
      const { doc_id } = justDone.cleanResult;
      navigate(`/admin/document/${selectedKb}/${doc_id}/review`, {
        state: { cleanedContent: justDone.cleanResult.cleaned_content },
      });
    }
  }, [queue, selectedKb, navigate]);

  const [stagedMap, setStagedMap] = useState<Record<DocType, File[]>>({
    policy: [],
    manual: [],
    form: [],
  });
  const [paramsMap, setParamsMap] = useState<Record<DocType, UploadParams>>(
    buildDefaultParamsMap(undefined),
  );
  const [paramsInitialized, setParamsInitialized] = useState(false);
  const [advancedMap, setAdvancedMap] = useState<Record<DocType, boolean>>({
    policy: false,
    manual: false,
    form: false,
  });

  const [dragOver, setDragOver] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editingDocId, setEditingDocId] = useState<number | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const stagedFiles = stagedMap[activeType];
  const params = paramsMap[activeType];
  const advancedOpen = advancedMap[activeType];

  const setStaged = (files: File[]) =>
    setStagedMap((prev) => ({ ...prev, [activeType]: files }));

  const setParams = (updater: (p: UploadParams) => UploadParams) =>
    setParamsMap((prev) => ({
      ...prev,
      [activeType]: updater(prev[activeType]),
    }));

  const setAdvanced = (open: boolean) =>
    setAdvancedMap((prev) => ({ ...prev, [activeType]: open }));

  const activeUploads = queue.filter(
    (q) =>
      q.kbName === selectedKb &&
      q.docType === activeType &&
      (q.status === "pending" || q.status === "uploading"),
  );
  const showFileList = activeUploads.length === 0 && stagedFiles.length === 0;

  const { data: sysConfig } = useQuery({
    queryKey: ["system-config"],
    queryFn: configApi.get,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (sysConfig && !paramsInitialized) {
      setParamsMap(buildDefaultParamsMap(sysConfig));
      setParamsInitialized(true);
    }
  }, [sysConfig, paramsInitialized]);

  const { data: kbs } = useQuery({
    queryKey: ["knowledge-bases"],
    queryFn: knowledgeApi.list,
  });

  const { data: docs, isLoading: docsLoading } = useQuery({
    queryKey: ["documents", selectedKb],
    queryFn: () => documentApi.list(selectedKb),
    enabled: !!selectedKb,
  });

  const typeDocs = docs?.filter((d) => d.doc_type === activeType) ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: number) => documentApi.delete(selectedKb, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents", selectedKb] });
      qc.invalidateQueries({ queryKey: ["knowledge-bases"] });
      setDeleteId(null);
      showToast("文档已删除", "success");
    },
    onError: (e) => showToast(extractError(e), "error"),
  });

  const addStaged = useCallback(
    (files: FileList | File[]) => {
      const arr = Array.from(files);
      setStaged([...stagedFiles, ...arr]);
    },
    [stagedFiles, activeType],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length) addStaged(e.dataTransfer.files);
    },
    [addStaged],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) addStaged(e.target.files);
    e.target.value = "";
  };

  const removeStagedFile = (index: number) =>
    setStaged(stagedFiles.filter((_, i) => i !== index));

  const handleStartUpload = () => {
    if (!stagedFiles.length || !selectedKb) return;
    addFiles(selectedKb, activeType, stagedFiles, params);
    setStaged([]);
  };

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

  const settle = (d: number): React.CSSProperties => ({
    animation: `appleSettleIn 0.75s cubic-bezier(0.25, 1, 0.5, 1) ${d}ms both`,
  });

  const activeTypeMeta = DOC_TYPES.find((t) => t.type === activeType)!;

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

          <div className="mb-6 glass-card rounded-lg p-5" style={settle(150)}>
            <h2 className="text-sm font-medium text-gray-700 mb-3">
              上传
              <span
                className={`ml-2 text-xs px-2 py-0.5 rounded font-semibold ${activeTypeMeta.badge}`}
              >
                {activeTypeMeta.label}
              </span>
            </h2>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
                dragOver
                  ? "border-blue-400 bg-blue-50"
                  : "border-gray-300 hover:border-gray-400"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.md,.docx,.doc"
                multiple
                className="hidden"
                onChange={handleFileChange}
              />
              <Upload size={24} className="mx-auto text-gray-400 mb-2" />
              <p className="text-sm text-gray-600">
                拖拽文件到此处，或{" "}
                <span className="text-blue-600">点击选择</span>
              </p>
              <p className="text-xs text-gray-400 mt-1">
                支持 .pdf / .docx / .txt / .md，可多选
              </p>
            </div>

            {stagedFiles.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {stagedFiles.map((file, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-3 py-2 rounded-md bg-gray-50 border border-gray-100"
                  >
                    <FileText size={14} className="text-gray-400 shrink-0" />
                    <span className="text-sm text-gray-800 truncate flex-1 min-w-0">
                      {file.name}
                    </span>
                    <span className="text-xs text-gray-400 shrink-0">
                      {formatSize(file.size)}
                    </span>
                    <button
                      onClick={() => removeStagedFile(i)}
                      className="text-gray-400 hover:text-gray-600 shrink-0"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => setAdvanced(!advancedOpen)}
              className="mt-4 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
            >
              {advancedOpen ? (
                <ChevronUp size={14} />
              ) : (
                <ChevronDown size={14} />
              )}
              高级参数
            </button>

            {advancedOpen && (
              <div className="mt-3 border-t border-gray-100 pt-3 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">
                    切分策略
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      {
                        value: "recursive" as SplitterType,
                        label: "Recursive",
                        ndcg: 0.85,
                        desc: "按标点和 Markdown 递归分割",
                      },
                      {
                        value: "sentence" as SplitterType,
                        label: "Sentence",
                        ndcg: 0.81,
                        desc: "按句子边界分割",
                      },
                      {
                        value: "token" as SplitterType,
                        label: "Token",
                        ndcg: 0.81,
                        desc: "固定 Token 数分割",
                      },
                    ].map((s) => (
                      <button
                        key={s.value}
                        onClick={() =>
                          setParams((p) => ({ ...p, splitter_type: s.value }))
                        }
                        title={s.desc}
                        className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                          params.splitter_type === s.value
                            ? "bg-blue-600 text-white border-blue-600"
                            : "border-gray-300 text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        {s.label}
                        <span
                          className={`ml-1.5 opacity-75 ${params.splitter_type === s.value ? "text-blue-100" : "text-gray-400"}`}
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
                      onChange={(e) =>
                        setParams((p) => ({
                          ...p,
                          chunk_size: Number(e.target.value),
                        }))
                      }
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
                        setParams((p) => ({
                          ...p,
                          chunk_overlap_ratio: Number(e.target.value),
                        }))
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
                    onChange={(e) =>
                      setParams((p) => ({
                        ...p,
                        enable_cleaning: e.target.checked,
                      }))
                    }
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

            <div className="mt-4">
              <button
                onClick={handleStartUpload}
                disabled={stagedFiles.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Upload size={14} />
                开始上传
                {stagedFiles.length > 0 ? ` (${stagedFiles.length})` : ""}
              </button>
            </div>
          </div>

          {!showFileList && (
            <div
              className="glass-card rounded-lg overflow-hidden"
              style={settle(200)}
            >
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-blue-500" />
                <h2 className="text-sm font-medium text-gray-700">
                  入库中 — {activeTypeMeta.label}
                </h2>
              </div>
              <div className="p-4 space-y-2">
                {activeUploads.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-md bg-gray-50 border border-gray-100"
                  >
                    <UploadStatusIcon status={item.status} />
                    <FileText size={14} className="text-gray-400 shrink-0" />
                    <span className="text-sm text-gray-800 truncate flex-1 min-w-0">
                      {item.file.name}
                    </span>
                    <span className="text-xs text-gray-400 shrink-0">
                      {formatSize(item.file.size)}
                    </span>
                    {item.status === "uploading" && (
                      <div className="w-24 bg-gray-200 rounded-full h-1.5 shrink-0">
                        <div
                          className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                    )}
                    {item.status === "pending" && (
                      <button
                        onClick={() => removeItem(item.id)}
                        className="text-gray-400 hover:text-gray-600 shrink-0"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {showFileList && (
            <div
              className="bg-white border border-gray-200 rounded-lg overflow-hidden"
              style={settle(200)}
            >
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                <div
                  className={`w-1 h-4 rounded-full ${activeTypeMeta.barColor}`}
                />
                <h2 className="text-sm font-medium text-gray-700">
                  已入库 — {activeTypeMeta.label}
                </h2>
                <span className="text-xs text-gray-400 ml-1">
                  {typeDocs.length} 个文档
                </span>
              </div>

              {docsLoading && (
                <div className="flex items-center gap-2 text-sm text-gray-500 py-8 justify-center">
                  <Loader2 size={14} className="animate-spin" />
                  加载中...
                </div>
              )}

              {!docsLoading && typeDocs.length === 0 && (
                <div className="text-sm text-gray-400 py-10 text-center">
                  暂无{activeTypeMeta.label}，请上传
                </div>
              )}

              {typeDocs.length > 0 && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">
                        文件名
                      </th>
                      <th className="text-center px-4 py-3 text-gray-600 font-medium">
                        大小
                      </th>
                      <th className="text-center px-4 py-3 text-gray-600 font-medium">
                        Chunks
                      </th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">
                        上传时间
                      </th>
                      <th className="text-left px-4 py-3 text-gray-600 font-medium">
                        状态
                      </th>
                      <th className="text-right px-4 py-3 text-gray-600 font-medium">
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {typeDocs.map((doc) => (
                      <tr
                        key={doc.id}
                        className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                      >
                        <td className="px-4 py-3 text-gray-900 font-medium max-w-xs truncate">
                          {doc.file_name}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-500">
                          {formatSize(doc.file_size)}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-700">
                          {doc.chunk_count}
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {formatDate(doc.created_at)}
                        </td>
                        <td className="px-3 py-2">
                          {doc.status === "pending_review" && (
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 cursor-pointer hover:bg-amber-200"
                              onClick={() =>
                                navigate(
                                  `/admin/document/${selectedKb}/${doc.id}/review`,
                                )
                              }
                            >
                              待审核
                            </span>
                          )}
                          {doc.status === "pending_chunk_review" && (
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 cursor-pointer hover:bg-blue-200"
                              onClick={() =>
                                navigate(
                                  `/admin/document/${selectedKb}/${doc.id}/chunks`,
                                )
                              }
                            >
                              待确认分块
                            </span>
                          )}
                          {(doc.status === "active" ||
                            doc.status === "completed") && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                              已入库
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => setEditingDocId(doc.id)}
                              className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                              title="查看与修改"
                            >
                              <Edit3 size={14} />
                            </button>

                            {deleteId === doc.id ? (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500">
                                  确认删除？
                                </span>
                                <button
                                  onClick={() => deleteMutation.mutate(doc.id)}
                                  disabled={deleteMutation.isPending}
                                  className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 flex items-center gap-1"
                                >
                                  {deleteMutation.isPending && (
                                    <Loader2
                                      size={10}
                                      className="animate-spin"
                                    />
                                  )}
                                  确认
                                </button>
                                <button
                                  onClick={() => setDeleteId(null)}
                                  className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50"
                                >
                                  取消
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDeleteId(doc.id)}
                                className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {editingDocId && (
        <DocumentEditModal
          kbName={selectedKb}
          docId={editingDocId}
          onClose={() => setEditingDocId(null)}
          onShowToast={showToast}
        />
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

// ── 文档详情与编辑弹窗 ────────────────────────────────────────

function DocumentEditModal({
  kbName,
  docId,
  onClose,
  onShowToast,
}: {
  kbName: string;
  docId: number;
  onClose: () => void;
  onShowToast: (msg: string, type: "success" | "error") => void;
}) {
  const qc = useQueryClient();
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [activeTab, setActiveTab] = useState<"content" | "summary">("content");

  const { data: doc, isLoading } = useQuery({
    queryKey: ["document-detail", kbName, docId],
    queryFn: () => documentApi.get(kbName, docId),
  });

  // 初始加载
  useEffect(() => {
    if (doc) {
      setSummary(doc.summary || "");
      setContent(doc.content || "");
    }
  }, [doc]);

  const updateMutation = useMutation({
    mutationFn: (body: { summary?: string; content?: string }) =>
      documentApi.update(kbName, docId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents", kbName] });
      onShowToast("修改已保存", "success");
    },
    onError: (e) => onShowToast(extractError(e), "error"),
  });

  const reindexMutation = useMutation({
    mutationFn: () => documentApi.reindex(kbName, docId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents", kbName] });
      onShowToast("重新索引已提交", "success");
    },
    onError: (e) => onShowToast(extractError(e), "error"),
  });

  if (isLoading)
    return (
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-2xl p-8 flex items-center gap-3">
          <Loader2 className="animate-spin text-blue-600" />
          <span className="text-gray-600">加载文档详情...</span>
        </div>
      </div>
    );

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-apple-modal-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 truncate max-w-md">
              {doc?.file_name}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              ID: {docId} • {doc?.chunk_count} Chunks •{" "}
              {formatSize(doc?.file_size || 0)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-400"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 border-b border-gray-100 flex gap-6 shrink-0">
          <button
            onClick={() => setActiveTab("content")}
            className={`py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "content"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            清洗后的正文
          </button>
          <button
            onClick={() => setActiveTab("summary")}
            className={`py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "summary"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            AI 摘要
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
          {activeTab === "content" ? (
            <div className="h-full flex flex-col">
              <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">
                文档正文（修改后需点击“重新索引”生效）
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="flex-1 w-full p-4 rounded-xl border border-gray-200 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm leading-relaxed resize-none font-mono"
                placeholder="暂无正文内容"
              />
            </div>
          ) : (
            <div className="h-full flex flex-col">
              <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">
                全局摘要（用于 Agent 理解文档概况）
              </label>
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                className="flex-1 w-full p-4 rounded-xl border border-gray-200 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm leading-relaxed resize-none"
                placeholder="暂无摘要内容"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => reindexMutation.mutate()}
              disabled={reindexMutation.isPending || updateMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors disabled:opacity-50"
              title="根据当前正文重新切分并生成向量"
            >
              {reindexMutation.isPending ? (
                <RotateCcw size={16} className="animate-spin" />
              ) : (
                <Database size={16} />
              )}
              重新索引
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              onClick={() => updateMutation.mutate({ summary, content })}
              disabled={updateMutation.isPending || reindexMutation.isPending}
              className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-md shadow-blue-200 transition-colors disabled:opacity-50"
            >
              {updateMutation.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}
              保存修改
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
