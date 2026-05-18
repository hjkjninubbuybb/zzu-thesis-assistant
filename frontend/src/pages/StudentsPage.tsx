import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, MoreHorizontal, UserCheck, UserX, KeyRound, Trash2, Download, Upload, FileDown, Pencil } from 'lucide-react'
import { userApi, extractError } from '@/lib/api'
import type { UserInfo, UserCreate, StudentProfileCreate, ImportResult } from '@/types/api'
import { useAuth } from '@/hooks/useAuth'

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
        className="px-3 py-2 rounded-lg border border-[#E8E5E0] bg-[#FAFAF9] text-sm outline-none focus:border-slate-400 transition"
      />
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-apple-fade">
      <div className="glass-card rounded-2xl p-6 w-full max-w-md animate-apple-pop">
        <h2 className="text-base font-semibold text-[#334155] mb-4">添加学生账号</h2>
        <div className="flex flex-col gap-3">
          {field('student_id', '学号 *', '如 202212345678')}
          {field('password', '初始密码 *', '至少 6 位', 'password')}
          {field('display_name', '姓名', '学生真实姓名')}
          <div className="flex gap-3">
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-xs text-[#6A6A6A] font-medium">年级</label>
              <input type="text" value={form.grade ?? ''} onChange={e => setForm(p => ({...p, grade: e.target.value}))}
                placeholder="如 2022" className="px-3 py-2 rounded-lg border border-[#E8E5E0] bg-[#FAFAF9] text-sm outline-none focus:border-slate-400 transition" />
            </div>
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-xs text-[#6A6A6A] font-medium">班级</label>
              <input type="text" value={form.class_name ?? ''} onChange={e => setForm(p => ({...p, class_name: e.target.value}))}
                placeholder="如 计科一班" className="px-3 py-2 rounded-lg border border-[#E8E5E0] bg-[#FAFAF9] text-sm outline-none focus:border-slate-400 transition" />
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
            className="px-4 py-2 bg-slate-700 text-white text-sm rounded-xl hover:bg-slate-800 disabled:opacity-50 transition"
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
        className="px-3 py-2 rounded-lg border border-[#E8E5E0] bg-[#FAFAF9] text-sm outline-none focus:border-slate-400 transition"
      />
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-apple-fade">
      <div className="glass-card rounded-2xl p-6 w-full max-w-md animate-apple-pop">
        <h2 className="text-base font-semibold text-[#334155] mb-4">编辑学生信息</h2>
        <div className="flex flex-col gap-3">
          {field('student_id', '学号', '如 202212345678')}
          {field('display_name', '姓名', '学生真实姓名')}
          <div className="flex gap-3">
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-xs text-[#6A6A6A] font-medium">年级</label>
              <input type="text" value={form.grade} onChange={e => setForm(p => ({...p, grade: e.target.value}))}
                placeholder="如 2022" className="px-3 py-2 rounded-lg border border-[#E8E5E0] bg-[#FAFAF9] text-sm outline-none focus:border-slate-400 transition" />
            </div>
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-xs text-[#6A6A6A] font-medium">班级</label>
              <input type="text" value={form.class_name} onChange={e => setForm(p => ({...p, class_name: e.target.value}))}
                placeholder="如 计科一班" className="px-3 py-2 rounded-lg border border-[#E8E5E0] bg-[#FAFAF9] text-sm outline-none focus:border-slate-400 transition" />
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
            className="px-4 py-2 bg-slate-700 text-white text-sm rounded-xl hover:bg-slate-800 disabled:opacity-50 transition"
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
  const { isAdmin } = useAuth()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [resetTarget, setResetTarget] = useState<UserInfo | null>(null)
  const [editTarget, setEditTarget] = useState<UserInfo | null>(null)
  const [menuOpen, setMenuOpen] = useState<number | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importing, setImporting] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const relationFileInputRef = useRef<HTMLInputElement>(null)

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
      setImportResult({ total: 0, success: 0, skipped: 0, failed: 1, errors: [{ row: 0, reason: extractError(err) }] })
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  const handleImportRelations = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportResult(null)
    try {
      const result = await userApi.importMentorRelations(file)
      setImportResult({ ...result, skipped: 0 })
      qc.invalidateQueries({ queryKey: ['users'] })
    } catch (err) {
      setImportResult({ total: 0, success: 0, skipped: 0, failed: 1, errors: [{ row: 0, reason: extractError(err) }] })
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
    <div className="px-8 py-8 flex-1 overflow-y-auto glass-card rounded-2xl custom-scrollbar flex flex-col gap-5">
      {/* 头部 */}
      <div className="flex items-center justify-between shrink-0" style={settle(0)}>
        <div>
          <h1 className="text-2xl font-bold text-[#334155]">学生管理</h1>
          <p className="mt-1 text-sm text-[#8A8A8A]">共 {total} 名学生</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <div className="relative group">
              <button className="flex items-center gap-1.5 px-3.5 py-2.5 border border-[#E8E4DC] text-sm text-[#334155] rounded-xl hover:bg-[#F8F6F2] transition-colors">
                <FileDown size={14} /> 下载模板
              </button>
              <div className="absolute right-0 top-full mt-1 hidden group-hover:block z-20 bg-white border border-[#F0EDE8] rounded-xl shadow-xl py-1 min-w-[160px]">
                <button onClick={() => userApi.downloadTemplate()} className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs text-[#4A4A4A] hover:bg-[#F8F6F2] transition-colors">
                  学生账号模板
                </button>
                <button onClick={() => userApi.downloadRelationsTemplate()} className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs text-[#4A4A4A] hover:bg-[#F8F6F2] transition-colors">
                  师生关系模板
                </button>
              </div>
            </div>
            
            <button onClick={() => userApi.exportStudents()}
              className="flex items-center gap-1.5 px-3.5 py-2.5 border border-[#E8E4DC] text-sm text-[#334155] rounded-xl hover:bg-[#F8F6F2] transition-colors">
              <Download size={14} /> 导出
            </button>

            <div className="relative group">
              <button disabled={importing} className={`flex items-center gap-1.5 px-3.5 py-2.5 border border-[#E8E4DC] text-sm rounded-xl transition-colors ${importing ? 'opacity-50 cursor-not-allowed' : 'text-[#334155] hover:bg-[#F8F6F2]'}`}>
                <Upload size={14} /> {importing ? '导入中...' : '批量导入'}
              </button>
              {!importing && (
                <div className="absolute right-0 top-full mt-1 hidden group-hover:block z-20 bg-white border border-[#F0EDE8] rounded-xl shadow-xl py-1 min-w-[160px]">
                  <label className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs text-[#4A4A4A] hover:bg-[#F8F6F2] cursor-pointer transition-colors">
                    导入学生账号
                    <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleImport} />
                  </label>
                  <label className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs text-[#4A4A4A] hover:bg-[#F8F6F2] cursor-pointer transition-colors">
                    导入师生关系
                    <input ref={relationFileInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleImportRelations} />
                  </label>
                </div>
              )}
            </div>

            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 text-white text-sm rounded-xl hover:bg-slate-800 transition-colors shadow-sm active:scale-[0.98]">
              <Plus size={15} /> 添加学生
            </button>
          </div>
        )}
      </div>

      {/* 导入结果提示 */}
      {importResult && (
        <div className={`flex items-center justify-between px-5 py-3 rounded-xl text-sm border ${importResult.failed > 0 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'} animate-apple-fade`}>
          <span>导入完成：成功 {importResult.success} 条，跳过 {importResult.skipped} 条{importResult.failed > 0 ? `，失败 ${importResult.failed} 条` : ''}</span>
          <button onClick={() => setImportResult(null)} className="ml-4 opacity-60 hover:opacity-100 transition-opacity">✕</button>
        </div>
      )}

      {/* 搜索框 */}
      <div className="relative" style={settle(50)}>
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#C0BDB8]" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="搜索姓名或学号..."
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[#E8E4DC] bg-white text-sm outline-none focus:ring-2 focus:ring-slate-400 transition-all" />
      </div>

      {/* 列表卡片 */}
      <div className="flex-1 border border-[#F0EDE8] rounded-2xl overflow-hidden bg-white/50" style={settle(100)}>
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-sm text-[#9A9A9A]">加载中...</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-sm text-[#9A9A9A]">
            {search ? '没有匹配的学生' : '暂无学生账号，点击「添加学生」创建'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F0EDE8] bg-[#FAFAF9]/50">
                {['姓名', '学号', '年级/专业', '状态', '创建时间', ''].map(h => (
                  <th key={h} className="text-left px-5 py-3.5 text-xs text-[#9A9A9A] font-bold uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((u, i) => {
                const profile = u.profile as { student_id?: string; grade?: string; major?: string } | null
                return (
                  <tr
                    key={u.id}
                    className="border-b border-[#F8F6F3] hover:bg-white transition-colors"
                    style={{ animation: `appleFadeUp 0.55s cubic-bezier(0.25, 1, 0.5, 1) ${Math.min(160 + i * 45, 600)}ms both` }}
                  >
                    <td className="px-5 py-4 font-semibold text-[#334155]">{u.display_name || '—'}</td>
                    <td className="px-5 py-4 text-[#4A4A4A] font-mono text-xs">{profile?.student_id || '—'}</td>
                    <td className="px-5 py-4 text-[#6A6A6A]">
                      {profile?.grade && profile?.major ? `${profile.grade}级 · ${profile.major}` : '—'}
                    </td>
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
                          {isAdmin && (
                            <>
                              <div className="h-px bg-[#F0EDE8] my-1" />
                              <button
                                onClick={() => {
                                  if (confirm(`确定删除学生 "${u.display_name || u.username}" 吗？`)) deleteMut.mutate(u.id)
                                  setMenuOpen(null)
                                }}
                                className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs text-red-500 hover:bg-red-50 transition-colors">
                                <Trash2 size={13} />删除账号
                              </button>
                            </>
                          )}
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

      {showCreate && <CreateStudentModal onClose={() => setShowCreate(false)} />}
      {resetTarget && <ResetPasswordModal user={resetTarget} onClose={() => setResetTarget(null)} />}
      {editTarget && <EditStudentModal user={editTarget} onClose={() => setEditTarget(null)} />}
    </div>
  )
}
