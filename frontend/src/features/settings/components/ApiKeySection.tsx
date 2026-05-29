import {
  CheckCircle,
  Eye,
  EyeOff,
  Key,
  Loader2,
  XCircle,
  Zap,
} from "lucide-react";
import { Section, Field } from "./SettingsPrimitives";
import type { useApiKeyManager } from "../hooks/useApiKeyManager";

type ApiKeyManagerReturn = ReturnType<typeof useApiKeyManager>;

interface ApiKeySectionProps {
  manager: ApiKeyManagerReturn;
}

export function ApiKeySection({ manager }: ApiKeySectionProps) {
  const {
    apiKeyInfo,
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
  } = manager;

  return (
    <Section icon={Key} title="API 平台配置">
      <div className="space-y-4">
        <Field label="API 平台地址" hint="符合 OpenAI 格式的 Base URL">
          <div className="max-w-sm">
            <input
              type="text"
              value={apiUrlInput}
              onChange={(e) => setApiUrlInput(e.target.value)}
              disabled={apiKeyInfo?.has_key && !isEditingKey}
              placeholder="https://api.deepseek.com/v1"
              className="w-full border border-stone-200 bg-stone-50 rounded-lg px-3 py-2 text-sm font-mono text-stone-700 outline-none focus:ring-2 focus:ring-stone-400 disabled:opacity-60"
            />
          </div>
        </Field>

        <Field label="API Key" hint="您的平台鉴权密钥">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {apiKeyInfo?.has_key && !isEditingKey ? (
                <>
                  <div className="relative flex-1 max-w-sm">
                    <input
                      readOnly
                      type={showKey ? "text" : "password"}
                      value={apiKeyInfo.masked_key}
                      className="w-full border border-stone-200 bg-stone-50 rounded-lg px-3 py-2 text-sm pr-10 font-mono text-stone-700 cursor-default"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                    >
                      {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <button
                    onClick={startEdit}
                    className="px-4 py-2 text-sm border border-stone-300 rounded-lg hover:bg-stone-50 transition-colors"
                  >
                    修改
                  </button>
                </>
              ) : (
                <>
                  <div className="relative flex-1 max-w-sm">
                    <input
                      type={showKey ? "text" : "password"}
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder="请输入 API Key"
                      className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm pr-10 outline-none focus:ring-2 focus:ring-stone-400 focus:border-stone-400 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                    >
                      {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <button
                    onClick={() => apiKeyMutation.mutate()}
                    disabled={!apiKeyInput.trim() || apiKeyMutation.isPending}
                    className="px-4 py-2 text-sm border border-stone-300 rounded-lg hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {apiKeyMutation.isPending ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      "更新"
                    )}
                  </button>
                  {isEditingKey && (
                    <button
                      onClick={cancelEdit}
                      className="px-3 py-2 text-sm text-stone-500 hover:text-stone-700 transition-colors"
                    >
                      取消
                    </button>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center gap-3">
              {apiKeyInfo?.has_key && (
                <button
                  onClick={() => testMutation.mutate()}
                  disabled={testMutation.isPending}
                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
                >
                  {testMutation.isPending ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Zap size={12} />
                  )}
                  {testMutation.isPending
                    ? "正在拉取模型..."
                    : "测试连接并获取模型列表"}
                </button>
              )}
              {apiKeyInfo && !apiKeyInfo.has_key && (
                <p className="text-xs text-amber-600">未配置 API 信息</p>
              )}
              {testResult && (
                <span
                  className={`text-xs flex items-center gap-1 ${testResult.ok ? "text-emerald-600" : "text-red-500"}`}
                >
                  {testResult.ok ? (
                    <CheckCircle size={12} />
                  ) : (
                    <XCircle size={12} />
                  )}
                  {testResult.message}
                </span>
              )}
            </div>
          </div>
        </Field>
      </div>
    </Section>
  );
}
