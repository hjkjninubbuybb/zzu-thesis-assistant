import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Loader2, Save, Database, RotateCcw } from "lucide-react";
import { useToast } from "@shared/store/uiStore";
import { handleMutationError } from "@shared/lib/errorHandler";
import { documentService } from "../services/documentService";

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface DocumentEditModalProps {
  kbName: string;
  docId: number;
  onClose: () => void;
}

export function DocumentEditModal({
  kbName,
  docId,
  onClose,
}: DocumentEditModalProps) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [activeTab, setActiveTab] = useState<"content" | "summary">("content");

  const { data: doc, isLoading } = useQuery({
    queryKey: ["document-detail", kbName, docId],
    queryFn: () => documentService.get(kbName, docId),
  });

  useEffect(() => {
    if (doc) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSummary(doc.summary ?? "");
      setContent(doc.content ?? "");
    }
  }, [doc]);

  const updateMutation = useMutation({
    mutationFn: (body: { summary?: string; content?: string }) =>
      documentService.update(kbName, docId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents", kbName] });
      showToast("修改已保存", "success");
    },
    onError: (err) => handleMutationError(err, showToast),
  });

  const reindexMutation = useMutation({
    mutationFn: () => documentService.reindex(kbName, docId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents", kbName] });
      showToast("重新索引已提交", "success");
    },
    onError: (err) => handleMutationError(err, showToast),
  });

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-2xl p-8 flex items-center gap-3">
          <Loader2 className="animate-spin text-blue-600" />
          <span className="text-gray-600">加载文档详情...</span>
        </div>
      </div>
    );
  }

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
              {formatSize(doc?.file_size ?? 0)}
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
                文档正文（修改后需点击"重新索引"生效）
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
