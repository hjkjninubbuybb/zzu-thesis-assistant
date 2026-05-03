import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Pencil, Trash2, X, Loader2, MessageSquareQuote,
  ToggleLeft, ToggleRight, AlertCircle, ChevronDown,
  Search, Hash, Sparkles, Upload, Download, FileText, CheckCircle2,
} from 'lucide-react'
import { knowledgeApi, faqApi, extractError } from '@/lib/api'
import type { FAQItem, FAQCreate, FAQUpdate, FAQImportResult } from '@/types/api'

// ── 分类颜色 ──────────────────────────────────────────────

const PALETTE = ['#E85D4A', '#F0C040', '#5EE67A', '#60A5FA', '#C084FC', '#FB923C', '#34D399', '#F472B6']

function getCategoryColor(category: string, allCategories: string[]): string {
  const idx = allCategories.indexOf(category)
  return idx >= 0 ? PALETTE[idx % PALETTE.length] : '#D1D5DB'
}

// ── Toast ──────────────────────────────────────────────────

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  return (
    <div className={`fixed bottom-6 right-6 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-white text-sm z-50 animate-apple-toast ${type === 'success' ? 'bg-slate-700' : 'bg-red-600'}`}>
      <span>{message}</span>
      <button onClick={onClose}><X size={14} /></button>
    </div>
  )
}

// ── FAQ 编辑对话框 ─────────────────────────────────────────

interface FaqDialogProps {
  title: string
  initial?: Partial<FAQCreate>
  loading: boolean
  onClose: () => void
  onSubmit: (data: FAQCreate) => void
}

