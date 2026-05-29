import { useState, useRef, useCallback } from "react";
import { chatService } from "../services/chatService";
import type { FileItem, SourceItem } from "@shared/types/api";
import type { ChatMessagesState } from "./useChatMessages";
import {
  MAX_REF,
  INITIAL_THINKING,
  applyStatusStep,
  applyToolStep,
  ensureConversation,
  saveAssistantTurn,
} from "./chatStreamHelpers";

export interface ChatStreamState {
  isStreaming: boolean;
  send: (
    query: string,
    chatKb: string,
    activeConvId: number | null,
    onConvCreated: (convId: number) => void,
    onInvalidate: () => void,
  ) => Promise<void>;
  stop: () => void;
}

export function useChatStream(msgState: ChatMessagesState): ChatStreamState {
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const {
    messages,
    setThinkingSteps,
    appendUserAndAssistant,
    updateAssistantContent,
    updateAssistantSources,
    updateAssistantError,
    appendAssistantFile,
    finalizeAssistant,
  } = msgState;

  const send = useCallback(
    async (
      query: string,
      chatKb: string,
      activeConvId: number | null,
      onConvCreated: (convId: number) => void,
      onInvalidate: () => void,
    ) => {
      if (!query.trim() || !chatKb || isStreaming) return;

      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const history = chatService.buildHistory(messages);

      const convId = await ensureConversation(
        chatKb,
        activeConvId,
        onConvCreated,
        onInvalidate,
      );
      if (!convId) return;

      let userDbMsg: { id: number } | null = null;
      try {
        userDbMsg = await chatService.addMessage(convId, {
          role: "user",
          content: query,
        });
      } catch {
        /* 继续 */
      }

      const isFirstTurn = messages.length === 0;
      const assistantId = crypto.randomUUID();
      const currentConvId = convId;

      appendUserAndAssistant(query, assistantId, userDbMsg?.id);
      setIsStreaming(true);
      setThinkingSteps([...INITIAL_THINKING]);

      let accumulatedText = "";
      let finalSources: SourceItem[] = [];
      let finalFiles: FileItem[] = [];
      let finalSuggestions: string[] = [];

      try {
        await chatService.stream(
          chatKb,
          query,
          MAX_REF,
          history,
          ctrl.signal,
          (step: string) => setThinkingSteps((p) => applyStatusStep(p, step)),
          (text: string) => {
            accumulatedText = text;
            updateAssistantContent(assistantId, text);
          },
          (src: SourceItem[]) => {
            finalSources = src;
            updateAssistantSources(assistantId, src);
          },
          (errMsg: string) => updateAssistantError(assistantId, errMsg),
          (token: string) => {
            accumulatedText += token;
            updateAssistantContent(assistantId, accumulatedText);
          },
          (tool: string, input: string) =>
            setThinkingSteps((p) => applyToolStep(p, tool, input)),
          (file: FileItem) => {
            finalFiles.push(file);
            appendAssistantFile(assistantId, file);
          },
          (items: string[]) => {
            finalSuggestions = items;
          },
        );

        setThinkingSteps([]);
        const assistantDbId = await saveAssistantTurn(
          currentConvId,
          accumulatedText,
          finalSources,
          finalFiles,
          isFirstTurn,
          onInvalidate,
        );
        finalizeAssistant(assistantId, assistantDbId, finalSuggestions);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        updateAssistantError(assistantId, String(e));
      } finally {
        setIsStreaming(false);
      }
    },
    [
      isStreaming,
      messages,
      setThinkingSteps,
      appendUserAndAssistant,
      updateAssistantContent,
      updateAssistantSources,
      updateAssistantError,
      appendAssistantFile,
      finalizeAssistant,
    ],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { isStreaming, send, stop };
}
