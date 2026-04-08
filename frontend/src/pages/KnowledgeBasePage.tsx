import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, FileText, Loader2, AlertCircle, X } from 'lucide-react'
import { knowledgeApi, extractError } from '@/lib/api'
import type { KBInfo } from '@/types/api'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

// 简单 Toast
function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  return (
    <div className={`fixed bottom-6 right-6 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-white text-sm z-50 ${type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
      <span>{message}</span>
      <button onClick={onClose}><X size={14} /></button>
    </div>
  )
}

// 确认对话框
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

// 创建对话框
function CreateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [nameError, setNameError] = useState('')
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => knowledgeApi.create({ name: name.trim(), description: desc.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['knowledge-bases'] })
      onCreated()
    },
  })

  const namePattern = /^[a-zA-Z0-9_\-\u4e00-\u9fff]+$/
  const validate = () => {
    if (!name.trim()) { setNameError('名称不能为空'); return false }
    if (!namePattern.test(name.trim())) { setNameError('只支持字母、数字、下划线、中文'); return false }
    setNameError(''); return true
  }

  const handleSubmit = () => {
    if (!validate()) return
    mutation.mutate()
  }

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
              className={`w-full border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 ${nameError ? 'border-red-400' : 'border-gray-300'}`}
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
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="可选"
              value={desc}
              onChange={e => setDesc(e.target.value)}
            />
          </div>
          {mutation.error && (
            <p className="text-xs text-red-500">{extractError(mutation.error)}</p>
          )}
        </div>

        <div className="mt-5 flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-gray-300 hover:bg-gray-50">取消</button>
          <button onClick={handleSubmit} disabled={mutation.isPending} className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            创建
          </button>
        </div>
      </div>
    </div>
  )
}

export default function KnowledgeBasePage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<KBInfo | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const { data: kbs, isLoading, error } = useQuery({
    queryKey: ['knowledge-bases'],
    queryFn: knowledgeApi.list,
  })

  const deleteMutation = useMutation({
    mutationFn: (name: string) => knowledgeApi.delete(name),
    onSuccess: (_, name) => {
      qc.invalidateQueries({ queryKey: ['knowledge-bases'] })
      setDeleteTarget(null)
      showToast(`知识库 "${name}" 已删除`, 'success')
    },
    onError: (e) => showToast(extractError(e), 'error'),
  })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">知识库</h1>
          <p className="mt-1 text-sm text-gray-500">管理知识库的创建与删除</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
        >
          <Plus size={16} />
          新建知识库
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-12 justify-center">
          <Loader2 size={16} className="animate-spin" />加载中...
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-500 py-4">
          <AlertCircle size={16} />加载失败，请检查后端服务
        </div>
      )}

      {kbs && kbs.length === 0 && (
        <div className="text-sm text-gray-400 py-16 text-center border border-dashed border-gray-200 rounded-lg">
          暂无知识库，点击右上角「新建知识库」开始
        </div>
      )}

      {kbs && kbs.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 text-gray-600 font-medium">名称</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">描述</th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium">文档数</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">创建时间</th>
                <th className="text-right px-4 py-3 text-gray-600 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {kbs.map((kb, i) => (
                <tr key={kb.id} className={`border-b border-gray-100 last:border-0 hover:bg-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                  <td className="px-4 py-3 font-medium text-gray-900">{kb.name}</td>
                  <td className="px-4 py-3 text-gray-500">{kb.description || '—'}</td>
                  <td className="px-4 py-3 text-center text-gray-700">{kb.doc_count}</td>
                  <td className="px-4 py-3 text-gray-500">{formatDate(kb.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => navigate(`/documents?kb=${kb.name}`)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100"
                      >
                        <FileText size={12} />管理文档
                      </button>
                      <button
                        onClick={() => setDeleteTarget(kb)}
                        className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
