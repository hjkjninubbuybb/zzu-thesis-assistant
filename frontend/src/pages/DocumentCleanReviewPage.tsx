import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { documentApi, extractError } from "@/lib/api";
import type { ReviewDetail } from "@/types/api";

export default function DocumentCleanReviewPage() {
  const { kbName, docId } = useParams<{ kbName: string; docId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const [content, setContent] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  // Fetch review detail (for resume scenario — navigating from doc list)
  const { data: review, isError: reviewError } = useQuery({
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
    const state = location.state as { cleanedContent?: string } | null;
    if (state?.cleanedContent && !loaded) {
      setContent(state.cleanedContent);
      setLoaded(true);
    }
  }, [location.state, loaded]);

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

  const handleDiscard = async () => {
    if (!window.confirm("确定放弃此文档？将删除已上传的文件。")) return;
    setDiscarding(true);
    try {
      await documentApi.delete(kbName!, Number(docId!));
    } catch {
      // 删除失败也继续导航（文档可在列表页再删）
    }
    navigate("/admin/documents?kb=" + kbName);
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
          <h2 className="text-lg font-semibold text-gray-900">审核清洗结果</h2>
          <p className="text-sm text-gray-500">
            {review?.file_name || "文档"} — 编辑后点击确认进入分块预览
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate("/admin/documents?kb=" + kbName)}
            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            返回列表
          </button>
          <button
            onClick={handleDiscard}
            disabled={discarding}
            className="px-4 py-2 text-sm text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            {discarding ? "删除中..." : "放弃文档"}
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
          分块失败：{extractError(confirmMutation.error)}
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
