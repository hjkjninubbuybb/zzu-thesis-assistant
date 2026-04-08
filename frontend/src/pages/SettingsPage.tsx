import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, RotateCcw, Loader2, X, CheckCircle } from 'lucide-react'
import { configApi, extractError } from '@/lib/api'
import type { SplitterType, SplitterConfigUpdate } from '@/types/api'

// ── 消融实验最优参数 ──────────────────────────────────────

type SplitterPreset = {
  label: string
  ndcg?: number
  params: Omit<SplitterConfigUpdate, 'strategy'>
  description: string
}

const SPLITTER_PRESETS: Record<SplitterType, SplitterPreset> = {
  recursive: {
    label: 'Recursive（递归）',
    ndcg: 0.8500,
    description: '按中文标点和 Markdown 结构递归分割，精度最高',
    params: { chunk_size: 256, chunk_overlap_ratio: 0.10 },
  },
  sentence: {
    label: 'Sentence（句子）',
    ndcg: 0.8098,
    description: '按句子边界分割，适合叙述性文本',
    params: { chunk_size: 256, chunk_overlap_ratio: 0.10 },
  },
  token: {
    label: 'Token（固定 Token）',
    ndcg: 0.8053,
    description: '固定 Token 数分割，适合长文档',
    params: { chunk_size: 1024, chunk_overlap_ratio: 0.20 },
  },
  semantic: {
    label: 'Semantic（语义）',
    ndcg: 0.8389,
    description: '按语义相似度自适应分割，NDCG 综合最优',
    params: { buffer_size: 2, breakpoint_percentile_threshold: 90 },
  },
  table_aware: {
    label: 'Table Aware（表格感知）',
    description: '表格块整体保留，非表格走 Recursive，适合 table_heavy 文档',
    params: { chunk_size: 512, chunk_overlap_ratio: 0.10 },
  },
}

const LLM_MODELS = ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen-long', 'deepseek-chat']
const EMBEDDING_MODELS = ['text-embedding-v3', 'text-embedding-v2']
const RERANKER_MODELS = ['gte-rerank', 'gte-rerank-v2', 'qwen3-rerank', 'BAAI/bge-reranker-v2-m3']

// ── 局部组件 ──────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <h2 className="text-sm font-semibold text-gray-800 mb-4">{title}</h2>
      {children}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-6">
      <div className="w-40 shrink-0 pt-2">
        <p className="text-sm font-medium text-gray-700">{label}</p>
        {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}

