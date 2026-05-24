import { useState, useRef } from "react";
import {
  useQuery,
  useQueries,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { FileDown, Upload, Search, X, UserPlus } from "lucide-react";
import { userApi, extractError } from "@/lib/api";
import type { UserInfo, ImportResult } from "@/types/api";

// ── 添加学生弹窗 ──────────────────────────────────────────

function AddStudentsModal({
  mentor,
  existingStudentIds,
  onClose,
}: {
  mentor: UserInfo;
  existingStudentIds: Set<number>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const { data } = useQuery({
    queryKey: ["users", "student", "all-for-bind"],
    queryFn: () => userApi.list({ role: "student", page: 1, page_size: 500 }),
  });

  const addMut = useMutation({
    mutationFn: () =>
      userApi.addMentorRelations(mentor.id, Array.from(selected)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mentor-students", mentor.id] });
      onClose();
    },
  });

  const allStudents = data?.items ?? [];
  const available = allStudents.filter((s) => !existingStudentIds.has(s.id));
  const filtered = search.trim()
    ? available.filter((s) => {
        const profile = s.profile as { student_id?: string } | null;
        return (
          s.display_name.includes(search) ||
          (profile?.student_id ?? "").includes(search)
        );
      })
    : available;

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-apple-fade">
      <div className="glass-card rounded-2xl p-6 w-full max-w-md animate-apple-pop flex flex-col max-h-[80vh]">
        <h2 className="text-base font-semibold text-[#334155] mb-1">
          为 {mentor.display_name || mentor.username} 添加学生
        </h2>
        <p className="text-xs text-[#9A9A9A] mb-3">勾选要绑定的学生，可多选</p>

        <div className="relative mb-3">
          <Search
            size={13}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#C0BDB8]"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索姓名或学号..."
            className="w-full pl-8 pr-4 py-2 rounded-lg border border-[#E8E5E0] bg-[#FAFAF9] text-sm outline-none focus:border-slate-400 transition"
          />
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar border border-[#F0EDE8] rounded-xl divide-y divide-[#F8F6F3]">
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-[#9A9A9A]">
              {search ? "没有匹配的学生" : "暂无可绑定的学生"}
            </div>
          ) : (
            filtered.map((s) => {
              const profile = s.profile as { student_id?: string } | null;
              return (
                <label
                  key={s.id}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#F8F6F2] cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => toggle(s.id)}
                    className="accent-slate-700"
                  />
                  <span className="text-sm text-[#334155] font-medium">
                    {s.display_name || "—"}
                  </span>
                  <span className="text-xs text-[#9A9A9A] font-mono">
                    {profile?.student_id || ""}
                  </span>
                </label>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-[#9A9A9A]">
            已选 {selected.size} 人
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-[#6A6A6A]"
            >
              取消
            </button>
            <button
              onClick={() => addMut.mutate()}
              disabled={addMut.isPending || selected.size === 0}
              className="px-4 py-2 bg-slate-700 text-white text-sm rounded-xl hover:bg-slate-800 disabled:opacity-50 transition"
            >
              {addMut.isPending ? "绑定中..." : "确认绑定"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 主组件 ─────────────────────────────────────────────────

export function MentorRelationsTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [addTarget, setAddTarget] = useState<UserInfo | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 获取所有教师
  const { data: teachersData, isLoading: loadingTeachers } = useQuery({
    queryKey: ["users", "teacher", "all"],
    queryFn: () => userApi.list({ role: "teacher", page: 1, page_size: 100 }),
  });

  const teachers = teachersData?.items ?? [];

  // 并行获取每个教师名下的学生
  const studentQueries = useQueries({
    queries: teachers.map((t) => ({
      queryKey: ["mentor-students", t.id],
      queryFn: () => userApi.listMentorStudents(t.id),
      enabled: teachers.length > 0,
    })),
  });

  // 解绑
  const removeMut = useMutation({
    mutationFn: ({
      mentorId,
      studentId,
    }: {
      mentorId: number;
      studentId: number;
    }) => userApi.removeMentorRelation(mentorId, studentId),
    onSuccess: (_, { mentorId }) => {
      qc.invalidateQueries({ queryKey: ["mentor-students", mentorId] });
    },
  });

  // 批量导入
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const result = await userApi.importMentorRelations(file);
      setImportResult({ ...result, skipped: 0 });
      qc.invalidateQueries({ queryKey: ["mentor-students"] });
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
      e.target.value = "";
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
          (profile?.employee_id ?? "").includes(search) ||
          (profile?.department ?? "").includes(search)
        );
      })
    : teachers;

  const settle = (d: number): React.CSSProperties => ({
    animation: `appleSettleIn 0.75s cubic-bezier(0.25, 1, 0.5, 1) ${d}ms both`,
  });

  return (
    <div className="flex flex-col gap-5">
      {/* 顶部操作栏 */}
      <div
        className="flex items-center justify-between shrink-0"
        style={settle(0)}
      >
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#C0BDB8]"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索教师..."
            className="pl-9 pr-4 py-2.5 rounded-xl border border-[#E8E4DC] bg-white text-sm outline-none focus:ring-2 focus:ring-slate-400 transition-all w-64"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => userApi.downloadRelationsTemplate()}
            className="flex items-center gap-1.5 px-3.5 py-2.5 border border-[#E8E4DC] text-sm text-[#334155] rounded-xl hover:bg-[#F8F6F2] transition-colors"
          >
            <FileDown size={14} /> 下载模板
          </button>
          <label
            className={`flex items-center gap-1.5 px-3.5 py-2.5 border border-[#E8E4DC] text-sm rounded-xl cursor-pointer transition-colors ${importing ? "opacity-50 cursor-not-allowed" : "text-[#334155] hover:bg-[#F8F6F2]"}`}
          >
            <Upload size={14} /> {importing ? "导入中..." : "批量导入"}
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
          className={`flex items-center justify-between px-5 py-3 rounded-xl text-sm border ${importResult.failed > 0 ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-emerald-50 border-emerald-200 text-emerald-700"} animate-apple-fade`}
        >
          <span>
            导入完成：成功 {importResult.success} 条
            {importResult.failed > 0 ? `，失败 ${importResult.failed} 条` : ""}
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
          {search ? "没有匹配的教师" : "暂无教师，请先在「教师管理」中添加"}
        </div>
      ) : (
        <div className="flex flex-col gap-3" style={settle(50)}>
          {filtered.map((teacher, ti) => {
            const profile = teacher.profile as {
              employee_id?: string;
              department?: string;
              title?: string;
            } | null;
            // 找到该教师在 teachers 数组中的原始索引（用于 studentQueries 对齐）
            const origIdx = teachers.findIndex((t) => t.id === teacher.id);
            const sq = studentQueries[origIdx];
            const students: UserInfo[] = sq?.data ?? [];
            const isLoadingStudents = sq?.isLoading ?? true;

            return (
              <div
                key={teacher.id}
                className="border border-[#F0EDE8] rounded-2xl bg-white/50 p-5"
                style={{
                  animation: `appleFadeUp 0.55s cubic-bezier(0.25, 1, 0.5, 1) ${Math.min(100 + ti * 60, 500)}ms both`,
                }}
              >
                {/* 教师信息头 */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-semibold text-white select-none shrink-0">
                      {(teacher.display_name || teacher.username).slice(0, 1)}
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-[#334155]">
                        {teacher.display_name || teacher.username}
                      </span>
                      <div className="flex items-center gap-2 mt-0.5">
                        {profile?.employee_id && (
                          <span className="text-[11px] text-[#9A9A9A] font-mono">
                            {profile.employee_id}
                          </span>
                        )}
                        {profile?.department && (
                          <span className="text-[11px] text-[#9A9A9A]">
                            {profile.department}
                          </span>
                        )}
                        {profile?.title && (
                          <span className="text-[11px] text-[#9A9A9A]">
                            {profile.title}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-[#9A9A9A]">
                    {isLoadingStudents ? "..." : `${students.length} 名学生`}
                  </span>
                </div>

                {/* 学生标签区 */}
                <div className="flex flex-wrap items-center gap-2">
                  {isLoadingStudents ? (
                    <span className="text-xs text-[#C0BDB8]">加载中...</span>
                  ) : students.length === 0 ? (
                    <span className="text-xs text-[#C0BDB8]">暂无学生</span>
                  ) : (
                    students.map((s) => {
                      const sp = s.profile as { student_id?: string } | null;
                      return (
                        <span
                          key={s.id}
                          className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg bg-[#F2EFE9] text-xs text-[#4A4A4A] font-medium group"
                        >
                          {s.display_name || "—"}
                          {sp?.student_id && (
                            <span className="text-[#9A9A9A] font-mono text-[10px]">
                              {sp.student_id}
                            </span>
                          )}
                          <button
                            onClick={() =>
                              removeMut.mutate({
                                mentorId: teacher.id,
                                studentId: s.id,
                              })
                            }
                            className="ml-0.5 p-0.5 rounded text-[#C0BDB8] hover:text-red-400 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                            title="解绑"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      );
                    })
                  )}
                  <button
                    onClick={() => setAddTarget(teacher)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-dashed border-[#D8D4CC] text-xs text-[#9A9A9A] hover:text-[#334155] hover:border-slate-400 transition-colors"
                  >
                    <UserPlus size={12} /> 添加学生
                  </button>
                </div>
              </div>
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
              (
                studentQueries[teachers.findIndex((t) => t.id === addTarget.id)]
                  ?.data ?? []
              ).map((s) => s.id),
            )
          }
          onClose={() => setAddTarget(null)}
        />
      )}
    </div>
  );
}

export default MentorRelationsTab;
