import { useState } from "react";
import { Trash2, Loader2, Edit3 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { DocInfo, DocType } from "@shared/types/api";
import { useToast } from "@shared/store/uiStore";
import { handleMutationError } from "@shared/lib/errorHandler";
import { documentService } from "../services/documentService";
import { DocumentEditModal } from "./DocumentEditModal";

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("zh-CN");
}

interface DocumentListProps {
  kbName: string;
  activeType: DocType;
  barColor: string;
  typeLabel: string;
  isUploading: boolean;
}

export function DocumentList({
  kbName,
  activeType,
  barColor,
  typeLabel,
  isUploading,
}: DocumentListProps) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editingDocId, setEditingDocId] = useState<number | null>(null);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["documents", kbName],
    queryFn: () => documentService.list(kbName),
    enabled: !!kbName,
  });

  const typeDocs: DocInfo[] = docs.filter((d) => d.doc_type === activeType);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => documentService.delete(kbName, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents", kbName] });
      qc.invalidateQueries({ queryKey: ["knowledge-bases"] });
      setDeleteId(null);
      showToast("文档已删除", "success");
    },
    onError: (err) => handleMutationError(err, showToast),
  });

  if (isUploading) return null;

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <div className={`w-1 h-4 rounded-full ${barColor}`} />
          <h2 className="text-sm font-medium text-gray-700">
            已入库 — {typeLabel}
          </h2>
          <span className="text-xs text-gray-400 ml-1">
            {typeDocs.length} 个文档
          </span>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-8 justify-center">
            <Loader2 size={14} className="animate-spin" />
            加载中...
          </div>
        )}

        {!isLoading && typeDocs.length === 0 && (
          <div className="text-sm text-gray-400 py-10 text-center">
            暂无{typeLabel}，请上传
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
                          navigate(`/admin/document/${kbName}/${doc.id}/review`)
                        }
                      >
                        待审核
                      </span>
                    )}
                    {doc.status === "pending_chunk_review" && (
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 cursor-pointer hover:bg-blue-200"
                        onClick={() =>
                          navigate(`/admin/document/${kbName}/${doc.id}/chunks`)
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
                              <Loader2 size={10} className="animate-spin" />
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

      {editingDocId && (
        <DocumentEditModal
          kbName={kbName}
          docId={editingDocId}
          onClose={() => setEditingDocId(null)}
        />
      )}
    </>
  );
}
