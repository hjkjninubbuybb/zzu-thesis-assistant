import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Trash2, FileText, Loader2, AlertCircle, X, Database,
  Upload, ChevronDown, ChevronUp, CheckCircle, Clock, Users, BookOpen,
} from 'lucide-react'
import { knowledgeApi, documentApi, extractError } from '@/lib/api'
import type { KBInfo, DocType, SplitterType, UploadParams } from '@/types/api'

// ── Constants ─────────────────────────────────────────────

const KB_COLORS = ['#E85D4A', '#F0C040', '#5EE67A', '#60A5FA', '#C084FC', '#FB923C']

const DEFAULT_PARAMS: UploadParams = {
  splitter_type: 'recursive',
  chunk_size: 256,
  chunk_overlap_ratio: 0.2,
  enable_cleaning: true,
  doc_type: 'policy',
}

const DOC_TYPE_LABELS: Record<DocType, string> = {
  policy: '政策文件',
  manual: '操作手册',
  form:   '填报模板',
}

// ── Types ──────────────────────────────────────────────────

type FileStatus = 'pending' | 'uploading' | 'done' | 'error'

interface QueueItem {
  id: string
  file: File
  status: FileStatus
  progress: number
  chunks?: number
  error?: string
}

// ── Helpers ────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function StatusIcon({ status }: { status: FileStatus }) {
  if (status === 'pending')   return <Clock size={13} className="text-gray-400" />
  if (status === 'uploading') return <Loader2 size={13} className="animate-spin text-[#1A1A1A]" />
  if (status === 'done')      return <CheckCircle size={13} className="text-emerald-500" />
  return <AlertCircle size={13} className="text-red-500" />
}

