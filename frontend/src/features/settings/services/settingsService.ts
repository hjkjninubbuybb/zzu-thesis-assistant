import { configApi } from "@shared/lib/api";
import type { ConfigUpdate } from "@shared/types/api";

export const settingsService = {
  get: () => configApi.get(),
  update: (payload: ConfigUpdate) => configApi.update(payload),
  testApiKey: () => configApi.testApiKey(),
  getApiKey: () => configApi.getApiKey(),
  updateApiKey: (apiKey: string, apiBaseUrl?: string) =>
    configApi.updateApiKey(apiKey, apiBaseUrl),
  getModels: () => configApi.getModels(),
};