function FaqDialog({ title, initial, loading, onClose, onSubmit }: FaqDialogProps) {
  const [question, setQuestion] = useState(initial?.question ?? '')
  const [answer, setAnswer]     = useState(initial?.answer ?? '')
  const [category, setCategory] = useState(initial?.category ?? '')
  const [sortOrder, setSortOrder] = useState(initial?.sort_order ?? 0)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const handleSubmit = () => {
    const e: Record<string, string> = {}
    if (!question.trim()) e.question = '问题不能为空'
    if (!answer.trim())   e.answer   = '答案不能为空'
    if (Object.keys(e).length) { setErrors(e); return }
    onSubmit({ question: question.trim(), answer: answer.trim(), category: category.trim(), sort_order: sortOrder })
  }

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-[2px] flex items-center justify-center z-50 animate-apple-fade">
      <div className="glass-card rounded-2xl p-6 w-full max-w-sm mx-4 animate-apple-pop">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#F0EDE8]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#F2EFE9] flex items-center justify-center">
              <MessageSquareQuote size={14} className="text-[#334155]" />
            </div>
            <h3 className="text-sm font-semibold text-[#334155]">{title}</h3>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-[#F8F6F2] flex items-center justify-center transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* 问题 */}
          <div>
            <label className="block text-xs font-semibold text-[#334155] uppercase tracking-wide mb-2">
              问题 <span className="text-red-400 normal-case">*</span>
            </label>
            <textarea
              value={question}
              onChange={e => { setQuestion(e.target.value); setErrors(v => ({ ...v, question: '' })) }}
              rows={2}
              placeholder="输入学生可能会问的问题..."
              className={`w-full border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-slate-400 resize-none transition-colors placeholder:text-gray-300 ${errors.question ? 'border-red-400 bg-red-50' : 'border-[#E8E4DC] bg-white'}`}
            />
            {errors.question && <p className="mt-1 text-xs text-red-500">{errors.question}</p>}
          </div>

          {/* 答案 */}
          <div>
            <label className="block text-xs font-semibold text-[#334155] uppercase tracking-wide mb-2">
              标准答案 <span className="text-red-400 normal-case">*</span>
            </label>
            <textarea
              value={answer}
              onChange={e => { setAnswer(e.target.value); setErrors(v => ({ ...v, answer: '' })) }}
              rows={6}
              placeholder="输入官方标准答案，将被向量化用于 RAG 检索..."
              className={`w-full border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-slate-400 resize-none transition-colors placeholder:text-gray-300 ${errors.answer ? 'border-red-400 bg-red-50' : 'border-[#E8E4DC] bg-white'}`}
            />
            {errors.answer && <p className="mt-1 text-xs text-red-500">{errors.answer}</p>}
          </div>

          {/* 分类 + 排序 */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-[#334155] uppercase tracking-wide mb-2">分类</label>
              <div className="relative">
                <Hash size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  placeholder="如：入学手续、毕业答辩..."
                  className="w-full border border-[#E8E4DC] rounded-xl pl-8 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>
            </div>
            <div className="w-24">
              <label className="block text-xs font-semibold text-[#334155] uppercase tracking-wide mb-2">排序</label>
              <input
                type="number" min={0} value={sortOrder}
                onChange={e => setSortOrder(Number(e.target.value))}
                className="w-full border border-[#E8E4DC] rounded-xl px-3 py-2.5 text-sm text-center outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2.5 px-6 py-4 border-t border-[#F0EDE8] bg-[#FAFAF9] rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-xl border border-[#E8E4DC] hover:bg-[#F8F6F2] transition-colors text-[#334155]">
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-5 py-2 text-sm rounded-xl bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50 flex items-center gap-2 transition-colors"
          >
            {loading && <Loader2 size={13} className="animate-spin" />}
            {loading ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 删除确认 ───────────────────────────────────────────────

function ConfirmDeleteDialog({ question, onConfirm, onCancel, loading }: {
  question: string; onConfirm: () => void; onCancel: () => void; loading: boolean
}) {
  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-[2px] flex items-center justify-center z-50 animate-apple-fade">
      <div className="glass-card rounded-2xl p-6 w-full max-w-sm mx-4 animate-apple-pop">
        <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center mb-4">
          <Trash2 size={18} className="text-red-500" />
        </div>
        <h3 className="text-base font-semibold text-[#334155] mb-1">删除 FAQ</h3>
        <p className="text-sm leading-relaxed" style={{ color: '#8A8A8A' }}>
          将删除 <span className="font-medium text-[#334155]">"{question.length > 30 ? question.slice(0, 30) + '…' : question}"</span>，并从向量库中移除对应向量。此操作不可撤销。
        </p>
        <div className="mt-5 flex gap-2.5 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm rounded-xl border border-[#E8E4DC] hover:bg-[#F8F6F2] transition-colors">
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 text-sm rounded-xl bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 flex items-center gap-2 transition-colors"
          >
            {loading && <Loader2 size={13} className="animate-spin" />}
            确认删除
          </button>
        </div>
      </div>
    </div>
  )
}

// ── FAQ 卡片 ───────────────────────────────────────────────

function FaqCard({ faq, index, categoryColor, onEdit, onDelete, onToggle }: {
  faq: FAQItem
  index: number
  categoryColor: string
  onEdit: (faq: FAQItem) => void
  onDelete: (faq: FAQItem) => void
  onToggle: (faq: FAQItem) => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className={`group relative glass-card rounded-2xl transition-all duration-200 overflow-hidden ${
        faq.enabled
          ? ''
          : 'opacity-50'
      }`}
      style={{ animation: `appleSettleIn 0.7s cubic-bezier(0.25, 1, 0.5, 1) ${Math.min(120 + index * 55, 600)}ms both` }}
    >
      {/* 分类色条 */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl transition-all"
        style={{ backgroundColor: faq.category ? categoryColor : 'transparent' }}
      />

      <div className="flex items-start gap-4 px-5 py-4 pl-6">
        {/* 序号 */}
        <span className="shrink-0 w-6 h-6 rounded-md bg-[#F2EFE9] text-xs font-semibold text-[#8A8A8A] flex items-center justify-center mt-0.5">
          {index + 1}
        </span>

        {/* 内容区 */}
        <div className="flex-1 min-w-0">
          {/* 问题行 */}
          <div className="flex items-start justify-between gap-3">
            <button
              onClick={() => setExpanded(v => !v)}
              className="flex-1 text-left group/q"
            >
              <p className="text-sm font-semibold text-[#334155] leading-snug group-hover/q:text-[#333] transition-colors">
                {faq.question}
              </p>
            </button>

            {/* 操作栏（hover 时显示） */}
            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => onToggle(faq)}
                title={faq.enabled ? '禁用（从向量库移除）' : '启用（重新写入向量库）'}
                className="p-1.5 rounded-lg hover:bg-[#F2EFE9] transition-colors"
              >
                {faq.enabled
                  ? <ToggleRight size={17} className="text-emerald-500" />
                  : <ToggleLeft size={17} className="text-gray-400" />
                }
              </button>
              <button
                onClick={() => onEdit(faq)}
                title="编辑"
                className="p-1.5 rounded-lg text-gray-400 hover:text-[#334155] hover:bg-[#F2EFE9] transition-colors"
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={() => onDelete(faq)}
                title="删除"
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>

          {/* 答案预览 */}
          {!expanded && (
            <button
              onClick={() => setExpanded(true)}
              className="mt-1.5 text-left w-full"
            >
              <p className="text-xs truncate" style={{ color: '#A0A0A0' }}>{faq.answer}</p>
            </button>
          )}
          {/* 展开的答案 — 平滑手风琴 */}
          <div className={`accordion-body ${expanded ? 'open' : ''}`}>
            <div>
              <div className="mt-3 bg-[#F8F6F2] rounded-xl p-4 border border-[#F0EDE8]">
                <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: '#5A5A5A' }}>
                  {faq.answer}
                </p>
              </div>
            </div>
          </div>

          {/* 底部元信息 */}
          <div className="flex items-center gap-3 mt-2.5">
            {faq.category && (
              <span
                className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: `${categoryColor}18`, color: categoryColor }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: categoryColor }} />
                {faq.category}
              </span>
            )}
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
              faq.enabled
                ? 'bg-emerald-50 text-emerald-600'
                : 'bg-gray-100 text-gray-500'
            }`}>
              {faq.enabled ? '已启用' : '已禁用'}
            </span>
          </div>
        </div>

        {/* 展开箭头 */}
        <button
          onClick={() => setExpanded(v => !v)}
          className="shrink-0 p-1.5 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-[#F2EFE9] transition-colors mt-0.5"
        >
          <ChevronDown
            size={14}
            className="transition-transform duration-300"
            style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)' }}
          />
        </button>
      </div>
    </div>
  )
}

// ── Excel 导入对话框 ───────────────────────────────────────

interface ImportDialogProps {
  kbName: string
  onClose: () => void
  onImported: () => void
  showToast: (msg: string, type?: 'success' | 'error') => void
}

function ImportDialog({ kbName, onClose, onImported, showToast }: ImportDialogProps) {
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'result'>('idle')
  const [result, setResult] = useState<FAQImportResult | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      showToast('请上传 .xlsx 格式的 Excel 文件', 'error')
      return
    }
    setPhase('uploading')
    try {
      const r = await faqApi.importExcel(kbName, file)
      setResult(r)
      setPhase('result')
      if (r.success > 0) onImported()
    } catch (e) {
      setPhase('idle')
      showToast(extractError(e), 'error')
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-40 p-4 animate-apple-fade">
      <div className="glass-card rounded-2xl w-full max-w-md animate-apple-pop">
        {/* 标题 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#F0EDE8]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#F2EFE9] flex items-center justify-center">
              <Upload size={14} className="text-[#334155]" />
            </div>
            <h3 className="text-sm font-semibold text-[#334155]">从 Excel 导入 FAQ</h3>
          </div>
          {phase !== 'uploading' && (
            <button onClick={onClose} className="w-7 h-7 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-[#F8F6F2] flex items-center justify-center transition-colors">
              <X size={15} />
            </button>
          )}
        </div>

        <div className="px-6 py-5">
          {/* phase: idle — 选择文件 */}
          {phase === 'idle' && (
            <>
              <div
                onDrop={handleDrop}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-3 transition-colors ${
                  dragOver ? 'border-slate-400 bg-[#F2EFE9]' : 'border-[#E8E4DC] hover:border-[#C8C4BC] hover:bg-[#FAFAF9]'
                }`}
              >
                <div className="w-12 h-12 rounded-xl bg-[#F2EFE9] flex items-center justify-center">
                  <FileText size={22} className="text-[#334155]" strokeWidth={1.4} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-[#334155]">点击选择或拖拽文件到此处</p>
                  <p className="text-xs mt-1" style={{ color: '#A0A0A0' }}>仅支持 .xlsx 格式，文件大小不超过 5MB</p>
                </div>
              </div>
              <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleFileChange} />

              <div className="mt-4 flex items-center justify-center gap-1 text-xs" style={{ color: '#8A8A8A' }}>
                <span>没有模板？</span>
                <button
                  onClick={() => faqApi.downloadTemplate(kbName)}
                  className="text-[#334155] font-medium underline underline-offset-2 hover:opacity-70 transition-opacity"
                >
                  下载填写模板
                </button>
              </div>
            </>
          )}

          {/* phase: uploading */}
          {phase === 'uploading' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 size={32} className="animate-spin text-[#334155]" />
              <div className="text-center">
                <p className="text-sm font-semibold text-[#334155]">正在上传并向量化…</p>
                <p className="text-xs mt-1" style={{ color: '#A0A0A0' }}>批量向量化可能需要一些时间，请耐心等待</p>
              </div>
            </div>
          )}

          {/* phase: result */}
          {phase === 'result' && result && (
            <div className="space-y-4">
              {/* 统计条 */}
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { label: '总行数', value: result.total, color: '#334155' },
                  { label: '成功', value: result.success, color: '#10B981' },
                  { label: '跳过', value: result.skipped, color: '#F59E0B' },
                  { label: '失败', value: result.failed, color: '#EF4444' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-[#F8F6F2] rounded-xl py-3 px-2">
                    <p className="text-lg font-bold" style={{ color }}>{value}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: '#8A8A8A' }}>{label}</p>
                  </div>
                ))}
              </div>

              {/* 成功提示 */}
              {result.success > 0 && result.failed === 0 && result.skipped === result.total - result.success && (
                <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 rounded-xl px-4 py-3">
                  <CheckCircle2 size={16} />
                  {result.success === result.total
                    ? `全部 ${result.success} 条 FAQ 导入成功`
                    : `${result.success} 条导入成功`
                  }
                </div>
              )}

              {/* 错误明细 */}
              {result.errors.length > 0 && (
                <div className="max-h-48 overflow-y-auto space-y-1.5">
                  <p className="text-xs font-semibold text-[#334155] uppercase tracking-wide mb-2">错误明细</p>
                  {result.errors.map((err, i) => (
                    <div key={i} className="flex items-start gap-2.5 bg-red-50 rounded-lg px-3 py-2.5 text-xs">
                      {err.row > 0 && (
                        <span className="shrink-0 font-mono text-red-400">第{err.row}行</span>
                      )}
                      <span className="text-red-600 flex-1 leading-relaxed">
                        {err.question && <span className="font-medium text-red-700">"{err.question}" — </span>}
                        {err.reason}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        {phase === 'result' && (
          <div className="flex justify-end px-6 py-4 border-t border-[#F0EDE8] bg-[#FAFAF9] rounded-b-2xl">
            <button
              onClick={onClose}
              className="px-5 py-2 text-sm rounded-xl bg-slate-700 text-white hover:bg-slate-800 transition-colors"
            >
              完成
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── 统计 pill ──────────────────────────────────────────────

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F2EFE9] rounded-full">
      <span className="text-sm font-bold text-[#334155]">{value}</span>
      <span className="text-xs" style={{ color: '#8A8A8A' }}>{label}</span>
    </div>
  )
}

// ── 主页面 ─────────────────────────────────────────────────

export default function FaqPage() {
  const [selectedKb, setSelectedKb] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('全部')
  const [searchText, setSearchText] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<FAQItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<FAQItem | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const qc = useQueryClient()

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // 搜索词防抖（500ms）
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText.trim()), 500)
    return () => clearTimeout(timer)
  }, [searchText])

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  const { data: kbs } = useQuery({ queryKey: ['knowledge-bases'], queryFn: knowledgeApi.list })

  const { data: faqs = [], isLoading, error } = useQuery({
    queryKey: ['faqs', selectedKb],
    queryFn: () => faqApi.list(selectedKb),
    enabled: !!selectedKb,
  })

  // AI 语义搜索（debounced，仅在有搜索词时触发）
  const {
    data: searchData,
    isFetching: isSearching,
  } = useQuery({
    queryKey: ['faqs-search', selectedKb, debouncedSearch],
    queryFn: () => faqApi.search(selectedKb, debouncedSearch),
    enabled: !!selectedKb && debouncedSearch.length > 0,
    staleTime: 30_000,
  })

  const isAiSearch = debouncedSearch.length > 0
  const rewrittenQuery = searchData?.rewritten_query ?? ''

  const invalidate = () => qc.invalidateQueries({ queryKey: ['faqs', selectedKb] })

  const createMutation = useMutation({
    mutationFn: (body: FAQCreate) => faqApi.create(selectedKb, body),
    onSuccess: () => { invalidate(); setCreateOpen(false); showToast('FAQ 已创建并正在向量化') },
    onError: (e) => showToast(extractError(e), 'error'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: FAQUpdate }) => faqApi.update(selectedKb, id, body),
    onSuccess: () => { invalidate(); setEditTarget(null); showToast('FAQ 已更新') },
    onError: (e) => showToast(extractError(e), 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => faqApi.delete(selectedKb, id),
    onSuccess: () => { invalidate(); setDeleteTarget(null); showToast('FAQ 已删除') },
    onError: (e) => showToast(extractError(e), 'error'),
  })

  // 所有分类（去重，保持顺序）
  const allCategories = useMemo(
    () => Array.from(new Set(faqs.map(f => f.category).filter(Boolean))),
    [faqs]
  )

  // 展示的列表：AI 搜索结果 or 本地分类筛选
  const displayFaqs = useMemo(() => {
    if (isAiSearch) return searchData?.items ?? []
    if (categoryFilter !== '全部') return faqs.filter(f => f.category === categoryFilter)
    return faqs
  }, [isAiSearch, searchData, faqs, categoryFilter])

  const enabledCount = faqs.filter(f => f.enabled).length

  const settle = (d: number): React.CSSProperties => ({
    animation: `appleSettleIn 0.75s cubic-bezier(0.25, 1, 0.5, 1) ${d}ms both`,
  })

  return (
    <div className="px-8 py-8 flex-1 overflow-y-auto glass-card rounded-2xl">

      {/* ── 标题栏 ── */}
      <div className="flex items-start justify-between mb-6" style={settle(0)}>
        <div>
          <h1 className="text-2xl font-bold text-[#334155]">FAQ 管理</h1>
          <p className="mt-1 text-sm" style={{ color: '#8A8A8A' }}>
            预设标准问答对，自动向量化参与 RAG 检索，提升回答准确率
          </p>
        </div>

        {selectedKb && (
          <div className="flex items-center gap-2 shrink-0">
            {/* 导入/导出下拉菜单 */}
            <div ref={menuRef} className="relative">
              <button
                onClick={() => setMenuOpen(v => !v)}
                className="flex items-center gap-2 px-3.5 py-2.5 border border-[#E8E4DC] text-[#334155] text-sm rounded-xl hover:bg-[#F8F6F2] transition-colors"
              >
                <Download size={14} />
                导入/导出
                <ChevronDown size={12} className={`transition-transform duration-150 ${menuOpen ? 'rotate-180' : ''}`} />
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 top-full mt-1 bg-white border border-[#F0EDE8] rounded-xl shadow-lg z-30 overflow-hidden w-44 py-1"
                  style={{ animation: 'applePopIn 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275) both', transformOrigin: 'top right' }}
                >
                  <button
                    onClick={() => { faqApi.downloadTemplate(selectedKb); setMenuOpen(false) }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#334155] hover:bg-[#F8F6F2] transition-colors text-left"
                  >
                    <FileText size={14} className="text-[#8A8A8A]" />下载模板
                  </button>
                  <button
                    onClick={() => { faqApi.exportExcel(selectedKb); setMenuOpen(false) }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#334155] hover:bg-[#F8F6F2] transition-colors text-left"
                  >
                    <Download size={14} className="text-[#8A8A8A]" />导出 Excel
                  </button>
                  <div className="my-1 border-t border-[#F0EDE8]" />
                  <button
                    onClick={() => { setImportOpen(true); setMenuOpen(false) }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#334155] hover:bg-[#F8F6F2] transition-colors text-left"
                  >
                    <Upload size={14} className="text-[#8A8A8A]" />从 Excel 导入
                  </button>
                </div>
              )}
            </div>
            {/* 新增 FAQ */}
            <button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 text-white text-sm rounded-xl hover:bg-slate-800 transition-colors"
            >
              <Plus size={15} />新增 FAQ
            </button>
          </div>
        )}
      </div>

      {/* ── 工具栏 ── */}
      <div className="flex items-center gap-3 mb-5 flex-wrap" style={settle(80)}>
        {/* 知识库选择 */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-medium" style={{ color: '#8A8A8A' }}>知识库</span>
          <select
            value={selectedKb}
            onChange={e => { setSelectedKb(e.target.value); setCategoryFilter('全部'); setSearchText('') }}
            className="border border-[#E8E4DC] rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400 bg-white min-w-[140px]"
          >
            <option value="">— 请选择 —</option>
            {kbs?.map(kb => <option key={kb.id} value={kb.name}>{kb.name}</option>)}
          </select>
        </div>

        {selectedKb && (
          <>
            {/* 搜索框（AI 语义搜索） */}
            <div className="relative flex-1 max-w-sm">
              {isSearching
                ? <Loader2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A8A8A] animate-spin" />
                : <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              }
              <input
                value={searchText}
                onChange={e => { setSearchText(e.target.value); setCategoryFilter('全部') }}
                placeholder="AI 语义搜索 FAQ..."
                className="w-full border border-[#E8E4DC] rounded-xl pl-9 pr-20 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400 bg-white transition-colors"
              />
              {/* AI 标识 */}
              <div className={`absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all ${
                isAiSearch
                  ? 'bg-violet-100 text-violet-600'
                  : 'bg-[#F2EFE9] text-[#8A8A8A]'
              }`}>
                <Sparkles size={10} />
                AI
              </div>
            </div>

            {/* 统计 pills */}
            <div className="flex items-center gap-2 ml-auto">
              <StatPill label="条 FAQ" value={faqs.length} />
              <StatPill label="已启用" value={enabledCount} />
              {allCategories.length > 0 && <StatPill label="个分类" value={allCategories.length} />}
            </div>
          </>
        )}
      </div>

      {/* ── AI 改写词提示 ── */}
      {isAiSearch && !isSearching && rewrittenQuery && rewrittenQuery !== searchText.trim() && (
        <div className="flex items-center gap-1.5 mb-4 text-xs" style={{ color: '#8A8A8A' }}>
          <Sparkles size={11} className="text-violet-400 shrink-0" />
          已改写为：<span className="text-violet-600 font-medium">"{rewrittenQuery}"</span>
        </div>
      )}

      {/* ── 分类筛选 Tabs（AI 搜索时隐藏） ── */}
      {selectedKb && allCategories.length > 0 && !isAiSearch && (
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          {['全部', ...allCategories].map(cat => {
            const color = cat === '全部' ? '#334155' : getCategoryColor(cat, allCategories)
            const active = categoryFilter === cat
            return (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${
                  active
                    ? 'border-transparent text-white shadow-sm'
                    : 'bg-white border-[#E8E4DC] hover:bg-[#F8F6F2] text-gray-600'
                }`}
                style={active ? { backgroundColor: color } : {}}
              >
                {cat !== '全部' && (
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: active ? 'rgba(255,255,255,0.8)' : color }} />
                )}
                {cat}
              </button>
            )
          })}
        </div>
      )}

      {/* ── 状态：未选知识库 ── */}
      {!selectedKb && (
        <div className="flex flex-col items-center justify-center py-32 gap-4">
          <div className="w-16 h-16 rounded-2xl bg-[#F2EFE9] flex items-center justify-center">
            <MessageSquareQuote size={28} className="text-[#334155]" strokeWidth={1.4} />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-semibold text-[#334155]">选择一个知识库开始管理 FAQ</p>
            <p className="text-xs" style={{ color: '#A0A0A0' }}>FAQ 将自动向量化，在对话时作为高质量检索源</p>
          </div>
        </div>
      )}

      {/* ── 加载中 ── */}
      {selectedKb && isLoading && (
        <div className="flex items-center gap-2 text-sm py-24 justify-center" style={{ color: '#8A8A8A' }}>
          <Loader2 size={16} className="animate-spin" />加载中...
        </div>
      )}

      {/* ── 错误 ── */}
      {selectedKb && error && (
        <div className="flex items-center gap-2 text-sm text-red-500 py-4">
          <AlertCircle size={16} />加载失败，请检查后端服务
        </div>
      )}

      {/* ── 空状态 ── */}
      {selectedKb && !isLoading && !error && !isSearching && displayFaqs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#F2EFE9] flex items-center justify-center">
            <MessageSquareQuote size={24} className="text-[#334155]" strokeWidth={1.4} />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-semibold text-[#334155]">
              {isAiSearch
                ? `未找到与"${rewrittenQuery || searchText}"相关的 FAQ`
                : categoryFilter !== '全部'
                  ? `「${categoryFilter}」分类下暂无 FAQ`
                  : '还没有 FAQ'
              }
            </p>
            <p className="text-xs" style={{ color: '#A0A0A0' }}>
              {isAiSearch || categoryFilter !== '全部'
                ? '尝试换个关键词或清空搜索'
                : '点击右上角「新增 FAQ」添加第一条标准问答'
              }
            </p>
          </div>
          {!isAiSearch && categoryFilter === '全部' && (
            <button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white text-sm rounded-xl hover:bg-slate-800 transition-colors"
            >
              <Plus size={14} />新增第一条 FAQ
            </button>
          )}
        </div>
      )}

      {/* ── FAQ 列表 ── */}
      {selectedKb && !isLoading && !error && displayFaqs.length > 0 && (
        <div className="space-y-2">
          {displayFaqs.map((faq, i) => (
            <FaqCard
              key={faq.id}
              faq={faq}
              index={i}
              categoryColor={faq.category ? getCategoryColor(faq.category, allCategories) : '#D1D5DB'}
              onEdit={setEditTarget}
              onDelete={setDeleteTarget}
              onToggle={f => updateMutation.mutate({ id: f.id, body: { enabled: !f.enabled } })}
            />
          ))}
        </div>
      )}

      {/* ── 对话框 ── */}
      {createOpen && (
        <FaqDialog
          title="新增 FAQ"
          loading={createMutation.isPending}
          onClose={() => setCreateOpen(false)}
          onSubmit={data => createMutation.mutate(data)}
        />
      )}
      {editTarget && (
        <FaqDialog
          title="编辑 FAQ"
          initial={editTarget}
          loading={updateMutation.isPending}
          onClose={() => setEditTarget(null)}
          onSubmit={data => updateMutation.mutate({ id: editTarget.id, body: data })}
        />
      )}
      {deleteTarget && (
        <ConfirmDeleteDialog
          question={deleteTarget.question}
          loading={deleteMutation.isPending}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        />
      )}
      {importOpen && (
        <ImportDialog
          kbName={selectedKb}
          onClose={() => setImportOpen(false)}
          onImported={invalidate}
          showToast={showToast}
        />
      )}
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
