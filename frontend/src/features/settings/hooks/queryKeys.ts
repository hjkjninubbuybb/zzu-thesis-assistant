export const settingsKeys = {
  all: () => ["settings"] as const,
  config: () => ["settings", "config"] as const,
  apiKey: () => ["settings", "api-key"] as const,
  models: () => ["settings", "models"] as const,
};
