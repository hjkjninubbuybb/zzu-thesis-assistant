import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Save, Loader2, X, CheckCircle, Eye, EyeOff, Key, Cpu, Search,
  Sparkles, Zap, XCircle, ChevronDown, FileText
} from 'lucide-react'
import { configApi, extractError } from '@/lib/api'
import type { SplitterType } from '@/types/api'

// ── 通用组件 ─────────────────────────────────────────────

function Section({ icon: Icon, title, children }: {
  icon: React.ElementType; title: string; children: React.ReactNode
}) {
  return (
    <div className="glass-card rounded-xl p-5">
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

function SearchableSelect({ value, options, onChange, placeholder = "选择模型..." }: {
  value: string
  options: { value: string; label: string; desc?: string }[]
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = options.filter(o => 
    o.label.toLowerCase().includes(search.toLowerCase()) || 
    o.value.toLowerCase().includes(search.toLowerCase())
  )

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative max-w-sm" ref={containerRef}>
      <div 
        onClick={() => setOpen(!open)}
        className="w-full bg-white border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm flex items-center justify-between cursor-pointer hover:border-stone-400 transition-all shadow-sm"
      >
        <span className="truncate font-medium text-stone-700">
          {options.find(o => o.value === value)?.label || value || placeholder}
        </span>
        <ChevronDown size={14} className={`text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>

      {open && (
        <div className="absolute z-50 w-full mt-2 bg-white border border-stone-200 rounded-2xl shadow-2xl overflow-hidden animate-apple-pop origin-top">
          <div className="p-2 border-b border-stone-50 bg-stone-50/50">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="搜索模型名称..."
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-stone-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-stone-200"
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto custom-scrollbar py-1">
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-xs text-stone-400 text-center italic">没有匹配的模型</div>
            ) : (
              filtered.map(o => (
                <div
                  key={o.value}
                  onClick={() => { onChange(o.value); setOpen(false); setSearch('') }}
                  className={`px-4 py-2.5 text-sm cursor-pointer transition-colors flex items-center justify-between ${
                    value === o.value ? 'bg-stone-800 text-white' : 'hover:bg-stone-50 text-stone-700'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{o.label}</div>
                    {o.desc && <div className={`text-[10px] truncate ${value === o.value ? 'text-stone-300' : 'text-stone-400'}`}>{o.desc}</div>}
                  </div>
                  {value === o.value && <CheckCircle size={14} className="text-white ml-2" />}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ModelSelect({ value, options, onChange }: {
  value: string
  options: { value: string; label: string; desc?: string }[]
  onChange: (v: string) => void
}) {
  return <SearchableSelect value={value} options={options} onChange={onChange} />
}

function NumberInput({ value, min, max, onChange }: {
  value: number; min: number; max: number; onChange: (v: number) => void
}) {
  return (
    <input
      type="number" min={min} max={max} value={value}
      onChange={e => onChange(Math.max(min, Math.min(max, Number(e.target.value))))}
      className="w-20 border border-stone-300 rounded-xl px-2.5 py-1.5 text-sm text-center outline-none focus:ring-2 focus:ring-stone-400 focus:border-stone-400"
    />
  )
}

const SPLITTER_TYPES: { value: SplitterType; label: string }[] = [
  { value: 'recursive',   label: 'Recursive'   },
  { value: 'sentence',    label: 'Sentence'    },
  { value: 'token',       label: 'Token'       },
  { value: 'manual_step', label: 'Manual Step' },
]

function DocTypeSplitterCard({
  label, badge, value, onChange,
}: {
  label: string
  badge: string
  value: { splitter_type: SplitterType; chunk_size: number; chunk_overlap_ratio: number; enable_cleaning: boolean }
  onChange: (v: typeof value) => void
}) {
  const set = <K extends keyof typeof value>(k: K, v: (typeof value)[K]) =>
    onChange({ ...value, [k]: v })

  return (
    <div className="border border-stone-200 rounded-xl p-4 space-y-3">
      <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${badge}`}>{label}</span>

      <div>
        <p className="text-xs text-stone-500 mb-1.5">切分策略</p>
        <div className="flex flex-wrap gap-1.5">
          {SPLITTER_TYPES.map(t => (
            <button key={t.value}
              onClick={() => set('splitter_type', t.value)}
              className={`px-2 py-1 text-xs rounded-lg border transition-colors ${
                value.splitter_type === t.value
                  ? 'bg-stone-800 text-white border-stone-800'
                  : 'border-stone-300 text-stone-600 hover:bg-stone-50'
              }`}
            >{t.label}</button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs text-stone-500 mb-1">
          Chunk 大小 <span className="text-stone-400">{value.chunk_size} tokens</span>
        </p>
        <input type="range" min={64} max={1024} step={64}
          value={value.chunk_size}
          onChange={e => set('chunk_size', Number(e.target.value))}
          className="w-full"
        />
      </div>

      <div>
        <p className="text-xs text-stone-500 mb-1">
          Overlap 比例 <span className="text-stone-400">{value.chunk_overlap_ratio.toFixed(2)}</span>
        </p>
        <input type="range" min={0} max={0.5} step={0.05}
          value={value.chunk_overlap_ratio}
          onChange={e => set('chunk_overlap_ratio', Number(e.target.value))}
          className="w-full"
        />
      </div>

      <label className="flex items-center gap-2 text-xs text-stone-600 cursor-pointer">
        <input type="checkbox"
          checked={value.enable_cleaning}
          onChange={e => set('enable_cleaning', e.target.checked)}
          className="rounded"
        />
        启用 LLM 清洗
      </label>
    </div>
  )
}

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  return (
    <div className={`fixed bottom-6 right-6 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-white text-sm z-50 animate-apple-toast ${type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
      {type === 'success' ? <CheckCircle size={16} /> : null}
      <span>{message}</span>
      <button onClick={onClose}><X size={14} /></button>
    </div>
  )
}

// ── 主页面 ────────────────────────────────────────────────

type DocTypeSplitterForm = {
  splitter_type: SplitterType
  chunk_size: number
  chunk_overlap_ratio: number
  enable_cleaning: boolean
}

type FormState = {
  llm_base_url: string
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
  agent_recursion_limit: number
  agent_retry_count: number
  splitter_policy: DocTypeSplitterForm
  splitter_manual: DocTypeSplitterForm
  splitter_form:   DocTypeSplitterForm
}

const DEFAULT_FORM: FormState = {
  llm_base_url: '',
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
  agent_recursion_limit: 15,
  agent_retry_count: 3,
  splitter_policy: { splitter_type: 'recursive', chunk_size: 512, chunk_overlap_ratio: 0.1, enable_cleaning: true  },
  splitter_manual: { splitter_type: 'recursive', chunk_size: 256, chunk_overlap_ratio: 0.1, enable_cleaning: true  },
  splitter_form:   { splitter_type: 'recursive', chunk_size: 256, chunk_overlap_ratio: 0.0, enable_cleaning: false },
}

function configToForm(cfg: any): FormState {
  const gs = cfg.splitter?.chunk_size ?? 256
  const go = cfg.splitter?.chunk_overlap_ratio ?? 0.2
  return {
    llm_base_url: cfg.llm?.api_base_url ?? DEFAULT_FORM.llm_base_url,
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
    agent_recursion_limit: cfg.rag?.agent_recursion_limit ?? DEFAULT_FORM.agent_recursion_limit,
    agent_retry_count: cfg.rag?.agent_retry_count ?? DEFAULT_FORM.agent_retry_count,
    splitter_policy: {
      splitter_type: (cfg.splitter?.policy?.type ?? 'recursive') as SplitterType,
      chunk_size:          cfg.splitter?.policy?.chunk_size          ?? gs,
      chunk_overlap_ratio: cfg.splitter?.policy?.chunk_overlap_ratio ?? go,
      enable_cleaning:     cfg.splitter?.policy?.enable_cleaning     ?? true,
    },
    splitter_manual: {
      splitter_type: (cfg.splitter?.manual?.type ?? 'manual_step') as SplitterType,
      chunk_size:          cfg.splitter?.manual?.chunk_size          ?? gs,
      chunk_overlap_ratio: cfg.splitter?.manual?.chunk_overlap_ratio ?? go,
      enable_cleaning:     cfg.splitter?.manual?.enable_cleaning     ?? true,
    },
    splitter_form: {
      splitter_type: (cfg.splitter?.form?.type ?? 'recursive') as SplitterType,
      chunk_size:          cfg.splitter?.form?.chunk_size          ?? gs,
      chunk_overlap_ratio: cfg.splitter?.form?.chunk_overlap_ratio ?? 0.0,
      enable_cleaning:     cfg.splitter?.form?.enable_cleaning     ?? false,
    },
  }
}

export default function SettingsPage() {
  const qc = useQueryClient()
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiUrlInput, setApiUrlInput] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [isEditingKey, setIsEditingKey] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; models?: string[] } | null>(null)

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

  const { data: availableModels } = useQuery({
    queryKey: ['available-models'],
    queryFn: configApi.getModels,
    enabled: !!apiKeyInfo?.has_key,
  })

  useEffect(() => {
    if (cfg) setForm(configToForm(cfg))
  }, [cfg])

  useEffect(() => {
    if (apiKeyInfo) {
      setApiUrlInput(apiKeyInfo.api_base_url || '')
    }
  }, [apiKeyInfo])

  const saveMutation = useMutation({
    mutationFn: () => configApi.update({
      llm_base_url: form.llm_base_url,
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
      agent_recursion_limit: form.agent_recursion_limit,
      agent_retry_count: form.agent_retry_count,
      splitter: {
        strategy: 'recursive',
        policy: { splitter_type: form.splitter_policy.splitter_type, chunk_size: form.splitter_policy.chunk_size, chunk_overlap_ratio: form.splitter_policy.chunk_overlap_ratio, enable_cleaning: form.splitter_policy.enable_cleaning },
        manual: { splitter_type: form.splitter_manual.splitter_type, chunk_size: form.splitter_manual.chunk_size, chunk_overlap_ratio: form.splitter_manual.chunk_overlap_ratio, enable_cleaning: form.splitter_manual.enable_cleaning },
        form:   { splitter_type: form.splitter_form.splitter_type,   chunk_size: form.splitter_form.chunk_size,   chunk_overlap_ratio: form.splitter_form.chunk_overlap_ratio,   enable_cleaning: form.splitter_form.enable_cleaning   },
      },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['system-config'] })
      showToast('配置已保存', 'success')
    },
    onError: (e) => showToast(extractError(e), 'error'),
  })

  const apiKeyMutation = useMutation({
    mutationFn: () => configApi.updateApiKey(apiKeyInput, apiUrlInput),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api-key'] })
      setApiKeyInput('')
      setShowKey(false)
      setIsEditingKey(false)
      setTestResult(null)
      showToast('API 信息已更新', 'success')
      qc.invalidateQueries({ queryKey: ['available-models'] })
    },
    onError: (e) => showToast(extractError(e), 'error'),
  })

  const testMutation = useMutation({
    mutationFn: () => configApi.testApiKey(),
    onSuccess: (data) => {
      setTestResult(data)
      if (data.ok) qc.invalidateQueries({ queryKey: ['available-models'] })
    },
    onError: (e) => setTestResult({ ok: false, message: extractError(e) }),
  })

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(prev => ({ ...prev, [key]: value }))

  const combinedLlmModels = useMemo(() => {
    const coreModels = ['qwen-plus', 'qwen-turbo', 'qwen-max', 'deepseek-chat', 'deepseek-reasoner']
    const excludePatterns = ['image', 'speech', 'audio', 'vl', 'math', 'mt', 'v1', 'embedding', 'rerank']
    const all = [...new Set([...(availableModels || []), ...coreModels])]
    const filtered = all.filter(m => {
      if (coreModels.includes(m)) return true
      const lower = m.toLowerCase()
      return !excludePatterns.some(p => lower.includes(p))
    })
    return filtered.sort((a, b) => {
      const idxA = coreModels.indexOf(a)
      const idxB = coreModels.indexOf(b)
      if (idxA !== -1 && idxB !== -1) return idxA - idxB
      if (idxA !== -1) return -1
      if (idxB !== -1) return 1
      return a.localeCompare(b)
    }).map(m => ({ value: m, label: m }))
  }, [availableModels])

  const combinedEmbeddingModels = useMemo(() => {
    const coreModels = ['text-embedding-v3', 'text-embedding-v2']
    const all = [...new Set([...(availableModels || []), ...coreModels])]
    const filtered = all.filter(m => m.toLowerCase().includes('embedding'))
    return filtered.map(m => ({ 
      value: m, 
      label: m, 
      desc: m === 'text-embedding-v3' ? '推荐：1024维高精度' : undefined 
    }))
  }, [availableModels])

  const combinedRerankerModels = useMemo(() => {
    const coreModels = ['gte-rerank', 'gte-rerank-hybrid']
    const all = [...new Set([...(availableModels || []), ...coreModels])]
    const filtered = all.filter(m => m.toLowerCase().includes('rerank'))
    return filtered.map(m => ({ 
      value: m, 
      label: m, 
      desc: m === 'gte-rerank' ? '推荐：通用重排序' : undefined 
    }))
  }, [availableModels])

  if (isLoading) {
    return (
      <div className="p-6 flex items-center gap-2 text-stone-500 text-sm">
        <Loader2 size={16} className="animate-spin" />加载配置中...
      </div>
    )
  }

  const settle = (d: number): React.CSSProperties => ({
    animation: `appleSettleIn 0.75s cubic-bezier(0.25, 1, 0.5, 1) ${d}ms both`,
  })

  return (
    <div className="p-6 flex-1 overflow-y-auto glass-card rounded-2xl">
      <div className="flex items-center justify-between mb-6" style={settle(0)}>
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">系统配置</h1>
          <p className="mt-1 text-sm text-stone-500">管理模型、检索和 RAG 核心参数</p>
        </div>
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="flex items-center gap-2 px-5 py-2.5 bg-stone-800 text-white text-sm rounded-lg hover:bg-stone-900 disabled:opacity-60 transition-colors shadow-sm"
        >
          {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          保存配置
        </button>
      </div>

      <div className="space-y-4">
        <div style={settle(80)}>
          <Section icon={Key} title="API 平台配置">
            <div className="space-y-4">
              <Field label="API 平台地址" hint="符合 OpenAI 格式的 Base URL">
                <div className="max-w-sm">
                  <input
                    type="text"
                    value={apiUrlInput}
                    onChange={e => setApiUrlInput(e.target.value)}
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
                            type={showKey ? 'text' : 'password'}
                            value={apiKeyInfo.masked_key}
                            className="w-full border border-stone-200 bg-stone-50 rounded-lg px-3 py-2 text-sm pr-10 font-mono text-stone-700 cursor-default"
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
                          onClick={() => { setIsEditingKey(true); setShowKey(false) }}
                          className="px-4 py-2 text-sm border border-stone-300 rounded-lg hover:bg-stone-50 transition-colors"
                        >
                          修改
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="relative flex-1 max-w-sm">
                          <input
                            type={showKey ? 'text' : 'password'}
                            value={apiKeyInput}
                            onChange={e => setApiKeyInput(e.target.value)}
                            placeholder="请输入 API Key"
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
                        {isEditingKey && (
                          <button
                            onClick={() => { setIsEditingKey(false); setApiKeyInput(''); setShowKey(false) }}
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
                        {testMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                        {testMutation.isPending ? '正在拉取模型...' : '测试连接并获取模型列表'}
                      </button>
                    )}
                    {apiKeyInfo && !apiKeyInfo.has_key && <p className="text-xs text-amber-600">未配置 API 信息</p>}
                    {testResult && (
                      <span className={`text-xs flex items-center gap-1 ${testResult.ok ? 'text-emerald-600' : 'text-red-500'}`}>
                        {testResult.ok ? <CheckCircle size={12} /> : <XCircle size={12} />}
                        {testResult.message}
                      </span>
                    )}
                  </div>
                </div>
              </Field>
            </div>
          </Section>
        </div>

        <div style={settle(160)}>
          <Section icon={Cpu} title="模型配置">
            <div className="space-y-6">
              <Field label="推理型模型 (慢)" hint="用于逻辑路由、文档评估">
                <ModelSelect value={form.llm_model} options={combinedLlmModels} onChange={v => set('llm_model', v)} />
              </Field>
              <Field label="常规/极速模型 (快)" hint="用于最终回答生成">
                <ModelSelect value={form.llm_fast_model} options={combinedLlmModels} onChange={v => set('llm_fast_model', v)} />
              </Field>
              <Field label="向量模型" hint="修改后需重新入库">
                <ModelSelect
                  value={form.embedding_model}
                  options={combinedEmbeddingModels}
                  onChange={v => set('embedding_model', v)}
                />
              </Field>
              <Field label="重排序模型" hint="检索结果精排">
                <ModelSelect
                  value={form.reranker_model}
                  options={combinedRerankerModels}
                  onChange={v => set('reranker_model', v)}
                />
              </Field>
            </div>
          </Section>
        </div>

        <div style={settle(240)}>
          <Section icon={Search} title="检索参数">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <Field label="Vector Top-K"><NumberInput value={form.vector_top_k} min={1} max={50} onChange={v => set('vector_top_k', v)} /></Field>
                <Field label="BM25 Top-K"><NumberInput value={form.bm25_top_k} min={1} max={50} onChange={v => set('bm25_top_k', v)} /></Field>
                <Field label="Hybrid Top-K"><NumberInput value={form.hybrid_top_k} min={1} max={50} onChange={v => set('hybrid_top_k', v)} /></Field>
                <Field label="RRF K"><NumberInput value={form.rrf_k} min={1} max={200} onChange={v => set('rrf_k', v)} /></Field>
              </div>
              <div className="border-t border-stone-100 pt-4">
                <Field label="Reranker Top-N"><NumberInput value={form.reranker_top_n} min={1} max={20} onChange={v => set('reranker_top_n', v)} /></Field>
              </div>
            </div>
          </Section>
        </div>

        <div style={settle(320)}>
          <Section icon={Sparkles} title="智能体与 RAG 配置">
            <div className="space-y-6">
              <Field label="最大改写次数" hint="查询改写可提升召回，但增加延迟">
                <div className="flex gap-1.5">
                  {[0, 1, 2, 3, 4, 5].map(n => (
                    <button key={n} onClick={() => set('max_reformulations', n)}
                      className={`w-9 py-1.5 text-sm rounded-lg border transition-colors ${form.max_reformulations === n ? 'bg-stone-800 text-white border-stone-800' : 'border-stone-300 text-stone-700 hover:bg-stone-50'}`}
                    >{n}</button>
                  ))}
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-8 border-t border-stone-100 pt-6">
                <Field label="最大图流转步数" hint="防止 StateGraph 陷入无限循环">
                  <div className="flex items-center gap-3">
                    <NumberInput value={form.agent_recursion_limit} min={4} max={50} onChange={v => set('agent_recursion_limit', v)} />
                    <span className="text-xs text-stone-400 font-medium">步</span>
                  </div>
                </Field>
                <Field label="CRAG 重试上限" hint="资料不相关时允许重试检索的次数">
                  <div className="flex items-center gap-3">
                    <NumberInput value={form.agent_retry_count} min={1} max={5} onChange={v => set('agent_retry_count', v)} />
                    <span className="text-xs text-stone-400 font-medium">次</span>
                  </div>
                </Field>
              </div>
            </div>
          </Section>
        </div>

        <div style={settle(400)}>
          <Section icon={FileText} title="文档切分默认参数">
            <p className="text-xs text-stone-400 mb-4">以下为各类文档上传时的初始默认值，用户在上传时仍可临时覆盖。</p>
            <div className="grid grid-cols-3 gap-4">
              <DocTypeSplitterCard
                label="政策文件" badge="bg-blue-50 text-blue-700"
                value={form.splitter_policy}
                onChange={v => set('splitter_policy', v)}
              />
              <DocTypeSplitterCard
                label="操作手册" badge="bg-purple-50 text-purple-700"
                value={form.splitter_manual}
                onChange={v => set('splitter_manual', v)}
              />
              <DocTypeSplitterCard
                label="填报模板" badge="bg-amber-50 text-amber-700"
                value={form.splitter_form}
                onChange={v => set('splitter_form', v)}
              />
            </div>
          </Section>
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
