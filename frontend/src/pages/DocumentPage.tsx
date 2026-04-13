import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  Upload, Trash2, Loader2, X, ChevronDown, ChevronUp, FileText,
  CheckCircle, AlertCircle, Clock,
} from 'lucide-react'
import { knowledgeApi, documentApi, extractError } from '@/lib/api'
import type { DocType, SplitterType, UploadParams } from '@/types/api'

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('zh-CN')
}

const DOC_TYPE_LABELS: Record<DocType, string> = {
  policy: '政策文件',
  manual: '操作手册',
  form:   '填报模板',
}
const DOC_TYPE_COLORS: Record<DocType, string> = {
  policy: 'bg-blue-50 text-blue-700',
  manual: 'bg-purple-50 text-purple-700',
  form:   'bg-amber-50 text-amber-700',
}

function Badge({ docType }: { docType: DocType }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${DOC_TYPE_COLORS[docType]}`}>
      {DOC_TYPE_LABELS[docType]}
    </span>
  )
}

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  return (
    <div className={`fixed bottom-6 right-6 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-white text-sm z-50 ${type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
      <span>{message}</span>
      <button onClick={onClose}><X size={14} /></button>
    </div>
  )
}

const DEFAULT_PARAMS: UploadParams = {
  splitter_type: 'recursive',
  chunk_size: 256,
  chunk_overlap_ratio: 0.1,
  enable_cleaning: false,
  doc_type: 'policy',
}

// ── 队列项类型 ─────────────────────────────────────────────

type FileStatus = 'pending' | 'uploading' | 'done' | 'error'

interface QueueItem {
  id: string
  file: File
  status: FileStatus
  progress: number
  chunks?: number
  error?: string
}

function StatusIcon({ status }: { status: FileStatus }) {
  if (status === 'pending') return <Clock size={14} className="text-gray-400" />
  if (status === 'uploading') return <Loader2 size={14} className="animate-spin text-blue-500" />
  if (status === 'done') return <CheckCircle size={14} className="text-emerald-500" />
  return <AlertCircle size={14} className="text-red-500" />
}

