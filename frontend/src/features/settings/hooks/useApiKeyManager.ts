import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsService } from "../services/settingsService";
import { settingsKeys } from "./queryKeys";
import { useToast } from "@shared/store/uiStore";
import { handleMutationError } from "@shared/lib/errorHandler";

export function useApiKeyManager() {
  const qc = useQueryClient();
  const { showToast } = useToast();

  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiUrlInput, setApiUrlInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [isEditingKey, setIsEditingKey] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
    models?: string[];
  } | null>(null);

  const { data: apiKeyInfo } = useQuery({
    queryKey: settingsKeys.apiKey(),
    queryFn: settingsService.getApiKey,
  });

  const { data: availableModels } = useQuery({
    queryKey: settingsKeys.models(),
    queryFn: settingsService.getModels,
    enabled: !!apiKeyInfo?.has_key,
  });

  useEffect(() => {
    if (apiKeyInfo) {
      setApiUrlInput(apiKeyInfo.api_base_url || "");
    }
  }, [apiKeyInfo]);

  const apiKeyMutation = useMutation({
    mutationFn: () => settingsService.updateApiKey(apiKeyInput, apiUrlInput),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.apiKey() });
      qc.invalidateQueries({ queryKey: settingsKeys.models() });
      setApiKeyInput("");
      setShowKey(false);
      setIsEditingKey(false);
      setTestResult(null);
      showToast("API 信息已更新", "success");
    },
    onError: (err) => handleMutationError(err, showToast),
  });

  const testMutation = useMutation({
    mutationFn: settingsService.testApiKey,
    onSuccess: (data) => {
      setTestResult(data);
      if (data.ok) qc.invalidateQueries({ queryKey: settingsKeys.models() });
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : "连接测试失败";
      setTestResult({ ok: false, message });
    },
  });

  const cancelEdit = () => {
    setIsEditingKey(false);
    setApiKeyInput("");
    setShowKey(false);
  };

  const startEdit = () => {
    setIsEditingKey(true);
    setShowKey(false);
  };

  return {
    apiKeyInfo,
    availableModels,
    apiKeyInput,
    setApiKeyInput,
    apiUrlInput,
    setApiUrlInput,
    showKey,
    setShowKey,
    isEditingKey,
    startEdit,
    cancelEdit,
    testResult,
    apiKeyMutation,
    testMutation,
  };
}
