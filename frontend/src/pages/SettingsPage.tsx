import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, Loader2, X, CheckCircle, Eye, EyeOff, Key, Cpu, Search, Sparkles, Zap, XCircle } from 'lucide-react'
import { configApi, extractError } from '@/lib/api'

// ── 模型选项 ─────────────────────────────────────────────

const LLM_MODELS = [
  { value: 'qwen-plus', label: 'Qwen Plus', desc: '均衡性能，推荐日常使用' },
  { value: 'qwen-max', label: 'Qwen Max', desc: '最强推理能力，速度较慢' },
  { value: 'qwen-turbo', label: 'Qwen Turbo', desc: '响应最快，适合轻量任务' },
  { value: 'qwen-long', label: 'Qwen Long', desc: '超长上下文窗口' },
]

const EMBEDDING_MODELS = [
  { value: 'text-embedding-v3', label: 'Embedding V3', desc: '1024 维，精度更高' },
  { value: 'text-embedding-v2', label: 'Embedding V2', desc: '1536 维，兼容旧索引' },
]

const RERANKER_MODELS = [
  { value: 'gte-rerank', label: 'GTE Rerank', desc: '通用重排序，推荐' },
  { value: 'gte-rerank-hybrid', label: 'GTE Rerank Hybrid', desc: '混合重排序' },
]

// ── 通用组件 ─────────────────────────────────────────────

