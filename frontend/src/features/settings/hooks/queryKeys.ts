export const settingsKeys = {
  all: () => ['settings'] as const,
  config: () => ['settings', 'config'] as const,
  apiInfo: () => ['settings', 'api-info'] as const,
};
