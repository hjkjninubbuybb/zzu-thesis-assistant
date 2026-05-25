import {
  getAccessToken,
  getRefreshToken,
  saveAuth,
  clearAuth,
  getCurrentPortal,
} from "@/lib/auth";
import type {
  ChatMessage,
  FileItem,
  HistoryMessage,
  SourceItem,
} from "@/types/api";

// ── 历史记录构建 ──────────────────────────────────────────

const MAX_HISTORY_TURNS = 10;
const MAX_MSG_LENGTH = 1500;

export function buildHistory(messages: ChatMessage[]): HistoryMessage[] {
  const pairs: HistoryMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const next = messages[i + 1];
    if (
      m.role === "user" &&
      next?.role === "assistant" &&
      next?.status === "done"
    ) {
      pairs.push({ role: "user", content: m.content });
      pairs.push({
        role: "assistant",
        content:
          next.content.length > MAX_MSG_LENGTH
            ? next.content.slice(0, MAX_MSG_LENGTH) + "\n...(内容已截断)"
            : next.content,
      });
      i++;
    }
  }
  return pairs.slice(-MAX_HISTORY_TURNS * 2);
}

// ── SSE 流式对话 ──────────────────────────────────────────

export async function streamChat(
  kb_name: string,
  query: string,
  max_reformulations: number,
  history: HistoryMessage[],
  signal: AbortSignal,
  onStatus: (step: string) => void,
  onAnswer: (text: string) => void,
  onSources: (sources: SourceItem[]) => void,
  onError: (msg: string) => void,
  onToken?: (text: string) => void,
  onAgentAction?: (tool: string, input: string) => void,
  onFile?: (file: FileItem) => void,
  onSuggestions?: (items: string[]) => void,
): Promise<void> {
  const token = getAccessToken();
  const resp = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ kb_name, query, max_reformulations, history }),
    signal,
  });
  if (resp.status === 401) {
    // 尝试 refresh token，成功则重试一次
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      try {
        const refreshResp = await fetch("/api/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (refreshResp.ok) {
          const data = await refreshResp.json();
          saveAuth(data);
          // 用新 token 重试
          return streamChat(
            kb_name,
            query,
            max_reformulations,
            history,
            signal,
            onStatus,
            onAnswer,
            onSources,
            onError,
            onToken,
            onAgentAction,
            onFile,
            onSuggestions,
          );
        }
      } catch {
        /* refresh 失败，走下面跳转 */
      }
    }
    const p = getCurrentPortal();
    clearAuth(p);
    window.location.href = p === "student" ? "/student/login" : "/admin/login";
    return;
  }
  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    onError(data.detail ?? `HTTP ${resp.status}`);
    return;
  }

  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("event:")) {
        currentEvent = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        const dataStr = line.slice(5).trim();
        if (!dataStr) continue;
        try {
          const data = JSON.parse(dataStr);
          if (currentEvent === "status") onStatus(data.step);
          else if (currentEvent === "token") onToken?.(data.text);
          else if (currentEvent === "agent_action")
            onAgentAction?.(data.tool, data.input ?? "");
          else if (currentEvent === "answer") onAnswer(data.text);
          else if (currentEvent === "sources") onSources(data.sources);
          else if (currentEvent === "file") onFile?.(data as FileItem);
          else if (currentEvent === "suggestions") onSuggestions?.(data.items);
          else if (currentEvent === "error") onError(data.message);
        } catch {
          /* 忽略解析错误 */
        }
      }
    }
  }
}
