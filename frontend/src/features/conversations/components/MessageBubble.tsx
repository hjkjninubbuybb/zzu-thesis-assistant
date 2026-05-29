import { memo } from "react";
import {
  Loader2,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  HelpCircle,
} from "lucide-react";
import { AgentAvatar } from "./AgentAvatar";
import { AcademicMarkdown } from "./AcademicMarkdown";
import { FileCard } from "./FileCard";
import { SourcesPanel } from "./SourcesPanel";
import type { ChatMessage } from "@shared/types/api";

// ── 反馈按钮 ──────────────────────────────────────────────

function MessageActions({
  dbMessageId,
  feedback,
  onFeedback,
  onAskTutor,
}: {
  dbMessageId?: number;
  feedback?: "up" | "down" | null;
  onFeedback: (rating: "up" | "down") => void;
  onAskTutor?: () => void;
}) {
  if (!dbMessageId) return null;
  return (
    <div className="flex items-center gap-1 mt-2">
      <button
        onClick={() => onFeedback("up")}
        className={`p-1 rounded-md transition-colors ${
          feedback === "up"
            ? "text-green-600 bg-green-50"
            : "text-gray-300 hover:text-gray-500 hover:bg-gray-50"
        }`}
        title="有帮助"
      >
        <ThumbsUp size={13} />
      </button>
      <button
        onClick={() => onFeedback("down")}
        className={`p-1 rounded-md transition-colors ${
          feedback === "down"
            ? "text-red-500 bg-red-50"
            : "text-gray-300 hover:text-gray-500 hover:bg-gray-50"
        }`}
        title="没帮助"
      >
        <ThumbsDown size={13} />
      </button>
      {onAskTutor && (
        <button
          onClick={onAskTutor}
          className="flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded-md text-[10px] text-blue-600 bg-blue-50/50 hover:bg-blue-50 hover:text-blue-700 transition-colors border border-blue-100/50 hover:border-blue-200"
          title="求助导师"
        >
          <HelpCircle size={12} />
          <span className="font-medium">求助导师</span>
        </button>
      )}
    </div>
  );
}

// ── 消息气泡 ──────────────────────────────────────────────

export const MessageBubble = memo(function MessageBubble({
  msg,
  onFeedback,
  onSuggestionClick,
  onAskTutor,
  isStudent,
}: {
  msg: ChatMessage;
  onFeedback: (msgId: number, rating: "up" | "down") => void;
  onSuggestionClick?: (text: string) => void;
  onAskTutor?: (msg: ChatMessage) => void;
  isStudent?: boolean;
}) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end mb-6">
        <div
          className={`max-w-[85%] text-white text-sm px-4 py-2.5 rounded-2xl rounded-tr-sm shadow-sm ${isStudent ? "bg-[#2563EB]" : "bg-[#334155]"} ${msg.isNew ? "animate-apple-slide-r" : ""}`}
        >
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col gap-3 mb-10 ${msg.isNew ? "animate-apple-fade-up" : ""}`}
    >
      <div className="flex gap-4">
        <AgentAvatar isStudent={!!isStudent} />
        <div className="flex-1 min-w-0 pt-1">
          {msg.status === "loading" ? (
            msg.content ? (
              <div className="relative">
                <AcademicMarkdown content={msg.content} sources={msg.sources} />
                <span className="cursor-blink" />
              </div>
            ) : (
              <div className="flex items-center gap-2 text-gray-400 text-sm">
                <Loader2 size={14} className="animate-spin" />
                <span className="text-shimmer">正在思考...</span>
              </div>
            )
          ) : msg.status === "error" ? (
            <div className="flex items-center gap-2 text-red-500 bg-red-50 px-4 py-3 rounded-xl text-sm border border-red-100 shadow-sm">
              <AlertCircle size={15} />
              <span>{msg.content}</span>
            </div>
          ) : (
            <div className="space-y-4">
              <AcademicMarkdown content={msg.content} sources={msg.sources} />
              {msg.files && msg.files.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md animate-apple-fade-up">
                  {msg.files.map((f, i) => (
                    <FileCard key={i} file={f} />
                  ))}
                </div>
              )}
              {msg.sources && msg.sources.length > 0 && (
                <SourcesPanel sources={msg.sources} />
              )}
              <div className="flex items-center justify-between mt-4">
                <MessageActions
                  dbMessageId={msg.dbMessageId}
                  feedback={msg.feedback}
                  onFeedback={(rating) =>
                    msg.dbMessageId && onFeedback(msg.dbMessageId, rating)
                  }
                  onAskTutor={() => onAskTutor?.(msg)}
                />
              </div>
            </div>
          )}
        </div>
      </div>
      {msg.status === "done" &&
        msg.suggestions &&
        msg.suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2 pl-12">
            {msg.suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => onSuggestionClick?.(s)}
                style={{ animationDelay: `${i * 60}ms` }}
                className={`animate-apple-fade-up text-xs px-3.5 py-1.5 rounded-full border border-gray-100 bg-white/50 text-gray-600 hover:bg-white hover:text-[#334155] hover:border-gray-200 transition-all shadow-sm active:scale-[0.97] ${isStudent ? "hover:text-[#2563EB] hover:border-[#D9DEE5]" : ""}`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
    </div>
  );
});