function Select({ value, options, onChange }: {
  value: string
  options: string[]
  onChange: (v: string) => void
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 w-full max-w-xs"
    >
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function SliderField({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-gray-600">{label}</span>
        <span className="text-sm font-mono text-gray-800 w-12 text-right">{value}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full"
      />
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
      className="w-20 border border-gray-300 rounded-md px-2 py-1.5 text-sm text-center outline-none focus:ring-2 focus:ring-blue-500"
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
  embedding_model: string
  splitter_strategy: SplitterType
  chunk_size: number
  chunk_overlap_ratio: number
  buffer_size: number
  breakpoint_percentile_threshold: number
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
  embedding_model: 'text-embedding-v3',
  splitter_strategy: 'recursive',
  chunk_size: 256,
  chunk_overlap_ratio: 0.10,
  buffer_size: 2,
  breakpoint_percentile_threshold: 90,
  vector_top_k: 10,
  bm25_top_k: 10,
  hybrid_top_k: 15,
  rrf_k: 60,
  reranker_model: 'gte-rerank',
  reranker_top_n: 5,
  max_reformulations: 2,
}

function configToForm(cfg: ReturnType<typeof configApi.get> extends Promise<infer T> ? T : never): FormState {
  const sp = cfg.splitter ?? {}
  return {
    llm_model: cfg.llm?.model ?? DEFAULT_FORM.llm_model,
    embedding_model: cfg.embedding?.model ?? DEFAULT_FORM.embedding_model,
    splitter_strategy: (sp.strategy ?? 'recursive') as SplitterType,
    chunk_size: sp.chunk_size ?? DEFAULT_FORM.chunk_size,
    chunk_overlap_ratio: sp.chunk_overlap_ratio ?? DEFAULT_FORM.chunk_overlap_ratio,
    buffer_size: sp.buffer_size ?? DEFAULT_FORM.buffer_size,
    breakpoint_percentile_threshold: sp.breakpoint_percentile_threshold ?? DEFAULT_FORM.breakpoint_percentile_threshold,
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

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const { data: cfg, isLoading } = useQuery({
    queryKey: ['system-config'],
    queryFn: configApi.get,
  })

  useEffect(() => {
    if (cfg) setForm(configToForm(cfg))
  }, [cfg])

  const saveMutation = useMutation({
    mutationFn: () => {
      const isChunkBased = ['recursive', 'token', 'sentence', 'table_aware'].includes(form.splitter_strategy)
      const splitter: SplitterConfigUpdate = isChunkBased
        ? { strategy: form.splitter_strategy, chunk_size: form.chunk_size, chunk_overlap_ratio: form.chunk_overlap_ratio }
        : { strategy: form.splitter_strategy, buffer_size: form.buffer_size, breakpoint_percentile_threshold: form.breakpoint_percentile_threshold }

      return configApi.update({
        llm_model: form.llm_model,
        embedding_model: form.embedding_model,
        splitter,
        vector_top_k: form.vector_top_k,
        bm25_top_k: form.bm25_top_k,
        hybrid_top_k: form.hybrid_top_k,
        rrf_k: form.rrf_k,
        reranker_model: form.reranker_model,
        reranker_top_n: form.reranker_top_n,
        max_reformulations: form.max_reformulations,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['system-config'] })
      showToast('配置已保存', 'success')
    },
    onError: (e) => showToast(extractError(e), 'error'),
  })

  const loadBestParams = () => {
    const preset = SPLITTER_PRESETS[form.splitter_strategy]
    setForm(prev => ({
      ...prev,
      chunk_size: preset.params.chunk_size ?? prev.chunk_size,
      chunk_overlap_ratio: preset.params.chunk_overlap_ratio ?? prev.chunk_overlap_ratio,
      buffer_size: preset.params.buffer_size ?? prev.buffer_size,
      breakpoint_percentile_threshold: preset.params.breakpoint_percentile_threshold ?? prev.breakpoint_percentile_threshold,
    }))
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm(prev => ({ ...prev, [key]: value }))

  const isSemantic = form.splitter_strategy === 'semantic'

  if (isLoading) {
    return (
      <div className="p-6 flex items-center gap-2 text-gray-500 text-sm">
        <Loader2 size={16} className="animate-spin" />加载配置中...
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">系统配置</h1>
          <p className="mt-1 text-sm text-gray-500">修改后点击「保存配置」立即生效</p>
        </div>
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-60"
        >
          {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          保存配置
        </button>
      </div>

      <div className="space-y-4">

        {/* LLM 模型 */}
        <Section title="LLM 模型">
          <Field label="对话模型" hint="用于生成最终答案">
            <Select value={form.llm_model} options={LLM_MODELS} onChange={v => set('llm_model', v)} />
          </Field>
        </Section>

        {/* Embedding */}
        <Section title="Embedding 模型">
          <Field label="向量模型" hint="修改后需重新入库所有文档">
            <Select value={form.embedding_model} options={EMBEDDING_MODELS} onChange={v => set('embedding_model', v)} />
          </Field>
        </Section>

        {/* 切分策略 */}
        <Section title="默认切分策略">
          <div className="space-y-5">
            {/* 策略选择器 */}
            <Field label="策略">
              <div className="flex flex-wrap gap-2">
                {(Object.entries(SPLITTER_PRESETS) as [SplitterType, SplitterPreset][]).map(([key, preset]) => (
                  <button
                    key={key}
                    onClick={() => set('splitter_strategy', key)}
                    className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${form.splitter_strategy === key ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                  >
                    {preset.label}
                    {preset.ndcg && (
                      <span className={`ml-1.5 opacity-80 ${form.splitter_strategy === key ? 'text-blue-100' : 'text-gray-400'}`}>
                        NDCG {preset.ndcg}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2">{SPLITTER_PRESETS[form.splitter_strategy].description}</p>
            </Field>

            {/* 参数区域 */}
            {isSemantic ? (
              <>
                <Field label="Buffer Size" hint="合并相邻句子数">
                  <div className="flex gap-2">
                    {[1, 2, 3].map(n => (
                      <button
                        key={n}
                        onClick={() => set('buffer_size', n)}
                        className={`w-10 py-1.5 text-sm rounded-md border ${form.buffer_size === n ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="断点阈值" hint="越高分块越少">
                  <div className="max-w-xs">
                    <SliderField
                      label={`${form.breakpoint_percentile_threshold}%`}
                      value={form.breakpoint_percentile_threshold}
                      min={80} max={99} step={1}
                      onChange={v => set('breakpoint_percentile_threshold', v)}
                    />
                  </div>
                </Field>
              </>
            ) : (
              <>
                <Field label="Chunk 大小" hint="tokens">
                  <div className="max-w-xs">
                    <SliderField
                      label=""
                      value={form.chunk_size}
                      min={64} max={1024} step={64}
                      onChange={v => set('chunk_size', v)}
                    />
                  </div>
                </Field>
                <Field label="Overlap 比例" hint="0.0 – 0.5">
                  <div className="max-w-xs">
                    <SliderField
                      label=""
                      value={form.chunk_overlap_ratio}
                      min={0} max={0.5} step={0.05}
                      onChange={v => set('chunk_overlap_ratio', v)}
                    />
                  </div>
                </Field>
              </>
            )}

            {/* 加载最优参数 */}
            <div className="pt-1">
              <button
                onClick={loadBestParams}
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800"
              >
                <RotateCcw size={12} />
                从消融实验最优加载（{form.splitter_strategy}）
              </button>
            </div>
          </div>
        </Section>

        {/* 检索参数 */}
        <Section title="检索参数">
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            <Field label="Vector Top-K" hint="向量检索召回数">
              <NumberInput value={form.vector_top_k} min={1} max={50} onChange={v => set('vector_top_k', v)} />
            </Field>
            <Field label="BM25 Top-K" hint="关键词检索召回数">
              <NumberInput value={form.bm25_top_k} min={1} max={50} onChange={v => set('bm25_top_k', v)} />
            </Field>
            <Field label="Hybrid Top-K" hint="混合融合后保留数">
              <NumberInput value={form.hybrid_top_k} min={1} max={50} onChange={v => set('hybrid_top_k', v)} />
            </Field>
            <Field label="RRF K" hint="RRF 平滑参数">
              <NumberInput value={form.rrf_k} min={1} max={200} onChange={v => set('rrf_k', v)} />
            </Field>
          </div>
        </Section>

        {/* Reranker */}
        <Section title="Reranker">
          <div className="space-y-4">
            <Field label="模型">
              <Select value={form.reranker_model} options={RERANKER_MODELS} onChange={v => set('reranker_model', v)} />
            </Field>
            <Field label="Top-N" hint="重排后保留数">
              <NumberInput value={form.reranker_top_n} min={1} max={20} onChange={v => set('reranker_top_n', v)} />
            </Field>
          </div>
        </Section>

        {/* RAG */}
        <Section title="RAG 参数">
          <Field label="最大改写次数" hint="查询改写可提升召回，但增加延迟">
            <div className="flex gap-1.5">
              {[0, 1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => set('max_reformulations', n)}
                  className={`w-9 py-1.5 text-sm rounded-md border ${form.max_reformulations === n ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
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
