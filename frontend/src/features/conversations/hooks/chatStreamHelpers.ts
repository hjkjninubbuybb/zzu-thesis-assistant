import { chatService } from "../services/chatService";
import type { FileItem, SourceItem } from "@shared/types/api";
import type { ThinkingStep } from "../components/ThinkingProcess";

export const STATUS_TEXT: Record<string, string> = {
  faq_matching: "正在匹配知识库 FAQ...",
  faq_answering: "正在生成 FAQ 快答...",
  building_retriever: "正在构建知识库检索索引...",
  running_rag: "正在检索并生成答案...",
};

export const TOOL_LABELS: Record<string, string> = {
  search_knowledge_base: "🔍 检索知识库",
  get_academic_calendar: "📅 查询郑大校历",
  list_kb_documents: "📋 查看文档目录",
  get_document_link: "📎 查找原文文件",
};

export const MAX_REF = 2;

export const INITIAL_THINKING: ThinkingStep[] = [
  { id: "step-1", label: "正在理解并优化查询...", status: "active" },
  { id: "step-2", label: "正在检索相关文档...", status: "pending" },
  { id: "step-3", label: "正在分析并总结回答...", status: "pending" },
];

export function applyStatusStep(
  prev: ThinkingStep[],
  step: string,
): ThinkingStep[] {
  const next = [...prev];
  if (step === "faq_matching" || step === "faq_answering") {
    next[0] = { ...next[0], status: "active", label: STATUS_TEXT[step] };
  } else if (step === "building_retriever") {
    next[0] = { ...next[0], status: "done" };
    next[1] = { ...next[1], status: "active", label: STATUS_TEXT[step] };
  } else if (step === "running_rag") {
    next[1] = { ...next[1], status: "done" };
    next[2] = { ...next[2], status: "active", label: STATUS_TEXT[step] };
  }
  return next;
}

/** Ensures a conversation exists, creating one if needed. Returns the convId or null on failure. */
export async function ensureConversation(
  chatKb: string,
  activeConvId: number | null,
  onConvCreated: (convId: number) => void,
  onInvalidate: () => void,
): Promise<number | null> {
  if (activeConvId) return activeConvId;
  try {
    const conv = await chatService.createConversation(chatKb, "新对话");
    onConvCreated(conv.id);
    onInvalidate();
    return conv.id;
  } catch {
    return null;
  }
}

/** Saves the assistant turn to DB and optionally triggers title summarization. */
export async function saveAssistantTurn(
  convId: number,
  accumulatedText: string,
  finalSources: SourceItem[],
  finalFiles: FileItem[],
  isFirstTurn: boolean,
  onInvalidate: () => void,
): Promise<number | undefined> {
  let assistantDbId: number | undefined;
  try {
    const saved = await chatService.addMessage(convId, {
      role: "assistant",
      content: accumulatedText,
      sources: finalSources.length > 0 ? finalSources : null,
      files: finalFiles.length > 0 ? finalFiles : null,
    });
    assistantDbId = saved.id;
  } catch {
    /* 静默失败 */
  }
  onInvalidate();
  if (isFirstTurn) {
    chatService
      .summarizeTitle(convId)
      .then(() => onInvalidate())
      .catch(() => {
        /* 失败则保持 "新对话" */
      });
  }
  return assistantDbId;
}

export function applyToolStep(
  prev: ThinkingStep[],
  tool: string,
  input: string,
): ThinkingStep[] {
  const label = TOOL_LABELS[tool] ?? tool;
  const existingIdx = prev.findIndex((s) => s.id === `tool-${tool}`);
  if (existingIdx >= 0) {
    const next = [...prev];
    next[existingIdx] = { ...next[existingIdx], status: "active", input };
    return next;
  }
  const activeIdx = prev.findLastIndex((s) => s.status === "active");
  const next = [...prev];
  next.splice(activeIdx, 0, {
    id: `tool-${tool}`,
    label,
    status: "active",
    input,
  });
  return next;
}
