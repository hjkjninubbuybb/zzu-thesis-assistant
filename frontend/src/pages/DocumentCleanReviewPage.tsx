import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { documentApi } from "@/lib/api";
import type { ReviewDetail } from "@/types/api";

export default function DocumentCleanReviewPage() {
  const { kbName, docId } = useParams<{ kbName: string; docId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [content, setContent] = useState("");
  const [loaded, setLoaded] = useState(false);

  // Fetch review detail (for resume scenario — navigating from doc list)
  const { data: review } = useQuery({
    queryKey: ["review", kbName, docId],
    queryFn: () =>
      documentApi.getReview(kbName!, Number(docId!)).then((r) => r.data),
    enabled: !!kbName && !!docId,
  });

  useEffect(() => {
    if (review && !loaded) {
      setContent(review.cleaned_content || "");
      setLoaded(true);
    }
  }, [review, loaded]);

  // Accept content from navigation state (upload just completed)
  useEffect(() => {
    const state = window.history.state?.usr as
      | { cleanedContent?: string }
      | undefined;
    if (state?.cleanedContent && !loaded) {
      setContent(state.cleanedContent);
      setLoaded(true);
    }
  }, [loaded]);

  const confirmMutation = useMutation({
    mutationFn: () =>
      documentApi
        .confirmClean(kbName!, Number(docId!), content)
        .then((r) => r.data),
    onSuccess: (result) => {
      navigate(`/admin/document/${kbName}/${docId}/chunks`, {
        state: { chunks: result.chunks, chunkCount: result.chunk_count },
      });
    },
  });

  const handleDiscard = () => {
    if (window.confirm("确定放弃此文档？将删除已上传的文件。")) {
      documentApi.delete(kbName!, Number(docId!));
      navigate("/admin/documents?kb=" + kbName);
    }
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
          <h2 className="text-lg font-semibold text-gray-900">审核清洗结果</h2>
          <p className="text-sm text-gray-500">
            {review?.file_name || "文档"} — 编辑后点击确认进入分块预览
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleDiscard}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            放弃
          </button>
          <button
            onClick={() => confirmMutation.mutate()}
            disabled={confirmMutation.isPending || !content.trim()}
            className="px-4 py-2 text-sm text-white bg-black rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {confirmMutation.isPending ? "分块中..." : "确认并分块"}
          </button>
        </div>
      </div>

      {/* Error display */}
      {confirmMutation.isError && (
        <div className="mx-4 mt-2 px-3 py-2 bg-red-50 text-red-600 text-sm rounded-lg">
          分块失败：{(confirmMutation.error as Error).message}
        </div>
      )}

      {/* Split pane: editor + preview */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Markdown source editor */}
        <div className="flex-1 flex flex-col border-r border-gray-200">
          <div className="px-3 py-2 text-xs font-medium text-gray-500 bg-gray-50 border-b border-gray-100">
            Markdown 源码
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="flex-1 p-4 font-mono text-sm leading-relaxed resize-none outline-none bg-white"
            placeholder="清洗后的文本..."
            spellCheck={false}
          />
        </div>

        {/* Right: Markdown rendered preview */}
        <div className="flex-1 flex flex-col">
          <div className="px-3 py-2 text-xs font-medium text-gray-500 bg-gray-50 border-b border-gray-100">
            渲染预览
          </div>
          <div className="flex-1 p-4 overflow-y-auto prose prose-sm max-w-none">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}
