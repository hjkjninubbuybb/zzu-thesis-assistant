import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Download, Upload, FileDown } from 'lucide-react';
import { userService } from '../services/userService';
import { userKeys } from '../hooks/queryKeys';
import { useTeacherList } from '../hooks/useTeacherList';
import { TeacherTable } from './TeacherTable';
import { CreateTeacherModal, EditTeacherModal, TeacherResetPasswordModal } from './TeacherModals';
import { extractError } from '@shared/lib/errorHandler';
import type { UserInfo } from '@shared/types/api';

type ImportResult = {
  total: number;
  success: number;
  skipped: number;
  failed: number;
  errors: unknown[];
};

export function TeachersTab() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [resetTarget, setResetTarget] = useState<UserInfo | null>(null);
  const [editTarget, setEditTarget] = useState<UserInfo | null>(null);
  const [menuOpen, setMenuOpen] = useState<number | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { teachers, total, isLoading, toggleActive, deleteUser } = useTeacherList(page, 20);

  const totalPages = Math.ceil(total / 20) || 1;

  const filtered = search.trim()
    ? teachers.filter(
        (u) =>
          u.display_name.includes(search) ||
          ((u.profile as { employee_id?: string })?.employee_id ?? '').includes(search),
      )
    : teachers;

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const result = await userService.importTeachers(file);
      setImportResult(result);
      qc.invalidateQueries({ queryKey: userKeys.all() });
    } catch (err) {
      setImportResult({
        total: 0,
        success: 0,
        skipped: 0,
        failed: 1,
        errors: [extractError(err)],
      });
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const settle = (d: number): React.CSSProperties => ({
    animation: `appleSettleIn 0.75s cubic-bezier(0.25, 1, 0.5, 1) ${d}ms both`,
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between shrink-0" style={settle(0)}>
        <p className="text-sm text-[#8A8A8A]">共 {total} 名教师</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => userService.downloadTeacherTemplate()}
            className="flex items-center gap-1.5 px-3.5 py-2.5 border border-[#E8E4DC] text-sm text-[#334155] rounded-xl hover:bg-[#F8F6F2] transition-colors"
          >
            <FileDown size={14} /> 下载模板
          </button>
          <button
            onClick={() => userService.exportTeachers()}
            className="flex items-center gap-1.5 px-3.5 py-2.5 border border-[#E8E4DC] text-sm text-[#334155] rounded-xl hover:bg-[#F8F6F2] transition-colors"
          >
            <Download size={14} /> 导出
          </button>
          <label
            className={`flex items-center gap-1.5 px-3.5 py-2.5 border border-[#E8E4DC] text-sm rounded-xl cursor-pointer transition-colors ${importing ? 'opacity-50 cursor-not-allowed' : 'text-[#334155] hover:bg-[#F8F6F2]'}`}
          >
            <Upload size={14} /> {importing ? '导入中...' : '批量导入'}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={handleImport}
              disabled={importing}
            />
          </label>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 text-white text-sm rounded-xl hover:bg-slate-800 transition-colors shadow-sm active:scale-[0.98]"
          >
            <Plus size={15} /> 添加教师
          </button>
        </div>
      </div>

      {importResult && (
        <div
          className={`flex items-center justify-between px-4 py-2.5 rounded-xl text-xs border ${importResult.failed > 0 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}
        >
          <span>
            导入完成：成功 {importResult.success} 条，跳过 {importResult.skipped} 条
            {importResult.failed > 0 ? `，失败 ${importResult.failed} 条` : ''}
          </span>
          <button
            onClick={() => setImportResult(null)}
            className="ml-4 opacity-60 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      <div className="relative" style={settle(50)}>
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#C0BDB8]" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索姓名或工号..."
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[#E8E4DC] bg-white text-sm outline-none focus:ring-2 focus:ring-slate-400 transition-all"
        />
      </div>

      <div
        className="flex-1 border border-[#F0EDE8] rounded-2xl overflow-hidden bg-white/50"
        style={settle(100)}
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-sm text-[#9A9A9A]">
            加载中...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-sm text-[#9A9A9A]">
            {search ? '没有匹配的教师' : '暂无教师账号，点击「添加教师」创建'}
          </div>
        ) : (
          <TeacherTable
            teachers={filtered}
            menuOpen={menuOpen}
            onMenuToggle={setMenuOpen}
            onEdit={setEditTarget}
            onToggleActive={(u) => toggleActive({ id: u.id, isActive: !u.is_active })}
            onResetPassword={setResetTarget}
            onDelete={(u) => {
              if (confirm(`确定删除教师 "${u.display_name || u.username}" 吗？`)) deleteUser(u.id);
            }}
          />
        )}
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-2" style={settle(150)}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 rounded-xl border border-[#E8E4DC] text-xs font-medium text-[#4A4A4A] disabled:opacity-30 hover:bg-[#F8F6F2] transition-all"
          >
            上一页
          </button>
          <div className="bg-[#F2EFE9] px-3 py-1 rounded-full text-[10px] font-bold text-[#8A8A8A] uppercase tracking-wider">
            {page} / {totalPages}
          </div>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 rounded-xl border border-[#E8E4DC] text-xs font-medium text-[#4A4A4A] disabled:opacity-30 hover:bg-[#F8F6F2] transition-all"
          >
            下一页
          </button>
        </div>
      )}

      {showCreate && <CreateTeacherModal onClose={() => setShowCreate(false)} />}
      {resetTarget && (
        <TeacherResetPasswordModal user={resetTarget} onClose={() => setResetTarget(null)} />
      )}
      {editTarget && <EditTeacherModal user={editTarget} onClose={() => setEditTarget(null)} />}
    </div>
  );
}

export default TeachersTab;
