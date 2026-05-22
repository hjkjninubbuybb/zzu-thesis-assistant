import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { documentApi } from "@/lib/api";
import type { ChunkPreview } from "@/types/api";

export default function DocumentChunkReviewPage() {
  const { kbName, docId } = useParams<{ kbName: string; docId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();

  const [chunks, setChunks] = useState<ChunkPreview[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Accept chunks from navigation state (confirm-clean just completed)
  useEffect(() => {
    const state = location.state as {
      chunks?: ChunkPreview[];
      chunkCount?: number;
    } | null;
    if (state?.chunks && !loaded) {
      setChunks(state.chunks);
      setLoaded(true);
    }
  }, [location.state, loaded]);

  // Fallback: fetch from API if no navigation state (resume scenario)
  const { data: review } = useQuery({
    queryKey: ["review", kbName, docId],
    queryFn: () =>
      documentApi.getReview(kbName!, Number(docId!)).then((r) => r.data),
    enabled: !!kbName && !!docId && !loaded,
  });

  useEffect(() => {
    if (review?.chunks && !loaded) {
      setChunks(review.chunks);
      setLoaded(true);
    }
  }, [review, loaded]);

  const confirmMutation = useMutation({
    mutationFn: () =>
      documentApi.confirmIndex(kbName!, Number(docId!)).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents", kbName] });
      qc.invalidateQueries({ queryKey: ["knowledge-bases"] });
      navigate("/admin/documents?kb=" + kbName);
    },
  });

  const handleBack = () => {
    navigate(`/admin/document/${kbName}/${docId}/review`);
  };

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white rounded-t-2xl">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">分块预览</h2>
          <p className="text-sm text-gray-500">
            共 {chunks.length} 个分块 — 确认后将向量化入库
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleBack}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            返回编辑
          </button>
          <button
            onClick={() => confirmMutation.mutate()}
            disabled={confirmMutation.isPending}
            className="px-4 py-2 text-sm text-white bg-black rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {confirmMutation.isPending ? "入库中..." : "确认入库"}
          </button>
        </div>
      </div>

      {/* Error display */}
      {confirmMutation.isError && (
        <div className="mx-4 mt-2 px-3 py-2 bg-red-50 text-red-600 text-sm rounded-lg">
          入库失败：{(confirmMutation.error as Error).message}
        </div>
      )}

      {/* Chunk list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {chunks.map((chunk) => (
          <div
            key={chunk.index}
            className="bg-white rounded-xl border border-gray-200 overflow-hidden"
          >
            <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
              <span className="text-xs font-mono font-medium text-gray-500">
                #{chunk.index + 1}
              </span>
              <span className="text-xs text-gray-400">
                {chunk.content.length} 字符
              </span>
            </div>
            <div className="p-3 prose prose-sm max-w-none text-sm">
              <ReactMarkdown>{chunk.content}</ReactMarkdown>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