// ── Toast ──────────────────────────────────────────────────

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  return (
    <div className={`fixed bottom-6 right-6 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-white text-sm z-50 ${type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
      <span>{message}</span>
      <button onClick={onClose}><X size={14} /></button>
    </div>
  )
}

// ── ConfirmDialog ──────────────────────────────────────────

function ConfirmDialog({ name, onConfirm, onCancel, loading }: {
  name: string; onConfirm: () => void; onCancel: () => void; loading: boolean
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
        <h3 className="text-base font-semibold text-gray-900">确认删除</h3>
        <p className="mt-2 text-sm text-gray-500">
          将删除知识库 <span className="font-medium text-gray-800">"{name}"</span> 及其所有文档，此操作不可撤销。
        </p>
        <div className="mt-4 flex gap-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm rounded-md border border-gray-300 hover:bg-gray-50">取消</button>
          <button onClick={onConfirm} disabled={loading} className="px-4 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 flex items-center gap-2">
            {loading && <Loader2 size={14} className="animate-spin" />}
            删除
          </button>
        </div>
      </div>
    </div>
  )
}

// ── CreateDialog ───────────────────────────────────────────

function CreateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [nameError, setNameError] = useState('')
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => knowledgeApi.create({ name: name.trim(), description: desc.trim() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['knowledge-bases'] }); onCreated() },
  })

  const namePattern = /^[a-zA-Z0-9_\-\u4e00-\u9fff]+$/
  const validate = () => {
    if (!name.trim()) { setNameError('名称不能为空'); return false }
    if (!namePattern.test(name.trim())) { setNameError('只支持字母、数字、下划线、中文'); return false }
    setNameError(''); return true
  }

  const handleSubmit = () => { if (!validate()) return; mutation.mutate() }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-40">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">新建知识库</h3>
          <button onClick={onClose}><X size={18} className="text-gray-400 hover:text-gray-600" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">名称 <span className="text-red-500">*</span></label>
            <input
              className={`w-full border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#1A1A1A] ${nameError ? 'border-red-400' : 'border-gray-300'}`}
              placeholder="字母/数字/下划线/中文"
              value={name}
              onChange={e => { setName(e.target.value); if (nameError) setNameError('') }}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              autoFocus
            />
            {nameError && <p className="text-xs text-red-500 mt-1">{nameError}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
            <input
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#1A1A1A]"
              placeholder="可选"
              value={desc}
              onChange={e => setDesc(e.target.value)}
            />
          </div>
          {mutation.error && <p className="text-xs text-red-500">{extractError(mutation.error)}</p>}
        </div>
        <div className="mt-5 flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-gray-300 hover:bg-gray-50">取消</button>
          <button onClick={handleSubmit} disabled={mutation.isPending} className="px-4 py-2 text-sm rounded-md bg-[#1A1A1A] text-white hover:bg-[#333] disabled:opacity-60 flex items-center gap-2">
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            创建
          </button>
        </div>
      </div>
    </div>
  )
}

// ── DocumentPanel ──────────────────────────────────────────

function DocumentPanel({ kbName, onToast }: {
  kbName: string
  onToast: (msg: string, type: 'success' | 'error') => void
}) {
  const qc = useQueryClient()
  const [dragOver, setDragOver] = useState(false)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [params, setParams] = useState<UploadParams>(DEFAULT_PARAMS)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: docs, isLoading: docsLoading } = useQuery({
    queryKey: ['documents', kbName],
    queryFn: () => documentApi.list(kbName),
  })

  const addFiles = useCallback((files: FileList | File[]) => {
    const items: QueueItem[] = Array.from(files).map(file => ({
      id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
      file, status: 'pending', progress: 0,
    }))
    setQueue(prev => [...prev, ...items])
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
  }, [addFiles])

  const deleteMutation = useMutation({
    mutationFn: (id: number) => documentApi.delete(kbName, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents', kbName] })
      qc.invalidateQueries({ queryKey: ['knowledge-bases'] })
      setDeleteId(null)
      onToast('文档已删除', 'success')
    },
    onError: (e) => onToast(extractError(e), 'error'),
  })

  const startUpload = async () => {
    const pending = queue.filter(item => item.status === 'pending')
    if (!pending.length) return
    setUploading(true)
    let successCount = 0, failCount = 0
    for (const item of pending) {
      setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'uploading', progress: 0 } : q))
      try {
        const doc = await documentApi.upload(
          kbName, item.file, params,
          (pct) => setQueue(prev => prev.map(q => q.id === item.id ? { ...q, progress: pct } : q)),
        )
        setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'done', progress: 100, chunks: doc.chunk_count } : q))
        successCount++
        qc.invalidateQueries({ queryKey: ['documents', kbName] })
        qc.invalidateQueries({ queryKey: ['knowledge-bases'] })
      } catch (e) {
        setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'error', error: extractError(e) } : q))
        failCount++
      }
    }
    setUploading(false)
    if (successCount > 0 && failCount === 0) onToast(`${successCount} 个文档入库成功`, 'success')
    else if (failCount > 0) onToast(`${successCount} 成功，${failCount} 失败`, 'error')
  }

  const pendingCount = queue.filter(q => q.status === 'pending').length
  const hasDone = queue.some(q => q.status === 'done')

  return (
    <div className="mx-0 mb-2 rounded-2xl border border-[#F0EDE8] bg-[#FDFCFA] overflow-hidden">
      {/* 上传区 */}
      <div className="p-5 border-b border-[#F0EDE8]">
        <p className="text-xs font-semibold text-[#1A1A1A] mb-3">上传文档</p>

        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${dragOver ? 'border-[#1A1A1A] bg-[#F2EFE9]' : 'border-[#E8E4DE] hover:border-[#C8C4BE]'}`}
        >
          <input ref={fileInputRef} type="file" accept=".pdf,.txt,.md,.docx,.doc" multiple className="hidden" onChange={e => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = '' }} />
          <Upload size={20} className="mx-auto mb-2" style={{ color: '#8A8A8A' }} />
          <p className="text-sm" style={{ color: '#8A8A8A' }}>拖拽文件到此处，或 <span className="text-[#1A1A1A] font-medium">点击选择</span></p>
          <p className="text-xs mt-1" style={{ color: '#AAAAAA' }}>支持 .pdf / .txt / .md / .docx / .doc，可多选</p>
        </div>

        {queue.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {queue.map(item => (
              <div key={item.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white border border-[#F0EDE8]">
                <StatusIcon status={item.status} />
                <FileText size={13} className="text-gray-400 shrink-0" />
                <span className="text-sm text-gray-800 truncate flex-1 min-w-0">{item.file.name}</span>
                <span className="text-xs shrink-0" style={{ color: '#8A8A8A' }}>{formatSize(item.file.size)}</span>
                {item.status === 'uploading' && (
                  <div className="w-20 bg-gray-200 rounded-full h-1 shrink-0">
                    <div className="bg-[#1A1A1A] h-1 rounded-full transition-all" style={{ width: `${item.progress}%` }} />
                  </div>
                )}
                {item.status === 'done' && item.chunks !== undefined && (
                  <span className="text-xs text-emerald-600 shrink-0">{item.chunks} chunks</span>
                )}
                {item.status === 'error' && (
                  <span className="text-xs text-red-500 shrink-0 max-w-32 truncate" title={item.error}>{item.error}</span>
                )}
                {item.status === 'pending' && (
                  <button onClick={() => setQueue(prev => prev.filter(q => q.id !== item.id))} className="text-gray-400 hover:text-gray-600 shrink-0">
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-4">
          <p className="text-xs font-medium text-gray-600 mb-2">文档类型</p>
          <div className="flex gap-2">
            {(Object.entries(DOC_TYPE_LABELS) as [DocType, string][]).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setParams(p => ({ ...p, doc_type: val }))}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${params.doc_type === val ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'border-[#E8E4DE] text-gray-700 hover:bg-[#F2EFE9]'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => setAdvancedOpen(o => !o)}
          className="mt-4 flex items-center gap-1 text-xs hover:text-gray-700 transition-colors"
          style={{ color: '#8A8A8A' }}
        >
          {advancedOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          高级参数
        </button>

        {advancedOpen && (
          <div className="mt-3 grid grid-cols-2 gap-4 pt-3 border-t border-[#F0EDE8]">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">切分策略</label>
              <select
                value={params.splitter_type}
                onChange={e => setParams(p => ({ ...p, splitter_type: e.target.value as SplitterType }))}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[#1A1A1A]"
              >
                <option value="recursive">Recursive（推荐）</option>
                <option value="token">Token</option>
                <option value="sentence">Sentence</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Chunk 大小 <span className="text-gray-400">{params.chunk_size}</span>
              </label>
              <input type="range" min={64} max={1024} step={64} value={params.chunk_size}
                onChange={e => setParams(p => ({ ...p, chunk_size: Number(e.target.value) }))}
                className="w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Overlap 比例 <span className="text-gray-400">{params.chunk_overlap_ratio.toFixed(2)}</span>
              </label>
              <input type="range" min={0} max={0.5} step={0.05} value={params.chunk_overlap_ratio}
                onChange={e => setParams(p => ({ ...p, chunk_overlap_ratio: Number(e.target.value) }))}
                className="w-full" />
            </div>
            <div className="flex items-center gap-2 mt-4">
              <input type="checkbox" id={`cleaning-${kbName}`} checked={params.enable_cleaning}
                onChange={e => setParams(p => ({ ...p, enable_cleaning: e.target.checked }))}
                className="rounded" />
              <label htmlFor={`cleaning-${kbName}`} className="text-sm text-gray-600 cursor-pointer">
                启用 LLM 清洗 <span className="text-xs text-gray-400">（较慢）</span>
              </label>
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={startUpload}
            disabled={pendingCount === 0 || uploading}
            className="flex items-center gap-2 px-4 py-2 bg-[#1A1A1A] text-white text-sm rounded-xl hover:bg-[#333] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {uploading ? '入库中...' : `上传入库${pendingCount > 0 ? ` (${pendingCount})` : ''}`}
          </button>
          {hasDone && !uploading && (
            <button onClick={() => setQueue(prev => prev.filter(q => q.status !== 'done'))}
              className="text-xs hover:text-gray-700 transition-colors" style={{ color: '#8A8A8A' }}>
              清除已完成
            </button>
          )}
        </div>
      </div>

      {/* 文档列表 */}
      <div className="p-5">
        <p className="text-xs font-semibold text-[#1A1A1A] mb-3">
          已入库文档{docs ? ` (${docs.length})` : ''}
        </p>

        {docsLoading && (
          <div className="flex items-center gap-2 text-xs py-6 justify-center" style={{ color: '#8A8A8A' }}>
            <Loader2 size={13} className="animate-spin" />加载中...
          </div>
        )}

        {docs && docs.length === 0 && (
          <p className="text-xs text-center py-6" style={{ color: '#AAAAAA' }}>暂无文档，请上传</p>
        )}

        {docs && docs.length > 0 && (
          <div className="space-y-1.5">
            {docs.map(doc => (
              <div key={doc.id} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[#F0EDE8] bg-white hover:bg-[#F8F6F2] transition-colors">
                <FileText size={14} className="text-gray-400 shrink-0" />
                <span className="text-sm text-[#1A1A1A] font-medium truncate flex-1 min-w-0">{doc.file_name}</span>
                <span className="text-xs shrink-0 px-2 py-0.5 rounded-full bg-[#F2EFE9] text-gray-600">
                  {DOC_TYPE_LABELS[doc.doc_type as DocType] ?? doc.doc_type}
                </span>
                <span className="text-xs shrink-0" style={{ color: '#8A8A8A' }}>{formatSize(doc.file_size)}</span>
                <span className="text-xs shrink-0" style={{ color: '#8A8A8A' }}>{doc.chunk_count} chunks</span>
                <span className="text-xs w-24 text-right shrink-0" style={{ color: '#8A8A8A' }}>{formatDate(doc.created_at)}</span>
                <div className="shrink-0">
                  {deleteId === doc.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: '#8A8A8A' }}>确认？</span>
                      <button
                        onClick={() => deleteMutation.mutate(doc.id)}
                        disabled={deleteMutation.isPending}
                        className="text-xs px-2 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 flex items-center gap-1"
                      >
                        {deleteMutation.isPending && <Loader2 size={10} className="animate-spin" />}确认
                      </button>
                      <button onClick={() => setDeleteId(null)} className="text-xs px-2 py-1 rounded-lg border border-gray-300 hover:bg-gray-50">取消</button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteId(doc.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── KnowledgeBasePage ──────────────────────────────────────

// ── 状态横幅 ──────────────────────────────────────────────

function StatusBanner({
  icon: Icon,
  kbName,
  label,
  subLabel,
  emptyLabel,
  emptySubLabel,
  accentColor,
  onClear,
  clearing,
}: {
  icon: React.ElementType
  kbName: string | null
  label: string
  subLabel: string
  emptyLabel: string
  emptySubLabel: string
  accentColor: string  // 'indigo' | 'emerald'
  onClear: () => void
  clearing: boolean
}) {
  const isIndigo = accentColor === 'indigo'
  return (
    <div className={`flex items-center gap-3 px-5 py-3.5 rounded-2xl ${
      kbName
        ? isIndigo ? 'bg-[#EEF2FF] border border-[#C7D2FE]' : 'bg-emerald-50 border border-emerald-200'
        : 'bg-amber-50 border border-amber-200'
    }`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
        kbName
          ? isIndigo ? 'bg-[#4F46E5]/10' : 'bg-emerald-100'
          : 'bg-amber-100'
      }`}>
        <Icon size={16} className={kbName ? (isIndigo ? 'text-[#4F46E5]' : 'text-emerald-600') : 'text-amber-600'} />
      </div>
      <div className="flex-1 min-w-0">
        {kbName ? (
          <>
            <p className={`text-sm font-medium ${isIndigo ? 'text-[#312E81]' : 'text-emerald-900'}`}>
              {label}：<span className="font-bold">{kbName}</span>
            </p>
            <p className={`text-xs mt-0.5 ${isIndigo ? 'text-[#4338CA]' : 'text-emerald-700'}`}>{subLabel}</p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-amber-800">{emptyLabel}</p>
            <p className="text-xs text-amber-700 mt-0.5">{emptySubLabel}</p>
          </>
        )}
      </div>
      {kbName && (
        <button
          onClick={onClear}
          disabled={clearing}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border disabled:opacity-50 transition-colors ${
            isIndigo
              ? 'border-[#A5B4FC] text-[#4338CA] hover:bg-[#EEF2FF]'
              : 'border-emerald-300 text-emerald-700 hover:bg-emerald-100'
          }`}
        >
          {clearing ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
          取消分配
        </button>
      )}
    </div>
  )
}

export default function KnowledgeBasePage() {
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<KBInfo | null>(null)
  const [expandedKb, setExpandedKb] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const { data: kbs, isLoading, error } = useQuery({
    queryKey: ['knowledge-bases'],
    queryFn: knowledgeApi.list,
  })

  const { data: studentKbData } = useQuery({
    queryKey: ['active-kb'],
    queryFn: knowledgeApi.getActiveKb,
  })
  const { data: adminKbData } = useQuery({
    queryKey: ['admin-kb'],
    queryFn: knowledgeApi.getAdminKb,
  })

  const studentKbName = studentKbData?.kb_name ?? null
  const adminKbName = adminKbData?.kb_name ?? null

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['knowledge-bases'] })
    qc.invalidateQueries({ queryKey: ['active-kb'] })
    qc.invalidateQueries({ queryKey: ['admin-kb'] })
  }

  const deleteMutation = useMutation({
    mutationFn: (name: string) => knowledgeApi.delete(name),
    onSuccess: (_, name) => {
      invalidateAll()
      setDeleteTarget(null)
      if (expandedKb === name) setExpandedKb(null)
      showToast(`知识库 "${name}" 已删除`, 'success')
    },
    onError: (e) => showToast(extractError(e), 'error'),
  })

  // 学生 KB mutations
  const setStudentMutation = useMutation({
    mutationFn: (kbName: string) => knowledgeApi.setActiveKb(kbName),
    onSuccess: (data) => { invalidateAll(); showToast(`已将「${data.kb_name}」设为学生知识库`, 'success') },
    onError: (e) => showToast(extractError(e), 'error'),
  })
  const clearStudentMutation = useMutation({
    mutationFn: knowledgeApi.clearActiveKb,
    onSuccess: () => { invalidateAll(); showToast('已取消学生知识库分配', 'success') },
    onError: (e) => showToast(extractError(e), 'error'),
  })

  // 管理端 KB mutations
  const setAdminMutation = useMutation({
    mutationFn: (kbName: string) => knowledgeApi.setAdminKb(kbName),
    onSuccess: (data) => { invalidateAll(); showToast(`已将「${data.kb_name}」设为管理端知识库`, 'success') },
    onError: (e) => showToast(extractError(e), 'error'),
  })
  const clearAdminMutation = useMutation({
    mutationFn: knowledgeApi.clearAdminKb,
    onSuccess: () => { invalidateAll(); showToast('已取消管理端知识库分配', 'success') },
    onError: (e) => showToast(extractError(e), 'error'),
  })

  return (
    <div className="px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A1A]">知识库</h1>
          <p className="mt-1 text-sm" style={{ color: '#8A8A8A' }}>管理知识库，分别为管理端和学生端指定使用的知识库</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#1A1A1A] text-white text-sm rounded-xl hover:bg-[#333] transition-colors"
        >
          <Plus size={15} />新建知识库
        </button>
      </div>

      {/* 两个状态横幅 */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <StatusBanner
          icon={BookOpen}
          kbName={adminKbName}
          label="管理端当前知识库"
          subLabel="教师/管理员的对话将路由至此知识库"
          emptyLabel="尚未为管理端分配知识库"
          emptySubLabel="教师和管理员将无法发起问答，请从下方选择"
          accentColor="emerald"
          onClear={() => clearAdminMutation.mutate()}
          clearing={clearAdminMutation.isPending}
        />
        <StatusBanner
          icon={Users}
          kbName={studentKbName}
          label="学生端当前知识库"
          subLabel="所有学生的问答请求将路由至此知识库"
          emptyLabel="尚未为学生分配知识库"
          emptySubLabel="学生将无法发起问答，请从下方选择"
          accentColor="indigo"
          onClear={() => clearStudentMutation.mutate()}
          clearing={clearStudentMutation.isPending}
        />
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm py-24 justify-center" style={{ color: '#8A8A8A' }}>
          <Loader2 size={16} className="animate-spin" />加载中...
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-500 py-4">
          <AlertCircle size={16} />加载失败，请检查后端服务
        </div>
      )}

      {kbs && kbs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#F2EFE9] flex items-center justify-center">
            <Database size={22} className="text-[#1A1A1A]" strokeWidth={1.6} />
          </div>
          <p className="text-sm font-semibold text-gray-800">暂无知识库</p>
          <p className="text-xs" style={{ color: '#8A8A8A' }}>点击右上角「新建知识库」开始</p>
        </div>
      )}

      {kbs && kbs.length > 0 && (
        <div className="space-y-2">
          {kbs.map((kb, i) => {
            const color = KB_COLORS[i % KB_COLORS.length]
            const isExpanded = expandedKb === kb.name
            const isStudentKb = kb.name === studentKbName
            const isAdminKb = kb.name === adminKbName
            const highlighted = isStudentKb || isAdminKb
            return (
              <div key={kb.id}>
                <div className={`flex items-center gap-4 px-5 py-4 rounded-2xl border transition-colors ${
                  highlighted
                    ? 'bg-white border-gray-300'
                    : isExpanded
                      ? 'border-[#1A1A1A] bg-white'
                      : 'border-[#F0EDE8] bg-white hover:bg-[#F8F6F2]'
                }`}>
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0 select-none"
                    style={{ background: color }}
                  >
                    {kb.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-[#1A1A1A]">{kb.name}</p>
                      {isAdminKb && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-semibold rounded-full border border-emerald-200">
                          <BookOpen size={9} />管理端
                        </span>
                      )}
                      {isStudentKb && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-[#EEF2FF] text-[#4338CA] text-[10px] font-semibold rounded-full border border-[#C7D2FE]">
                          <Users size={9} />学生端
                        </span>
                      )}
                    </div>
                    <p className="text-xs truncate mt-0.5" style={{ color: '#8A8A8A' }}>
                      {kb.description || '暂无描述'}
                    </p>
                  </div>
                  <div className="text-center w-16 shrink-0">
                    <p className="text-lg font-bold text-[#1A1A1A]">{kb.doc_count}</p>
                    <p className="text-xs" style={{ color: '#8A8A8A' }}>篇文档</p>
                  </div>
                  <p className="text-xs w-24 text-right shrink-0" style={{ color: '#8A8A8A' }}>
                    {formatDate(kb.created_at)}
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* 管理端 KB 按钮 */}
                    {isAdminKb ? (
                      <button
                        onClick={() => clearAdminMutation.mutate()}
                        disabled={clearAdminMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 transition-colors"
                      >
                        {clearAdminMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
                        取消管理端
                      </button>
                    ) : (
                      <button
                        onClick={() => setAdminMutation.mutate(kb.name)}
                        disabled={setAdminMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-[#E8E4DC] text-gray-600 hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 transition-colors"
                      >
                        {setAdminMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <BookOpen size={11} />}
                        设为管理端
                      </button>
                    )}
                    {/* 学生 KB 按钮 */}
                    {isStudentKb ? (
                      <button
                        onClick={() => clearStudentMutation.mutate()}
                        disabled={clearStudentMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-[#A5B4FC] bg-[#EEF2FF] text-[#4338CA] hover:bg-[#E0E7FF] disabled:opacity-50 transition-colors"
                      >
                        {clearStudentMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
                        取消学生端
                      </button>
                    ) : (
                      <button
                        onClick={() => setStudentMutation.mutate(kb.name)}
                        disabled={setStudentMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-[#E8E4DC] text-gray-600 hover:border-[#818CF8] hover:text-[#4338CA] hover:bg-[#EEF2FF] disabled:opacity-50 transition-colors"
                      >
                        {setStudentMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <Users size={11} />}
                        设为学生端
                      </button>
                    )}
                    <button
                      onClick={() => setExpandedKb(isExpanded ? null : kb.name)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${isExpanded ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'border-[#F0EDE8] text-[#1A1A1A] hover:bg-[#F2EFE9]'}`}
                    >
                      <FileText size={12} />
                      {isExpanded ? '收起' : '管理文档'}
                      {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                    </button>
                    <button
                      onClick={() => setDeleteTarget(kb)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {isExpanded && <DocumentPanel kbName={kb.name} onToast={showToast} />}
              </div>
            )
          })}
        </div>
      )}

      {createOpen && (
        <CreateDialog
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); showToast('知识库创建成功', 'success') }}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          name={deleteTarget.name}
          onConfirm={() => deleteMutation.mutate(deleteTarget.name)}
          onCancel={() => setDeleteTarget(null)}
          loading={deleteMutation.isPending}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
