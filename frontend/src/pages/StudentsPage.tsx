import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, MoreHorizontal, UserCheck, UserX, KeyRound, Trash2, Download, Upload, FileDown, Pencil } from 'lucide-react'
import { userApi, extractError } from '@/lib/api'
import type { UserInfo, UserCreate, StudentProfileCreate } from '@/types/api'

// ── 创建学生弹窗 ────────────────────────────────────────────

function CreateStudentModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState<Omit<UserCreate, 'username'> & Partial<StudentProfileCreate>>({
    password: '', display_name: '', role: 'student',
    student_id: '', grade: '', major: '', class_name: '',
  })
  const [error, setError] = useState<string | null>(null)

  const createMut = useMutation({
    mutationFn: async () => {
      const user = await userApi.create({
        username: form.student_id ?? '',
        password: form.password,
        display_name: form.display_name,
        role: 'student',
      })
      await userApi.updateStudentProfile(user.id, {
        student_id: form.student_id ?? '',
        grade: form.grade ?? '',
        major: form.major ?? '',
        class_name: form.class_name ?? '',
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
        className="px-3 py-2 rounded-lg border border-[#E8E5E0] bg-[#FAFAF9] text-sm outline-none focus:border-[#1A1A1A] transition"
      />
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-apple-fade">
      <div className="bg-white rounded-2xl border border-[#F0EDE8] shadow-lg p-6 w-full max-w-md animate-apple-pop">
        <h2 className="text-base font-semibold text-[#1A1A1A] mb-4">添加学生账号</h2>
        <div className="flex flex-col gap-3">
          {field('student_id', '学号 *', '如 202212345678')}
          {field('password', '初始密码 *', '至少 6 位', 'password')}
          {field('display_name', '姓名', '学生真实姓名')}
          <div className="flex gap-3">
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-xs text-[#6A6A6A] font-medium">年级</label>
              <input type="text" value={form.grade ?? ''} onChange={e => setForm(p => ({...p, grade: e.target.value}))}
                placeholder="如 2022" className="px-3 py-2 rounded-lg border border-[#E8E5E0] bg-[#FAFAF9] text-sm outline-none focus:border-[#1A1A1A] transition" />
            </div>
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-xs text-[#6A6A6A] font-medium">班级</label>
              <input type="text" value={form.class_name ?? ''} onChange={e => setForm(p => ({...p, class_name: e.target.value}))}
                placeholder="如 计科一班" className="px-3 py-2 rounded-lg border border-[#E8E5E0] bg-[#FAFAF9] text-sm outline-none focus:border-[#1A1A1A] transition" />
            </div>
          </div>
          {field('major', '专业', '如 计算机科学与技术')}
        </div>
        {error && <div className="mt-3 text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[#6A6A6A]">取消</button>
          <button
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending || !form.student_id || !form.password}
            className="px-4 py-2 bg-[#1A1A1A] text-white text-sm rounded-xl hover:bg-[#333] disabled:opacity-50 transition"
          >
            {createMut.isPending ? '创建中...' : '创建'}
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
      <div className="bg-white rounded-2xl border border-[#F0EDE8] shadow-lg p-6 w-full max-w-sm animate-apple-pop">
        <h2 className="text-base font-semibold text-[#1A1A1A] mb-1">重置密码</h2>
        <p className="text-xs text-[#9A9A9A] mb-4">为 <b>{user.display_name || user.username}</b> 设置新密码</p>
        <input type="password" value={pwd} onChange={e => setPwd(e.target.value)}
          placeholder="新密码（至少 6 位）"
          className="w-full px-3 py-2 rounded-lg border border-[#E8E5E0] bg-[#FAFAF9] text-sm outline-none focus:border-[#1A1A1A] transition" />
        {error && <div className="mt-2 text-xs text-red-500">{error}</div>}
        <div className="flex gap-2 mt-4 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[#6A6A6A]">取消</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending || pwd.length < 6}
            className="px-4 py-2 bg-[#1A1A1A] text-white text-sm rounded-xl hover:bg-[#333] disabled:opacity-50 transition">
            {mut.isPending ? '重置中...' : '确认重置'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 编辑学生弹窗 ────────────────────────────────────────────

function EditStudentModal({ user, onClose }: { user: UserInfo; onClose: () => void }) {
  const qc = useQueryClient()
  const profile = user.profile as { student_id?: string; grade?: string; major?: string; class_name?: string } | null
  const [form, setForm] = useState({
    display_name: user.display_name || '',
    student_id: profile?.student_id || '',
    grade: profile?.grade || '',
    major: profile?.major || '',
    class_name: profile?.class_name || '',
  })
  const [error, setError] = useState<string | null>(null)

  const editMut = useMutation({
    mutationFn: async () => {
      await userApi.update(user.id, { display_name: form.display_name })
      await userApi.updateStudentProfile(user.id, {
        student_id: form.student_id,
        grade: form.grade,
        major: form.major,
        class_name: form.class_name,
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
        className="px-3 py-2 rounded-lg border border-[#E8E5E0] bg-[#FAFAF9] text-sm outline-none focus:border-[#1A1A1A] transition"
      />
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-apple-fade">
      <div className="bg-white rounded-2xl border border-[#F0EDE8] shadow-lg p-6 w-full max-w-md animate-apple-pop">
        <h2 className="text-base font-semibold text-[#1A1A1A] mb-4">编辑学生信息</h2>
        <div className="flex flex-col gap-3">
          {field('student_id', '学号', '如 202212345678')}
          {field('display_name', '姓名', '学生真实姓名')}
          <div className="flex gap-3">
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-xs text-[#6A6A6A] font-medium">年级</label>
              <input type="text" value={form.grade} onChange={e => setForm(p => ({...p, grade: e.target.value}))}
                placeholder="如 2022" className="px-3 py-2 rounded-lg border border-[#E8E5E0] bg-[#FAFAF9] text-sm outline-none focus:border-[#1A1A1A] transition" />
            </div>
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-xs text-[#6A6A6A] font-medium">班级</label>
              <input type="text" value={form.class_name} onChange={e => setForm(p => ({...p, class_name: e.target.value}))}
                placeholder="如 计科一班" className="px-3 py-2 rounded-lg border border-[#E8E5E0] bg-[#FAFAF9] text-sm outline-none focus:border-[#1A1A1A] transition" />
            </div>
          </div>
          {field('major', '专业', '如 计算机科学与技术')}
        </div>
        {error && <div className="mt-3 text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[#6A6A6A]">取消</button>
          <button
            onClick={() => editMut.mutate()}
            disabled={editMut.isPending || !form.student_id}
            className="px-4 py-2 bg-[#1A1A1A] text-white text-sm rounded-xl hover:bg-[#333] disabled:opacity-50 transition"
          >
            {editMut.isPending ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 主页面 ──────────────────────────────────────────────────

export default function StudentsPage() {
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
    queryKey: ['users', 'student', page],
    queryFn: () => userApi.list({ role: 'student', page, page_size: 20 }),
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
      const result = await userApi.importStudents(file)
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
        ((u.profile as { student_id?: string })?.student_id ?? '').includes(search)
      )
    : items

  const settle = (d: number): React.CSSProperties => ({
    animation: `appleSettleIn 0.75s cubic-bezier(0.25, 1, 0.5, 1) ${d}ms both`,
  })

  return (
    <div className="flex flex-col gap-5 h-full">
      {/* 头部 */}
      <div className="flex items-center justify-between" style={settle(0)}>
        <div>
          <h1 className="text-lg font-semibold text-[#1A1A1A]">学生账号</h1>
          <p className="text-xs text-[#9A9A9A] mt-0.5">共 {total} 名学生</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => userApi.downloadTemplate()}
            className="flex items-center gap-1.5 px-3 py-2 border border-[#E8E5E0] text-xs text-[#4A4A4A] rounded-xl hover:bg-[#F2EFE9] transition">
            <FileDown size={13} /> 下载模板
          </button>
          <button onClick={() => userApi.exportStudents()}
            className="flex items-center gap-1.5 px-3 py-2 border border-[#E8E5E0] text-xs text-[#4A4A4A] rounded-xl hover:bg-[#F2EFE9] transition">
            <Download size={13} /> 导出
          </button>
          <label className={`flex items-center gap-1.5 px-3 py-2 border border-[#E8E5E0] text-xs rounded-xl cursor-pointer transition ${importing ? 'opacity-50 cursor-not-allowed' : 'text-[#4A4A4A] hover:bg-[#F2EFE9]'}`}>
            <Upload size={13} /> {importing ? '导入中...' : '批量导入'}
            <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleImport} disabled={importing} />
          </label>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#1A1A1A] text-white text-sm rounded-xl hover:bg-[#333] transition apple-press">
            <Plus size={15} /> 添加学生
          </button>
        </div>
      </div>

      {/* 导入结果提示 */}
      {importResult && (
        <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl text-xs border ${importResult.failed > 0 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
          <span>导入完成：成功 {importResult.success} 条，跳过 {importResult.skipped} 条{importResult.failed > 0 ? `，失败 ${importResult.failed} 条` : ''}</span>
          <button onClick={() => setImportResult(null)} className="ml-4 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* 搜索框 */}
      <div className="relative" style={settle(50)}>
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#C0BDB8]" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="搜索姓名或学号..."
          className="w-full pl-9 pr-4 py-2 rounded-xl border border-[#E8E5E0] bg-white text-sm outline-none focus:border-[#1A1A1A] transition" />
      </div>

      {/* 列表卡片 */}
      <div className="flex-1 bg-white rounded-2xl border border-[#F0EDE8] shadow-sm overflow-hidden" style={settle(100)}>
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-sm text-[#9A9A9A]">加载中...</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-sm text-[#9A9A9A]">
            {search ? '没有匹配的学生' : '暂无学生账号，点击「添加学生」创建'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F0EDE8] bg-[#FAFAF9]">
                {['姓名', '学号', '年级/专业', '状态', '创建时间', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs text-[#9A9A9A] font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((u, i) => {
                const profile = u.profile as { student_id?: string; grade?: string; major?: string } | null
                return (
                  <tr
                    key={u.id}
                    className="border-b border-[#F8F6F3] hover:bg-[#FAFAF9] transition"
                    style={{ animation: `appleFadeUp 0.55s cubic-bezier(0.25, 1, 0.5, 1) ${Math.min(160 + i * 45, 600)}ms both` }}
                  >
                    <td className="px-4 py-3 font-medium text-[#1A1A1A]">{u.display_name || '—'}</td>
                    <td className="px-4 py-3 text-[#4A4A4A]">{profile?.student_id || '—'}</td>
                    <td className="px-4 py-3 text-[#6A6A6A]">
                      {profile?.grade && profile?.major ? `${profile.grade}级 · ${profile.major}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        u.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
                      }`}>
                        {u.is_active ? '正常' : '禁用'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#9A9A9A] text-xs">{String(u.created_at).slice(0, 10)}</td>
                    <td className="px-4 py-3 relative">
                      <button
                        onClick={() => setMenuOpen(menuOpen === u.id ? null : u.id)}
                        className="p-1 text-[#C0BDB8] hover:text-[#1A1A1A] transition rounded-lg hover:bg-[#F2EFE9]"
                      >
                        <MoreHorizontal size={16} />
                      </button>
                      {menuOpen === u.id && (
                        <div
                          className="absolute right-4 top-10 z-20 bg-white border border-[#F0EDE8] rounded-xl shadow-md py-1 min-w-[140px]"
                          style={{ animation: 'applePopIn 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275) both' }}
                          onMouseLeave={() => setMenuOpen(null)}>
                          <button
                            onClick={() => { setEditTarget(u); setMenuOpen(null) }}
                            className="flex items-center gap-2 w-full px-4 py-2 text-xs text-[#4A4A4A] hover:bg-[#F2EFE9] transition">
                            <Pencil size={13} />编辑信息
                          </button>
                          <button
                            onClick={() => { toggleActive.mutate(u); setMenuOpen(null) }}
                            className="flex items-center gap-2 w-full px-4 py-2 text-xs text-[#4A4A4A] hover:bg-[#F2EFE9] transition">
                            {u.is_active ? <><UserX size={13} />禁用账号</> : <><UserCheck size={13} />启用账号</>}
                          </button>
                          <button
                            onClick={() => { setResetTarget(u); setMenuOpen(null) }}
                            className="flex items-center gap-2 w-full px-4 py-2 text-xs text-[#4A4A4A] hover:bg-[#F2EFE9] transition">
                            <KeyRound size={13} />重置密码
                          </button>
                          <div className="h-px bg-[#F0EDE8] my-1" />
                          <button
                            onClick={() => {
                              if (confirm(`确定删除学生 "${u.display_name || u.username}" 吗？`)) deleteMut.mutate(u.id)
                              setMenuOpen(null)
                            }}
                            className="flex items-center gap-2 w-full px-4 py-2 text-xs text-red-500 hover:bg-red-50 transition">
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
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="px-3 py-1.5 rounded-lg border border-[#E8E5E0] text-xs text-[#4A4A4A] disabled:opacity-40 hover:bg-[#F2EFE9] transition">
            上一页
          </button>
          <span className="text-xs text-[#9A9A9A]">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="px-3 py-1.5 rounded-lg border border-[#E8E5E0] text-xs text-[#4A4A4A] disabled:opacity-40 hover:bg-[#F2EFE9] transition">
            下一页
          </button>
        </div>
      )}

      {showCreate && <CreateStudentModal onClose={() => setShowCreate(false)} />}
      {resetTarget && <ResetPasswordModal user={resetTarget} onClose={() => setResetTarget(null)} />}
      {editTarget && <EditStudentModal user={editTarget} onClose={() => setEditTarget(null)} />}
    </div>
  )
}