export default function DocumentPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedKb = searchParams.get('kb') ?? ''
  const qc = useQueryClient()

  const [dragOver, setDragOver] = useState(false)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [params, setParams] = useState<UploadParams>(DEFAULT_PARAMS)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3500)
  }

  const { data: kbs } = useQuery({ queryKey: ['knowledge-bases'], queryFn: knowledgeApi.list })

  const { data: docs, isLoading: docsLoading } = useQuery({
    queryKey: ['documents', selectedKb],
    queryFn: () => documentApi.list(selectedKb),
    enabled: !!selectedKb,
  })

  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files)
    const items: QueueItem[] = arr.map(file => ({
      id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
      file,
      status: 'pending',
      progress: 0,
    }))
    setQueue(prev => [...prev, ...items])
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
  }, [addFiles])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) addFiles(e.target.files)
    e.target.value = ''
  }

  const removeFromQueue = (id: string) =>
    setQueue(prev => prev.filter(item => item.id !== id))

  const clearDone = () =>
    setQueue(prev => prev.filter(item => item.status !== 'done'))

  const deleteMutation = useMutation({
    mutationFn: (id: number) => documentApi.delete(selectedKb, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents', selectedKb] })
      qc.invalidateQueries({ queryKey: ['knowledge-bases'] })
      setDeleteId(null)
      showToast('文档已删除', 'success')
    },
    onError: (e) => showToast(extractError(e), 'error'),
  })

  const startUpload = async () => {
    const pending = queue.filter(item => item.status === 'pending')
    if (!pending.length || !selectedKb) return

    setUploading(true)
    let successCount = 0
    let failCount = 0

    for (const item of pending) {
      // 标记为上传中
      setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'uploading', progress: 0 } : q))

      try {
        const doc = await documentApi.upload(
          selectedKb,
          item.file,
          params,
          (pct) => setQueue(prev => prev.map(q => q.id === item.id ? { ...q, progress: pct } : q)),
        )
        setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'done', progress: 100, chunks: doc.chunk_count } : q))
        successCount++
        qc.invalidateQueries({ queryKey: ['documents', selectedKb] })
        qc.invalidateQueries({ queryKey: ['knowledge-bases'] })
      } catch (e) {
        setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'error', error: extractError(e) } : q))
        failCount++
      }
    }

    setUploading(false)
    if (successCount > 0 && failCount === 0) {
      showToast(`${successCount} 个文档入库成功`, 'success')
    } else if (failCount > 0) {
      showToast(`${successCount} 成功，${failCount} 失败`, 'error')
    }
  }

  const pendingCount = queue.filter(q => q.status === 'pending').length
  const hasDone = queue.some(q => q.status === 'done')

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">文档</h1>
        <p className="mt-1 text-sm text-gray-500">上传与管理知识库中的文档</p>
      </div>

      {/* 知识库选择 */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">选择知识库</label>
        <select
          value={selectedKb}
          onChange={e => setSearchParams(e.target.value ? { kb: e.target.value } : {})}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 w-60"
        >
          <option value="">— 请选择 —</option>
          {kbs?.map(kb => <option key={kb.id} value={kb.name}>{kb.name}</option>)}
        </select>
      </div>

      {selectedKb && (
        <>
          {/* 上传区域 */}
          <div className="mb-6 bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="text-sm font-medium text-gray-700 mb-3">上传文档</h2>

            {/* 拖拽区 */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.md"
                multiple
                className="hidden"
                onChange={handleFileChange}
              />
              <Upload size={24} className="mx-auto text-gray-400 mb-2" />
              <p className="text-sm text-gray-600">拖拽文件到此处，或 <span className="text-blue-600">点击选择</span></p>
              <p className="text-xs text-gray-400 mt-1">支持 .pdf / .txt / .md，可多选</p>
            </div>

            {/* 文件队列 */}
            {queue.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {queue.map(item => (
                  <div key={item.id} className="flex items-center gap-3 px-3 py-2 rounded-md bg-gray-50 border border-gray-100">
                    <StatusIcon status={item.status} />
                    <FileText size={14} className="text-gray-400 shrink-0" />
                    <span className="text-sm text-gray-800 truncate flex-1 min-w-0">{item.file.name}</span>
                    <span className="text-xs text-gray-400 shrink-0">{formatSize(item.file.size)}</span>
                    {item.status === 'uploading' && (
                      <div className="w-20 bg-gray-200 rounded-full h-1.5 shrink-0">
                        <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${item.progress}%` }} />
                      </div>
                    )}
                    {item.status === 'done' && item.chunks !== undefined && (
                      <span className="text-xs text-emerald-600 shrink-0">{item.chunks} chunks</span>
                    )}
                    {item.status === 'error' && (
                      <span className="text-xs text-red-500 shrink-0 max-w-32 truncate" title={item.error}>{item.error}</span>
                    )}
                    {item.status === 'pending' && (
                      <button
                        onClick={() => removeFromQueue(item.id)}
                        className="text-gray-400 hover:text-gray-600 shrink-0"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 文档类型 */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">文档类型</label>
              <div className="flex gap-3">
                {(Object.entries(DOC_TYPE_LABELS) as [DocType, string][]).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setParams(p => ({ ...p, doc_type: val }))}
                    className={`px-4 py-2 text-sm rounded-md border transition-colors ${params.doc_type === val ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* 高级参数（折叠） */}
            <button
              onClick={() => setAdvancedOpen(o => !o)}
              className="mt-4 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
            >
              {advancedOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              高级参数
            </button>

            {advancedOpen && (
              <div className="mt-3 grid grid-cols-2 gap-4 border-t border-gray-100 pt-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">切分策略</label>
                  <select
                    value={params.splitter_type}
                    onChange={e => setParams(p => ({ ...p, splitter_type: e.target.value as SplitterType }))}
                    className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
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
                  <input
                    type="range" min={64} max={1024} step={64}
                    value={params.chunk_size}
                    onChange={e => setParams(p => ({ ...p, chunk_size: Number(e.target.value) }))}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Overlap 比例 <span className="text-gray-400">{params.chunk_overlap_ratio.toFixed(2)}</span>
                  </label>
                  <input
                    type="range" min={0} max={0.5} step={0.05}
                    value={params.chunk_overlap_ratio}
                    onChange={e => setParams(p => ({ ...p, chunk_overlap_ratio: Number(e.target.value) }))}
                    className="w-full"
                  />
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <input
                    type="checkbox"
                    id="cleaning"
                    checked={params.enable_cleaning}
                    onChange={e => setParams(p => ({ ...p, enable_cleaning: e.target.checked }))}
                    className="rounded"
                  />
                  <label htmlFor="cleaning" className="text-sm text-gray-600 cursor-pointer">
                    启用 LLM 清洗 <span className="text-xs text-gray-400">（较慢）</span>
                  </label>
                </div>
              </div>
            )}

            {/* 操作按钮 */}
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={startUpload}
                disabled={pendingCount === 0 || uploading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {uploading ? '入库中...' : `上传入库${pendingCount > 0 ? ` (${pendingCount})` : ''}`}
              </button>
              {hasDone && !uploading && (
                <button
                  onClick={clearDone}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  清除已完成
                </button>
              )}
            </div>
          </div>

          {/* 文档列表 */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-medium text-gray-700">已入库文档</h2>
            </div>

            {docsLoading && (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-8 justify-center">
                <Loader2 size={14} className="animate-spin" />加载中...
              </div>
            )}

            {docs && docs.length === 0 && (
              <div className="text-sm text-gray-400 py-10 text-center">暂无文档，请上传</div>
            )}

            {docs && docs.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">文件名</th>
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">类型</th>
                    <th className="text-center px-4 py-3 text-gray-600 font-medium">大小</th>
                    <th className="text-center px-4 py-3 text-gray-600 font-medium">Chunks</th>
                    <th className="text-left px-4 py-3 text-gray-600 font-medium">上传时间</th>
                    <th className="text-right px-4 py-3 text-gray-600 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map(doc => (
                    <tr key={doc.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-900 font-medium max-w-xs truncate">{doc.file_name}</td>
                      <td className="px-4 py-3"><Badge docType={doc.doc_type as DocType} /></td>
                      <td className="px-4 py-3 text-center text-gray-500">{formatSize(doc.file_size)}</td>
                      <td className="px-4 py-3 text-center text-gray-700">{doc.chunk_count}</td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(doc.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        {deleteId === doc.id ? (
                          <div className="flex items-center gap-2 justify-end">
                            <span className="text-xs text-gray-500">确认删除？</span>
                            <button
                              onClick={() => deleteMutation.mutate(doc.id)}
                              disabled={deleteMutation.isPending}
                              className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 flex items-center gap-1"
                            >
                              {deleteMutation.isPending && <Loader2 size={10} className="animate-spin" />}
                              确认
                            </button>
                            <button onClick={() => setDeleteId(null)} className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50">取消</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteId(doc.id)}
                            className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {!selectedKb && (
        <div className="text-sm text-gray-400 py-16 text-center border border-dashed border-gray-200 rounded-lg">
          请先选择一个知识库
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
