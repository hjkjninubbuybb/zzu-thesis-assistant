import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, MoreHorizontal, UserCheck, UserX, KeyRound, Trash2, Download, Upload, FileDown, Pencil } from 'lucide-react'
import { userApi, extractError } from '@/lib/api'
import type { UserInfo, UserCreate, TeacherProfileCreate } from '@/types/api'

// ── 创建教师弹窗 ────────────────────────────────────────────

function CreateTeacherModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState<Omit<UserCreate, 'username'> & Partial<TeacherProfileCreate>>({
    password: '', display_name: '', role: 'teacher',
    employee_id: '', department: '', title: '',
  })
  const [error, setError] = useState<string | null>(null)

  const createMut = useMutation({
    mutationFn: async () => {
      const user = await userApi.create({
        username: form.employee_id ?? '',
        password: form.password,
        display_name: form.display_name,
        role: 'teacher',
      })
      await userApi.updateTeacherProfile(user.id, {
        employee_id: form.employee_id ?? '',
        department: form.department ?? '',
        title: form.title ?? '',
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      onClose()
    },
    onError: (err) => setError(extractError(err)),
  })

  const field = (key: keyof typeof form, label: string, placeholder: string, type = 'text') => (
    <div key={key} className="flex flex-col gap-1">
      <label className="text-xs text-[#6A6A6A] font-medium">{label}</label>
      <input
        type={type}
        value={(form[key] as string) ?? ''}
        onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
        placeholder={placeholder}
        className="px-3 py-2 rounded-lg border border-[#E8E5E0] bg-[#FAFAF9] text-sm outline-none focus:border-slate-400 transition"
      />
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-apple-fade">
      <div className="glass-card rounded-2xl p-6 w-full max-w-md animate-apple-pop">
        <h2 className="text-base font-semibold text-[#334155] mb-4">添加教师账号</h2>
        <div className="flex flex-col gap-3">
          {field('employee_id', '工号 *', '如 T2022001')}
          {field('password', '初始密码 *', '至少 6 位', 'password')}
          {field('display_name', '姓名', '教师真实姓名')}
          {field('department', '院系', '如 计算机学院')}
          {field('title', '职称', '如 教授、副教授')}
        </div>
        {error && <div className="mt-3 text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[#6A6A6A]">取消</button>
          <button
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending || !form.employee_id || !form.password}
            className="px-4 py-2 bg-slate-700 text-white text-sm rounded-xl hover:bg-slate-800 disabled:opacity-50 transition"
          >
            {createMut.isPending ? '创建中...' : '创建'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 编辑教师弹窗 ────────────────────────────────────────────

function EditTeacherModal({ user, onClose }: { user: UserInfo; onClose: () => void }) {
  const qc = useQueryClient()
  const profile = user.profile as { employee_id?: string; department?: string; title?: string } | null
  const [form, setForm] = useState({
    display_name: user.display_name || '',
    employee_id: profile?.employee_id || '',
    department: profile?.department || '',
    title: profile?.title || '',
  })
  const [error, setError] = useState<string | null>(null)

  const editMut = useMutation({
    mutationFn: async () => {
      await userApi.update(user.id, { display_name: form.display_name })
      await userApi.updateTeacherProfile(user.id, {
        employee_id: form.employee_id,
        department: form.department,
        title: form.title,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      onClose()
    },
    onError: (err) => setError(extractError(err)),
  })

  const field = (key: keyof typeof form, label: string, placeholder: string) => (
    <div key={key} className="flex flex-col gap-1">
      <label className="text-xs text-[#6A6A6A] font-medium">{label}</label>
      <input
        type="text"
        value={form[key]}
        onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
        placeholder={placeholder}
        className="px-3 py-2 rounded-lg border border-[#E8E5E0] bg-[#FAFAF9] text-sm outline-none focus:border-slate-400 transition"
      />
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-apple-fade">
      <div className="glass-card rounded-2xl p-6 w-full max-w-md animate-apple-pop">
        <h2 className="text-base font-semibold text-[#334155] mb-4">编辑教师信息</h2>
        <div className="flex flex-col gap-3">
          {field('employee_id', '工号', '如 T2022001')}
          {field('display_name', '姓名', '教师真实姓名')}
          {field('department', '院系', '如 计算机学院')}
          {field('title', '职称', '如 教授、副教授')}
        </div>
        {error && <div className="mt-3 text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[#6A6A6A]">取消</button>
          <button
            onClick={() => editMut.mutate()}
            disabled={editMut.isPending || !form.employee_id}
            className="px-4 py-2 bg-slate-700 text-white text-sm rounded-xl hover:bg-slate-800 disabled:opacity-50 transition"
          >
            {editMut.isPending ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 重置密码弹窗 ────────────────────────────────────────────

function ResetPasswordModal({ user, onClose }: { user: UserInfo; onClose: () => void }) {
  const [pwd, setPwd] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mut = useMutation({
    mutationFn: () => userApi.resetPassword(user.id, pwd),
    onSuccess: onClose,
    onError: (err) => setError(extractError(err)),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-apple-fade">
      <div className="glass-card rounded-2xl p-6 w-full max-w-sm animate-apple-pop">
        <h2 className="text-base font-semibold text-[#334155] mb-1">重置密码</h2>
        <p className="text-xs text-[#9A9A9A] mb-4">为 <b>{user.display_name || user.username}</b> 设置新密码</p>
        <input type="password" value={pwd} onChange={e => setPwd(e.target.value)}
          placeholder="新密码（至少 6 位）"
          className="w-full px-3 py-2 rounded-lg border border-[#E8E5E0] bg-[#FAFAF9] text-sm outline-none focus:border-slate-400 transition" />
        {error && <div className="mt-2 text-xs text-red-500">{error}</div>}
        <div className="flex gap-2 mt-4 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[#6A6A6A]">取消</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending || pwd.length < 6}
            className="px-4 py-2 bg-slate-700 text-white text-sm rounded-xl hover:bg-slate-800 disabled:opacity-50 transition">
            {mut.isPending ? '重置中...' : '确认重置'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 主页面 ──────────────────────────────────────────────────

export default function TeachersPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [resetTarget, setResetTarget] = useState<UserInfo | null>(null)
  const [editTarget, setEditTarget] = useState<UserInfo | null>(null)
  const [menuOpen, setMenuOpen] = useState<number | null>(null)
  const [importResult, setImportResult] = useState<{ total: number; success: number; skipped: number; failed: number; errors: unknown[] } | null>(null)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['users', 'teacher', page],
    queryFn: () => userApi.list({ role: 'teacher', page, page_size: 20 }),
  })

  const toggleActive = useMutation({
    mutationFn: (user: UserInfo) => userApi.update(user.id, { is_active: !user.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => userApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportResult(null)
    try {
      const result = await userApi.importTeachers(file)
      setImportResult(result)
      qc.invalidateQueries({ queryKey: ['users'] })
    } catch (err) {
      setImportResult({ total: 0, success: 0, skipped: 0, failed: 1, errors: [extractError(err)] })
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / 20) || 1

  const filtered = search.trim()
    ? items.filter(u =>
        u.display_name.includes(search) ||
        ((u.profile as { employee_id?: string })?.employee_id ?? '').includes(search)
      )
    : items

  const settle = (d: number): React.CSSProperties => ({
    animation: `appleSettleIn 0.75s cubic-bezier(0.25, 1, 0.5, 1) ${d}ms both`,
  })

  return (
    <div className="px-8 py-8 flex-1 overflow-y-auto glass-card rounded-2xl custom-scrollbar flex flex-col gap-5">
      <div className="flex items-center justify-between shrink-0" style={settle(0)}>
        <div>
          <h1 className="text-2xl font-bold text-[#334155]">教师管理</h1>
          <p className="mt-1 text-sm text-[#8A8A8A]">共 {total} 名教师</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => userApi.downloadTeacherTemplate()}
            className="flex items-center gap-1.5 px-3.5 py-2.5 border border-[#E8E4DC] text-sm text-[#334155] rounded-xl hover:bg-[#F8F6F2] transition-colors">
            <FileDown size={14} /> 下载模板
          </button>
          <button onClick={() => userApi.exportTeachers()}
            className="flex items-center gap-1.5 px-3.5 py-2.5 border border-[#E8E4DC] text-sm text-[#334155] rounded-xl hover:bg-[#F8F6F2] transition-colors">
            <Download size={14} /> 导出
          </button>
          <label className={`flex items-center gap-1.5 px-3.5 py-2.5 border border-[#E8E4DC] text-sm rounded-xl cursor-pointer transition-colors ${importing ? 'opacity-50 cursor-not-allowed' : 'text-[#334155] hover:bg-[#F8F6F2]'}`}>
            <Upload size={14} /> {importing ? '导入中...' : '批量导入'}
            <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleImport} disabled={importing} />
          </label>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 text-white text-sm rounded-xl hover:bg-slate-800 transition-colors shadow-sm active:scale-[0.98]">
            <Plus size={15} /> 添加教师
          </button>
        </div>
      </div>

      {importResult && (
        <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl text-xs border ${importResult.failed > 0 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
          <span>导入完成：成功 {importResult.success} 条，跳过 {importResult.skipped} 条{importResult.failed > 0 ? `，失败 ${importResult.failed} 条` : ''}</span>
          <button onClick={() => setImportResult(null)} className="ml-4 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      <div className="relative" style={settle(50)}>
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#C0BDB8]" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="搜索姓名或工号..."
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[#E8E4DC] bg-white text-sm outline-none focus:ring-2 focus:ring-slate-400 transition-all" />
      </div>

      <div className="flex-1 border border-[#F0EDE8] rounded-2xl overflow-hidden bg-white/50" style={settle(100)}>
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-sm text-[#9A9A9A]">加载中...</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-sm text-[#9A9A9A]">
            {search ? '没有匹配的教师' : '暂无教师账号，点击「添加教师」创建'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F0EDE8] bg-[#FAFAF9]/50">
                {['姓名', '工号', '院系', '职称', '状态', '创建时间', ''].map(h => (
                  <th key={h} className="text-left px-5 py-3.5 text-xs text-[#9A9A9A] font-bold uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((u, i) => {
                const profile = u.profile as { employee_id?: string; department?: string; title?: string } | null
                return (
                  <tr
                    key={u.id}
                    className="border-b border-[#F8F6F3] hover:bg-white transition-colors"
                    style={{ animation: `appleFadeUp 0.55s cubic-bezier(0.25, 1, 0.5, 1) ${Math.min(160 + i * 45, 600)}ms both` }}
                  >
                    <td className="px-5 py-4 font-semibold text-[#334155]">{u.display_name || '—'}</td>
                    <td className="px-5 py-4 text-[#4A4A4A] font-mono text-xs">{profile?.employee_id || '—'}</td>
                    <td className="px-5 py-4 text-[#6A6A6A]">{profile?.department || '—'}</td>
                    <td className="px-5 py-4 text-[#6A6A6A]">{profile?.title || '—'}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                        u.is_active ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-red-50 text-red-500 border border-red-100'
                      }`}>
                        {u.is_active ? '正常' : '禁用'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-[#9A9A9A] text-xs">{String(u.created_at).slice(0, 10)}</td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex justify-end items-center gap-1">
                        <button
                          onClick={() => setMenuOpen(menuOpen === u.id ? null : u.id)}
                          className="p-1.5 text-[#C0BDB8] hover:text-[#334155] transition-colors rounded-lg hover:bg-[#F2EFE9]"
                        >
                          <MoreHorizontal size={16} />
                        </button>
                      </div>
                      {menuOpen === u.id && (
                        <div
                          className="absolute right-10 z-20 bg-white border border-[#F0EDE8] rounded-xl shadow-xl py-1 min-w-[140px] overflow-hidden animate-apple-pop"
                          style={{ transformOrigin: 'top right' }}
                          onMouseLeave={() => setMenuOpen(null)}>
                          <button
                            onClick={() => { setEditTarget(u); setMenuOpen(null) }}
                            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs text-[#4A4A4A] hover:bg-[#F8F6F2] transition-colors">
                            <Pencil size={13} className="text-[#8A8A8A]" />编辑信息
                          </button>
                          <button
                            onClick={() => { toggleActive.mutate(u); setMenuOpen(null) }}
                            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs text-[#4A4A4A] hover:bg-[#F8F6F2] transition-colors">
                            {u.is_active ? <><UserX size={13} className="text-[#8A8A8A]" />禁用账号</> : <><UserCheck size={13} className="text-[#8A8A8A]" />启用账号</>}
                          </button>
                          <button
                            onClick={() => { setResetTarget(u); setMenuOpen(null) }}
                            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs text-[#4A4A4A] hover:bg-[#F8F6F2] transition-colors">
                            <KeyRound size={13} className="text-[#8A8A8A]" />重置密码
                          </button>
                          <div className="h-px bg-[#F0EDE8] my-1" />
                          <button
                            onClick={() => {
                              if (confirm(`确定删除教师 "${u.display_name || u.username}" 吗？`)) deleteMut.mutate(u.id)
                              setMenuOpen(null)
                            }}
                            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs text-red-500 hover:bg-red-50 transition-colors">
                            <Trash2 size={13} />删除账号
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-2" style={settle(150)}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="px-4 py-2 rounded-xl border border-[#E8E4DC] text-xs font-medium text-[#4A4A4A] disabled:opacity-30 hover:bg-[#F8F6F2] transition-all">
            上一页
          </button>
          <div className="bg-[#F2EFE9] px-3 py-1 rounded-full text-[10px] font-bold text-[#8A8A8A] uppercase tracking-wider">
            {page} / {totalPages}
          </div>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="px-4 py-2 rounded-xl border border-[#E8E4DC] text-xs font-medium text-[#4A4A4A] disabled:opacity-30 hover:bg-[#F8F6F2] transition-all">
            下一页
          </button>
        </div>
      )}

      {showCreate && <CreateTeacherModal onClose={() => setShowCreate(false)} />}
      {resetTarget && <ResetPasswordModal user={resetTarget} onClose={() => setResetTarget(null)} />}
      {editTarget && <EditTeacherModal user={editTarget} onClose={() => setEditTarget(null)} />}
    </div>
  )
}
