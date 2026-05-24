import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { documentApi, extractError } from "@/lib/api";
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
  const { data: review, isError: reviewError } = useQuery({
    queryKey: ["review", kbName, docId],
    queryFn: () =>
      documentApi.getReview(kbName!, Number(docId!)).then((r) => r.data),
    enabled: !!kbName && !!docId && !loaded,
  });

  useEffect(() => {
    if (review && !loaded) {
      setChunks(review.chunks ?? []);
      setLoaded(true);
    }
  }, [review, loaded]);

  const confirmMutation = useMutation({
    mutationFn: () =>
      documentApi.confirmIndex(kbName!, Number(docId!)).then((r) => r.data),
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ["documents", kbName] });
      qc.invalidateQueries({ queryKey: ["knowledge-bases"] });

      try {
        const docs = await documentApi.list(kbName!);
        const nextReview = docs.find((d) => d.status === "pending_review");
        if (nextReview) {
          navigate(`/admin/document/${kbName}/${nextReview.id}/review`);
          return;
        }
        const nextChunk = docs.find(
          (d) => d.status === "pending_chunk_review" && d.id !== Number(docId),
        );
        if (nextChunk) {
          navigate(`/admin/document/${kbName}/${nextChunk.id}/chunks`);
          return;
        }
      } catch {
        // 查询失败则回退到列表页
      }
      navigate("/admin/documents?kb=" + kbName);
    },
  });

  const handleBack = () => {
    navigate(`/admin/document/${kbName}/${docId}/review`);
  };

  if (!loaded) {
    if (reviewError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3">
          <div className="text-red-500 text-sm">加载失败，请返回列表重试</div>
          <button
            onClick={() => navigate("/admin/documents?kb=" + kbName)}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            返回列表
          </button>
        </div>
      );
    }
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
            onClick={() => {
              if (window.confirm(`确认将 ${chunks.length} 个分块向量化入库？`))
                confirmMutation.mutate();
            }}
            disabled={confirmMutation.isPending || chunks.length === 0}
            className="px-4 py-2 text-sm text-white bg-black rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {confirmMutation.isPending ? "入库中..." : "确认入库"}
          </button>
        </div>
      </div>

      {/* Error display */}
      {confirmMutation.isError && (
        <div className="mx-4 mt-2 px-3 py-2 bg-red-50 text-red-600 text-sm rounded-lg">
          入库失败：{extractError(confirmMutation.error)}
        </div>
      )}

      {/* Chunk list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {chunks.length === 0 && (
          <div className="text-center text-gray-400 py-16">
            没有分块数据，请返回编辑页重新分块
          </div>
        )}
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
