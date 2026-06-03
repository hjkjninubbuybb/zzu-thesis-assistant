import { useState, useRef } from 'react';
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { FileDown, Upload, Search, X } from 'lucide-react';
import { userService } from '../services/userService';
import { MentorCard } from './MentorCard';
import { AddStudentsModal } from './AddStudentsModal';
import { extractError } from '@shared/lib/errorHandler';
import type { UserInfo, ImportResult } from '@shared/types/api';

export function MentorRelationsTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [addTarget, setAddTarget] = useState<UserInfo | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 获取所有教师
  const { data: teachersData, isLoading: loadingTeachers } = useQuery({
    queryKey: ['users', 'teacher', 'all'],
    queryFn: () => userService.list({ role: 'teacher', page: 1, page_size: 100 }),
  });

  const teachers = teachersData?.items ?? [];

  // 并行获取每个教师名下的学生
  const studentQueries = useQueries({
    queries: teachers.map((t) => ({
      queryKey: ['mentor-students', t.id],
      queryFn: () => userService.listMentorStudents(t.id),
      enabled: teachers.length > 0,
    })),
  });

  // 批量导入
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const result = await userService.importMentorRelations(file);
      setImportResult({ ...result, skipped: 0 });
      qc.invalidateQueries({ queryKey: ['mentor-students'] });
    } catch (err) {
      setImportResult({
        total: 0,
        success: 0,
        skipped: 0,
        failed: 1,
        errors: [{ row: 0, reason: extractError(err) }],
      });
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  // 搜索过滤教师
  const filtered = search.trim()
    ? teachers.filter((t) => {
        const profile = t.profile as {
          employee_id?: string;
          department?: string;
        } | null;
        return (
          t.display_name.includes(search) ||
          (profile?.employee_id ?? '').includes(search) ||
          (profile?.department ?? '').includes(search)
        );
      })
    : teachers;

  const settle = (d: number): React.CSSProperties => ({
    animation: `appleSettleIn 0.75s cubic-bezier(0.25, 1, 0.5, 1) ${d}ms both`,
  });

  return (
    <div className="flex flex-col gap-5">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between shrink-0" style={settle(0)}>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#C0BDB8]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索教师..."
            className="pl-9 pr-4 py-2.5 rounded-xl border border-[#E8E4DC] bg-white text-sm outline-none focus:ring-2 focus:ring-slate-400 transition-all w-64"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => userService.downloadRelationsTemplate()}
            className="flex items-center gap-1.5 px-3.5 py-2.5 border border-[#E8E4DC] text-sm text-[#334155] rounded-xl hover:bg-[#F8F6F2] transition-colors"
          >
            <FileDown size={14} /> 下载模板
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
        </div>
      </div>

      {/* 导入结果提示 */}
      {importResult && (
        <div
          className={`flex items-center justify-between px-5 py-3 rounded-xl text-sm border ${importResult.failed > 0 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'} animate-apple-fade`}
        >
          <span>
            导入完成：成功 {importResult.success} 条
            {importResult.failed > 0 ? `，失败 ${importResult.failed} 条` : ''}
          </span>
          <button
            onClick={() => setImportResult(null)}
            className="ml-4 opacity-60 hover:opacity-100 transition-opacity"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* 教师卡片列表 */}
      {loadingTeachers ? (
        <div className="flex items-center justify-center h-48 text-sm text-[#9A9A9A]">
          加载中...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-sm text-[#9A9A9A]">
          {search ? '没有匹配的教师' : '暂无教师，请先在「教师管理」中添加'}
        </div>
      ) : (
        <div className="flex flex-col gap-3" style={settle(50)}>
          {filtered.map((teacher, ti) => {
            const origIdx = teachers.findIndex((t) => t.id === teacher.id);
            const sq = studentQueries[origIdx];
            const students: UserInfo[] = sq?.data ?? [];
            const isLoadingStudents = sq?.isLoading ?? true;

            return (
              <MentorCard
                key={teacher.id}
                teacher={teacher}
                students={students}
                isLoadingStudents={isLoadingStudents}
                animationDelay={Math.min(100 + ti * 60, 500)}
                onAddStudents={setAddTarget}
              />
            );
          })}
        </div>
      )}

      {/* 添加学生弹窗 */}
      {addTarget && (
        <AddStudentsModal
          mentor={addTarget}
          existingStudentIds={
            new Set(
              (studentQueries[teachers.findIndex((t) => t.id === addTarget.id)]?.data ?? []).map(
                (s) => s.id,
              ),
            )
          }
          onClose={() => setAddTarget(null)}
        />
      )}
    </div>
  );
}

export default MentorRelationsTab;