function Section({ icon: Icon, title, children }: {
  icon: React.ElementType; title: string; children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center">
          <Icon size={16} className="text-stone-600" />
        </div>
        <h2 className="text-sm font-semibold text-stone-800">{title}</h2>
      </div>
      {children}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-6">
      <div className="w-36 shrink-0 pt-2">
        <p className="text-sm font-medium text-stone-700">{label}</p>
        {hint && <p className="text-xs text-stone-400 mt-0.5">{hint}</p>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}

function ModelSelect({ value, options, onChange }: {
  value: string
  options: { value: string; label: string; desc: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1.5">
      {options.map(o => (
        <label
          key={o.value}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
            value === o.value
              ? 'border-stone-800 bg-stone-50'
              : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50/50'
          }`}
          onClick={() => onChange(o.value)}
        >
          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
            value === o.value ? 'border-stone-800' : 'border-stone-300'
          }`}>
            {value === o.value && <div className="w-2 h-2 rounded-full bg-stone-800" />}
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-stone-800">{o.label}</span>
            <span className="text-xs text-stone-400 ml-2">{o.desc}</span>
          </div>
        </label>
      ))}
    </div>
  )
}

function NumberInput({ value, min, max, onChange }: {
  value: number; min: number; max: number; onChange: (v: number) => void
}) {
  return (
    <input
      type="number" min={min} max={max} value={value}
      onChange={e => onChange(Math.max(min, Math.min(max, Number(e.target.value))))}
      className="w-20 border border-stone-300 rounded-lg px-2.5 py-1.5 text-sm text-center outline-none focus:ring-2 focus:ring-stone-400 focus:border-stone-400"
    />
  )
}

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  return (
    <div className={`fixed bottom-6 right-6 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-white text-sm z-50 ${type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
      {type === 'success' ? <CheckCircle size={16} /> : null}
      <span>{message}</span>
      <button onClick={onClose}><X size={14} /></button>
    </div>
  )
}

// ── 主页面 ────────────────────────────────────────────────

type FormState = {
  llm_model: string
  llm_fast_model: string
  embedding_model: string
  vector_top_k: number
  bm25_top_k: number
  hybrid_top_k: number
  rrf_k: number
  reranker_model: string
  reranker_top_n: number
  max_reformulations: number
}

const DEFAULT_FORM: FormState = {
  llm_model: 'qwen-plus',
  llm_fast_model: 'qwen-turbo',
  embedding_model: 'text-embedding-v3',
  vector_top_k: 10,
  bm25_top_k: 10,
  hybrid_top_k: 15,
  rrf_k: 60,
  reranker_model: 'gte-rerank',
  reranker_top_n: 5,
  max_reformulations: 2,
}

function configToForm(cfg: Record<string, any>): FormState {
  return {
    llm_model: cfg.llm?.model ?? DEFAULT_FORM.llm_model,
    llm_fast_model: cfg.llm?.fast_model ?? DEFAULT_FORM.llm_fast_model,
    embedding_model: cfg.embedding?.model ?? DEFAULT_FORM.embedding_model,
    vector_top_k: cfg.retrieval?.vector_top_k ?? DEFAULT_FORM.vector_top_k,
    bm25_top_k: cfg.retrieval?.bm25_top_k ?? DEFAULT_FORM.bm25_top_k,
    hybrid_top_k: cfg.retrieval?.hybrid_top_k ?? DEFAULT_FORM.hybrid_top_k,
    rrf_k: cfg.retrieval?.rrf_k ?? DEFAULT_FORM.rrf_k,
    reranker_model: cfg.reranker?.model ?? DEFAULT_FORM.reranker_model,
    reranker_top_n: cfg.reranker?.top_n ?? DEFAULT_FORM.reranker_top_n,
    max_reformulations: cfg.rag?.max_reformulations ?? DEFAULT_FORM.max_reformulations,
  }
}

export default function SettingsPage() {
  const qc = useQueryClient()
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // API Key state
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const { data: cfg, isLoading } = useQuery({
    queryKey: ['system-config'],
    queryFn: configApi.get,
  })

  const { data: apiKeyInfo } = useQuery({
    queryKey: ['api-key'],
    queryFn: configApi.getApiKey,
  })

  useEffect(() => {
    if (cfg) setForm(configToForm(cfg))
  }, [cfg])

  const saveMutation = useMutation({
    mutationFn: () => configApi.update({
      llm_model: form.llm_model,
      llm_fast_model: form.llm_fast_model,
      embedding_model: form.embedding_model,
      vector_top_k: form.vector_top_k,
      bm25_top_k: form.bm25_top_k,
      hybrid_top_k: form.hybrid_top_k,
      rrf_k: form.rrf_k,
      reranker_model: form.reranker_model,
      reranker_top_n: form.reranker_top_n,
      max_reformulations: form.max_reformulations,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['system-config'] })
      showToast('配置已保存', 'success')
    },
    onError: (e) => showToast(extractError(e), 'error'),
  })

  const apiKeyMutation = useMutation({
    mutationFn: () => configApi.updateApiKey(apiKeyInput),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api-key'] })
      setApiKeyInput('')
      setShowKey(false)
      setTestResult(null)
      showToast('API Key 已更新', 'success')
    },
    onError: (e) => showToast(extractError(e), 'error'),
  })

  const testMutation = useMutation({
    mutationFn: () => configApi.testApiKey(),
    onSuccess: (data) => setTestResult(data),
    onError: (e) => setTestResult({ ok: false, message: extractError(e) }),
  })

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(prev => ({ ...prev, [key]: value }))

  if (isLoading) {
    return (
      <div className="p-6 flex items-center gap-2 text-stone-500 text-sm">
        <Loader2 size={16} className="animate-spin" />加载配置中...
      </div>
    )
  }

  return (
    <div className="p-6 flex-1 overflow-y-auto bg-white rounded-2xl shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">系统配置</h1>
          <p className="mt-1 text-sm text-stone-500">管理模型、检索和 RAG 核心参数</p>
        </div>
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="flex items-center gap-2 px-5 py-2.5 bg-stone-800 text-white text-sm rounded-lg hover:bg-stone-900 disabled:opacity-60 transition-colors"
        >
          {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          保存配置
        </button>
      </div>

      <div className="space-y-4">

        {/* API 密钥 */}
        <Section icon={Key} title="API 密钥">
          <Field label="DashScope" hint="用于 LLM / Embedding / Reranker">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1 max-w-sm">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKeyInput}
                    onChange={e => setApiKeyInput(e.target.value)}
                    placeholder={apiKeyInfo?.has_key ? apiKeyInfo.masked_key : '请输入 API Key'}
                    className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm pr-10 outline-none focus:ring-2 focus:ring-stone-400 focus:border-stone-400 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(v => !v)}
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
                  {apiKeyMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : '更新'}
                </button>
              </div>
              <div className="flex items-center gap-3">
                {apiKeyInfo?.has_key && (
                  <button
                    onClick={() => testMutation.mutate()}
                    disabled={testMutation.isPending}
                    className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-700 transition-colors"
                  >
                    {testMutation.isPending
                      ? <Loader2 size={12} className="animate-spin" />
                      : <Zap size={12} />}
                    {testMutation.isPending ? '测试中...' : '连接测试'}
                  </button>
                )}
                {apiKeyInfo && !apiKeyInfo.has_key && (
                  <p className="text-xs text-amber-600">未配置，LLM 和 Embedding 功能将不可用</p>
                )}
                {testResult && (
                  <span className={`text-xs flex items-center gap-1 ${testResult.ok ? 'text-emerald-600' : 'text-red-500'}`}>
                    {testResult.ok ? <CheckCircle size={12} /> : <XCircle size={12} />}
                    {testResult.message}
                  </span>
                )}
              </div>
            </div>
          </Field>
        </Section>

        {/* 模型配置 */}
        <Section icon={Cpu} title="模型配置">
          <div className="space-y-6">
            <Field label="对话模型" hint="生成最终回答">
              <ModelSelect
                value={form.llm_model}
                options={LLM_MODELS}
                onChange={v => set('llm_model', v)}
              />
            </Field>
            <Field label="快速模型" hint="文档清洗、简单判断任务">
              <ModelSelect
                value={form.llm_fast_model}
                options={LLM_MODELS}
                onChange={v => set('llm_fast_model', v)}
              />
            </Field>
            <Field label="向量模型" hint="修改后需重新入库">
              <ModelSelect
                value={form.embedding_model}
                options={EMBEDDING_MODELS}
                onChange={v => set('embedding_model', v)}
              />
            </Field>
            <Field label="重排序模型" hint="检索结果精排">
              <ModelSelect
                value={form.reranker_model}
                options={RERANKER_MODELS}
                onChange={v => set('reranker_model', v)}
              />
            </Field>
          </div>
        </Section>

        {/* 检索参数 */}
        <Section icon={Search} title="检索参数">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              <Field label="Vector Top-K" hint="向量检索召回数">
                <NumberInput value={form.vector_top_k} min={1} max={50} onChange={v => set('vector_top_k', v)} />
              </Field>
              <Field label="BM25 Top-K" hint="关键词检索召回数">
                <NumberInput value={form.bm25_top_k} min={1} max={50} onChange={v => set('bm25_top_k', v)} />
              </Field>
              <Field label="Hybrid Top-K" hint="融合后保留数">
                <NumberInput value={form.hybrid_top_k} min={1} max={50} onChange={v => set('hybrid_top_k', v)} />
              </Field>
              <Field label="RRF K" hint="RRF 平滑参数">
                <NumberInput value={form.rrf_k} min={1} max={200} onChange={v => set('rrf_k', v)} />
              </Field>
            </div>
            <div className="border-t border-stone-100 pt-4">
              <Field label="Reranker Top-N" hint="重排后保留数">
                <NumberInput value={form.reranker_top_n} min={1} max={20} onChange={v => set('reranker_top_n', v)} />
              </Field>
            </div>
          </div>
        </Section>

        {/* RAG 参数 */}
        <Section icon={Sparkles} title="RAG 参数">
          <Field label="最大改写次数" hint="改写可提升召回，但增加延迟">
            <div className="flex gap-1.5">
              {[0, 1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => set('max_reformulations', n)}
                  className={`w-9 py-1.5 text-sm rounded-lg border transition-colors ${
                    form.max_reformulations === n
                      ? 'bg-stone-800 text-white border-stone-800'
                      : 'border-stone-300 text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </Field>
        </Section>

      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
