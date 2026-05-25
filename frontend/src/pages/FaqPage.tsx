import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  MessageSquareQuote,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  Search,
  Hash,
  Sparkles,
  Upload,
  Download,
  FileText,
  CheckCircle2,
  Clock,
  User,
} from "lucide-react";
import { knowledgeApi, faqApi, extractError } from "@/lib/api";
import type {
  FAQItem,
  FAQCreate,
  FAQUpdate,
  FAQImportResult,
} from "@/types/api";
import { useAuth } from "@/hooks/useAuth";
import { Toast } from "@/components/ui/Toast";

// ── 状态标签 ──────────────────────────────────────────────

function StatusBadge({ status }: { status: FAQItem["status"] }) {
  const map = {
    draft: { label: "草稿", color: "bg-slate-100 text-slate-500" },
    pending: { label: "待审核", color: "bg-amber-100 text-amber-600" },
    approved: { label: "已发布", color: "bg-emerald-100 text-emerald-600" },
    rejected: { label: "已驳回", color: "bg-red-100 text-red-600" },
  };
  const config = map[status] || map.pending;
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${config.color}`}
    >
      {config.label}
    </span>
  );
}

// ── FAQ 编辑对话框 ─────────────────────────────────────────

interface FaqDialogProps {
  title: string;
  initial?: Partial<FAQCreate>;
  loading: boolean;
  onClose: () => void;
  onSubmit: (data: FAQCreate) => void;
}

function FaqDialog({
  title,
  initial,
  loading,
  onClose,
  onSubmit,
}: FaqDialogProps) {
  const [question, setQuestion] = useState(initial?.question ?? "");
  const [answer, setAnswer] = useState(initial?.answer ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [sortOrder, setSortOrder] = useState(initial?.sort_order ?? 0);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = () => {
    const e: Record<string, string> = {};
    if (!question.trim()) e.question = "问题不能为空";
    if (!answer.trim()) e.answer = "答案不能为空";
    if (Object.keys(e).length) {
      setErrors(e);
      return;
    }
    onSubmit({
      question: question.trim(),
      answer: answer.trim(),
      category: category.trim(),
      sort_order: sortOrder,
    });
  };

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
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-[#F8F6F2] flex items-center justify-center transition-colors"
          >
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
              onChange={(e) => {
                setQuestion(e.target.value);
                setErrors((v) => ({ ...v, question: "" }));
              }}
              rows={2}
              placeholder="输入学生可能会问的问题..."
              className={`w-full border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-slate-400 resize-none transition-colors placeholder:text-gray-300 ${errors.question ? "border-red-400 bg-red-50" : "border-[#E8E4DC] bg-white"}`}
            />
            {errors.question && (
              <p className="mt-1 text-xs text-red-500">{errors.question}</p>
            )}
          </div>

          {/* 答案 */}
          <div>
            <label className="block text-xs font-semibold text-[#334155] uppercase tracking-wide mb-2">
              标准答案 <span className="text-red-400 normal-case">*</span>
            </label>
            <textarea
              value={answer}
              onChange={(e) => {
                setAnswer(e.target.value);
                setErrors((v) => ({ ...v, answer: "" }));
              }}
              rows={6}
              placeholder="输入官方标准答案，将被向量化用于 RAG 检索..."
              className={`w-full border rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-slate-400 resize-none transition-colors placeholder:text-gray-300 ${errors.answer ? "border-red-400 bg-red-50" : "border-[#E8E4DC] bg-white"}`}
            />
            {errors.answer && (
              <p className="mt-1 text-xs text-red-500">{errors.answer}</p>
            )}
          </div>

          {/* 分类 + 排序 */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-[#334155] uppercase tracking-wide mb-2">
                分类
              </label>
              <div className="relative">
                <Hash
                  size={13}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="如：入学手续、毕业答辩..."
                  className="w-full border border-[#E8E4DC] rounded-xl pl-8 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-slate-400"
                />
              </div>
            </div>
            <div className="w-24">
              <label className="block text-xs font-semibold text-[#334155] uppercase tracking-wide mb-2">
                排序
              </label>
              <input
                type="number"
                min={0}
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
                className="w-full border border-[#E8E4DC] rounded-xl px-3 py-2.5 text-sm text-center outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2.5 px-6 py-4 border-t border-[#F0EDE8] bg-[#FAFAF9] rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-xl border border-[#E8E4DC] hover:bg-[#F8F6F2] transition-colors text-[#334155]"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-5 py-2 text-sm rounded-xl bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50 flex items-center gap-2 transition-colors"
          >
            {loading && <Loader2 size={13} className="animate-spin" />}
            {loading ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 删除确认 ───────────────────────────────────────────────

function ConfirmDeleteDialog({
  question,
  onConfirm,
  onCancel,
  loading,
}: {
  question: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-[2px] flex items-center justify-center z-50 animate-apple-fade">
      <div className="glass-card rounded-2xl p-6 w-full max-w-sm mx-4 animate-apple-pop">
        <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center mb-4">
          <Trash2 size={18} className="text-red-500" />
        </div>
        <h3 className="text-base font-semibold text-[#334155] mb-1">
          删除 FAQ
        </h3>
        <p className="text-sm leading-relaxed" style={{ color: "#8A8A8A" }}>
          将删除{" "}
          <span className="font-medium text-[#334155]">
            "{question.length > 30 ? question.slice(0, 30) + "…" : question}"
          </span>
          ，并从向量库中移除对应向量。此操作不可撤销。
        </p>
        <div className="mt-5 flex gap-2.5 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-xl border border-[#E8E4DC] hover:bg-[#F8F6F2] transition-colors"
          >
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
  );
}

// ── FAQ 卡片（扁平行样式） ─────────────────────────────────

function FaqCard({
  faq,
  onEdit,
  onDelete,
  onToggle,
  onApprove,
}: {
  faq: FAQItem;
  onEdit: (faq: FAQItem) => void;
  onDelete: (faq: FAQItem) => void;
  onToggle: (faq: FAQItem) => void;
  onApprove: (faq: FAQItem) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { user, isAdmin } = useAuth();
  const isOwner = faq.author_id === user?.id;
  const canManage = isAdmin || isOwner;

  return (
    <div
      className={`rounded-xl border border-[#F0EDE8] bg-white transition-colors overflow-hidden ${
        faq.enabled ? "" : "opacity-50"
      }`}
    >
      <div
        className="flex items-center gap-3 px-4 py-3 hover:bg-[#F8F6F2] cursor-pointer transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <StatusBadge status={faq.status} />
        <p className="text-sm text-[#334155] font-medium truncate flex-1 min-w-0">
          {faq.question}
        </p>
        {faq.category && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#F2EFE9] text-[#8A8A8A] shrink-0">
            {faq.category}
          </span>
        )}
        <span
          className="text-xs w-20 text-right shrink-0"
          style={{ color: "#8A8A8A" }}
        >
          {new Date(faq.updated_at).toLocaleDateString()}
        </span>
        <div
          className="flex items-center gap-1 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {isAdmin && faq.status === "pending" && (
            <button
              onClick={() => onApprove(faq)}
              title="通过审核"
              className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 transition-colors"
            >
              <CheckCircle2 size={15} />
            </button>
          )}
          {canManage && (
            <>
              <button
                onClick={() => onToggle(faq)}
                title={faq.enabled ? "禁用" : "启用"}
                className="p-1.5 rounded-lg hover:bg-[#F2EFE9] transition-colors"
              >
                {faq.enabled ? (
                  <ToggleRight size={16} className="text-emerald-500" />
                ) : (
                  <ToggleLeft size={16} className="text-gray-400" />
                )}
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
            </>
          )}
        </div>
        <ChevronDown
          size={15}
          className={`text-[#C0BDB8] transition-transform duration-300 shrink-0 ${expanded ? "rotate-180" : ""}`}
        />
      </div>
      <div
        className={`transition-all duration-300 overflow-hidden ${expanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"}`}
      >
        <div className="px-4 pb-3">
          <div className="p-4 bg-[#F8F6F2] rounded-xl text-sm text-[#4A4A4A] leading-relaxed whitespace-pre-wrap">
            {faq.answer}
          </div>
          <div className="mt-2 flex items-center gap-4 text-[10px] text-[#A0A0A0]">
            <span className="flex items-center gap-1">
              <Clock size={10} /> 更新于{" "}
              {new Date(faq.updated_at).toLocaleDateString()}
            </span>
            {faq.author_id && (
              <span className="flex items-center gap-1">
                <User size={10} /> 提报者 ID: {faq.author_id}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Excel 导入对话框 ───────────────────────────────────────

interface ImportDialogProps {
  kbName: string;
  onClose: () => void;
  onImported: () => void;
  showToast: (msg: string, type?: "success" | "error") => void;
}

function ImportDialog({
  kbName,
  onClose,
  onImported,
  showToast,
}: ImportDialogProps) {
  const [phase, setPhase] = useState<"idle" | "uploading" | "result">("idle");
  const [result, setResult] = useState<FAQImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      showToast("请上传 .xlsx 格式的 Excel 文件", "error");
      return;
    }
    setPhase("uploading");
    try {
      const r = await faqApi.importExcel(kbName, file);
      setResult(r);
      setPhase("result");
      if (r.success > 0) onImported();
    } catch (e) {
      setPhase("idle");
      showToast(extractError(e), "error");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-40 p-4 animate-apple-fade">
      <div className="glass-card rounded-2xl w-full max-w-md animate-apple-pop">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#F0EDE8]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#F2EFE9] flex items-center justify-center">
              <Upload size={14} className="text-[#334155]" />
            </div>
            <h3 className="text-sm font-semibold text-[#334155]">
              从 Excel 导入 FAQ
            </h3>
          </div>
          {phase !== "uploading" && (
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-[#F8F6F2] flex items-center justify-center transition-colors"
            >
              <X size={15} />
            </button>
          )}
        </div>

        <div className="px-6 py-5">
          {phase === "idle" && (
            <>
              <div
                onDrop={handleDrop}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-3 transition-colors ${
                  dragOver
                    ? "border-slate-400 bg-[#F2EFE9]"
                    : "border-[#E8E4DC] hover:border-[#C8C4BC] hover:bg-[#FAFAF9]"
                }`}
              >
                <div className="w-12 h-12 rounded-xl bg-[#F2EFE9] flex items-center justify-center">
                  <FileText
                    size={22}
                    className="text-[#334155]"
                    strokeWidth={1.4}
                  />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-[#334155]">
                    点击选择或拖拽文件到此处
                  </p>
                  <p className="text-xs mt-1" style={{ color: "#A0A0A0" }}>
                    仅支持 .xlsx 格式，文件大小不超过 5MB
                  </p>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={handleFileChange}
              />
              <div
                className="mt-4 flex items-center justify-center gap-1 text-xs"
                style={{ color: "#8A8A8A" }}
              >
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

          {phase === "uploading" && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 size={32} className="animate-spin text-[#334155]" />
              <div className="text-center">
                <p className="text-sm font-semibold text-[#334155]">
                  正在上传并向量化…
                </p>
                <p className="text-xs mt-1" style={{ color: "#A0A0A0" }}>
                  批量向量化可能需要一些时间，请耐心等待
                </p>
              </div>
            </div>
          )}

          {phase === "result" && result && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { label: "总行数", value: result.total, color: "#334155" },
                  { label: "成功", value: result.success, color: "#10B981" },
                  { label: "跳过", value: result.skipped, color: "#F59E0B" },
                  { label: "失败", value: result.failed, color: "#EF4444" },
                ].map(({ label, value, color }) => (
                  <div
                    key={label}
                    className="bg-[#F8F6F2] rounded-xl py-3 px-2"
                  >
                    <p className="text-lg font-bold" style={{ color }}>
                      {value}
                    </p>
                    <p
                      className="text-[11px] mt-0.5"
                      style={{ color: "#8A8A8A" }}
                    >
                      {label}
                    </p>
                  </div>
                ))}
              </div>
              {result.errors.length > 0 && (
                <div className="max-h-48 overflow-y-auto space-y-1.5">
                  <p className="text-xs font-semibold text-[#334155] uppercase tracking-wide mb-2">
                    错误明细
                  </p>
                  {result.errors.map((err, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2.5 bg-red-50 rounded-lg px-3 py-2.5 text-xs"
                    >
                      {err.row > 0 && (
                        <span className="shrink-0 font-mono text-red-400">
                          第{err.row}行
                        </span>
                      )}
                      <span className="text-red-600 flex-1 leading-relaxed">
                        {err.question && (
                          <span className="font-medium text-red-700">
                            "{err.question}" —{" "}
                          </span>
                        )}
                        {err.reason}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {phase === "result" && (
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
  );
}

// ── 统计 pill ──────────────────────────────────────────────

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F2EFE9] rounded-full">
      <span className="text-sm font-bold text-[#334155]">{value}</span>
      <span className="text-xs" style={{ color: "#8A8A8A" }}>
        {label}
      </span>
    </div>
  );
}

// ── 主页面 ─────────────────────────────────────────────────

export function FaqKnowledgeTab() {
  const { isAdmin } = useAuth();
  const FK_STORAGE_KEY = "faq-selected-kb";
  const [selectedKb, setSelectedKb] = useState(
    () => localStorage.getItem(FK_STORAGE_KEY) ?? "",
  );
  const [categoryFilter, setCategoryFilter] = useState("全部");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<FAQItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FAQItem | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<{
    msg: string;
    type: "success" | "error";
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const qc = useQueryClient();
  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText.trim()), 500);
    return () => clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
    };
    if (menuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const { data: kbs } = useQuery({
    queryKey: ["knowledge-bases"],
    queryFn: knowledgeApi.list,
  });

  // 记住上次选中的知识库；若缓存值已不存在于列表中则清除
  useEffect(() => {
    if (!kbs) return;
    const names = kbs.map((kb) => kb.name);
    if (selectedKb && !names.includes(selectedKb)) {
      setSelectedKb("");
      localStorage.removeItem(FK_STORAGE_KEY);
    }
  }, [kbs, selectedKb]);
  const {
    data: faqs = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["faqs", selectedKb],
    queryFn: () => faqApi.list(selectedKb),
    enabled: !!selectedKb,
  });

  const { data: searchData, isFetching: isSearching } = useQuery({
    queryKey: ["faqs-search", selectedKb, debouncedSearch],
    queryFn: () => faqApi.search(selectedKb, debouncedSearch),
    enabled: !!selectedKb && debouncedSearch.length > 0,
    staleTime: 30_000,
  });

  const isAiSearch = debouncedSearch.length > 0;
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["faqs", selectedKb] });

  const createMutation = useMutation({
    mutationFn: (body: FAQCreate) => faqApi.create(selectedKb, body),
    onSuccess: () => {
      invalidate();
      setCreateOpen(false);
      showToast("FAQ 已提交审核");
    },
    onError: (e) => showToast(extractError(e), "error"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: FAQUpdate }) =>
      faqApi.update(selectedKb, id, body),
    onSuccess: () => {
      invalidate();
      setEditTarget(null);
      showToast("FAQ 已更新");
    },
    onError: (e) => showToast(extractError(e), "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => faqApi.delete(selectedKb, id),
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
      showToast("FAQ 已删除");
    },
    onError: (e) => showToast(extractError(e), "error"),
  });

  const allCategories = useMemo(
    () => Array.from(new Set(faqs.map((f) => f.category).filter(Boolean))),
    [faqs],
  );

  const displayFaqs = useMemo(() => {
    let items = isAiSearch ? (searchData?.items ?? []) : faqs;
    if (!isAiSearch && categoryFilter !== "全部")
      items = items.filter((f) => f.category === categoryFilter);
    if (!isAiSearch && statusFilter !== "全部") {
      const statusMap: any = {
        已发布: "approved",
        待审核: "pending",
        已驳回: "rejected",
        草稿: "draft",
      };
      items = items.filter((f) => f.status === statusMap[statusFilter]);
    }
    return items;
  }, [isAiSearch, searchData, faqs, categoryFilter, statusFilter]);

  const settle = (d: number): React.CSSProperties => ({
    animation: `appleSettleIn 0.75s cubic-bezier(0.25, 1, 0.5, 1) ${d}ms both`,
  });

  return (
    <>
      {/* 工具栏 - 单行 */}
      <div className="flex items-center gap-3 flex-wrap" style={settle(0)}>
        <select
          value={selectedKb}
          onChange={(e) => {
            const val = e.target.value;
            setSelectedKb(val);
            if (val) localStorage.setItem(FK_STORAGE_KEY, val);
            else localStorage.removeItem(FK_STORAGE_KEY);
            setCategoryFilter("全部");
            setStatusFilter("全部");
            setSearchText("");
          }}
          className="border border-[#E8E4DC] rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400 bg-white min-w-[140px]"
        >
          <option value="">— 选择知识库 —</option>
          {kbs?.map((kb) => (
            <option key={kb.id} value={kb.name}>
              {kb.name}
            </option>
          ))}
        </select>
        {selectedKb && (
          <>
            <div className="relative flex-1 min-w-[200px]">
              {isSearching ? (
                <Loader2
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A8A8A] animate-spin"
                />
              ) : (
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
              )}
              <input
                value={searchText}
                onChange={(e) => {
                  setSearchText(e.target.value);
                  setCategoryFilter("全部");
                }}
                placeholder="AI 语义搜索 FAQ..."
                className="w-full border border-[#E8E4DC] rounded-xl pl-9 pr-12 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400 bg-white transition-colors"
              />
              <div
                className={`absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all ${isAiSearch ? "bg-violet-100 text-violet-600" : "bg-[#F2EFE9] text-[#8A8A8A]"}`}
              >
                <Sparkles size={10} />
                AI
              </div>
            </div>
            <StatPill label="条 FAQ" value={faqs.length} />
            <StatPill
              label="已发布"
              value={faqs.filter((f) => f.status === "approved").length}
            />
            {isAdmin && (
              <div ref={menuRef} className="relative">
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className="flex items-center gap-2 px-3.5 py-2 border border-[#E8E4DC] text-[#334155] text-sm rounded-xl hover:bg-[#F8F6F2] transition-colors"
                >
                  <Download size={14} />
                  导入/导出
                  <ChevronDown
                    size={12}
                    className={`transition-transform duration-150 ${menuOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {menuOpen && (
                  <div
                    className="absolute right-0 top-full mt-1 bg-white border border-[#F0EDE8] rounded-xl shadow-lg z-30 overflow-hidden w-44 py-1 animate-apple-pop"
                    style={{ transformOrigin: "top right" }}
                  >
                    <button
                      onClick={() => {
                        faqApi.downloadTemplate(selectedKb);
                        setMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#334155] hover:bg-[#F8F6F2] transition-colors text-left"
                    >
                      <FileText size={14} className="text-[#8A8A8A]" />
                      下载模板
                    </button>
                    <button
                      onClick={() => {
                        faqApi.exportExcel(selectedKb);
                        setMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#334155] hover:bg-[#F8F6F2] transition-colors text-left"
                    >
                      <Download size={14} className="text-[#8A8A8A]" />
                      导出 Excel
                    </button>
                    <div className="my-1 border-t border-[#F0EDE8]" />
                    <button
                      onClick={() => {
                        setImportOpen(true);
                        setMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#334155] hover:bg-[#F8F6F2] transition-colors text-left"
                    >
                      <Upload size={14} className="text-[#8A8A8A]" />从 Excel
                      导入
                    </button>
                  </div>
                )}
              </div>
            )}
            <button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white text-sm rounded-xl hover:bg-slate-800 transition-colors"
            >
              <Plus size={15} />
              新增 FAQ
            </button>
          </>
        )}
      </div>

      {/* 过滤条 - 单行 */}
      {selectedKb && (
        <div className="flex items-center gap-2 flex-wrap" style={settle(60)}>
          <span className="text-xs font-medium text-[#8A8A8A]">分类:</span>
          {["全部", ...allCategories].map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-all ${categoryFilter === cat ? "bg-slate-700 text-white border-transparent" : "bg-white border-[#E8E4DC] text-gray-600 hover:bg-[#F8F6F2]"}`}
            >
              {cat}
            </button>
          ))}
          <span className="mx-1 text-[#E8E4DC]">|</span>
          <span className="text-xs font-medium text-[#8A8A8A]">状态:</span>
          {["全部", "待审核", "已发布", "已驳回", "草稿"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-all ${statusFilter === s ? "bg-slate-700 text-white border-transparent" : "bg-white border-[#E8E4DC] text-gray-600 hover:bg-[#F8F6F2]"}`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* 未选 KB 空状态 */}
      {!selectedKb && (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#F2EFE9] flex items-center justify-center">
            <MessageSquareQuote
              size={22}
              className="text-[#334155]"
              strokeWidth={1.6}
            />
          </div>
          <p className="text-sm font-semibold text-gray-800">请先选择知识库</p>
          <p className="text-xs" style={{ color: "#8A8A8A" }}>
            从上方下拉菜单选择要管理的知识库
          </p>
        </div>
      )}

      {/* FAQ 列表 */}
      {selectedKb && !isLoading && !error && displayFaqs.length > 0 && (
        <div className="space-y-1.5">
          {displayFaqs.map((faq) => (
            <FaqCard
              key={faq.id}
              faq={faq}
              onEdit={setEditTarget}
              onDelete={setDeleteTarget}
              onToggle={(f) =>
                updateMutation.mutate({
                  id: f.id,
                  body: { enabled: !f.enabled },
                })
              }
              onApprove={(f) =>
                updateMutation.mutate({
                  id: f.id,
                  body: { status: "approved" },
                })
              }
            />
          ))}
        </div>
      )}

      {selectedKb &&
        !isLoading &&
        !error &&
        displayFaqs.length === 0 &&
        faqs.length > 0 && (
          <p className="text-xs text-center py-12" style={{ color: "#AAAAAA" }}>
            没有匹配的 FAQ
          </p>
        )}

      {selectedKb && !isLoading && !error && faqs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#F2EFE9] flex items-center justify-center">
            <MessageSquareQuote
              size={22}
              className="text-[#334155]"
              strokeWidth={1.6}
            />
          </div>
          <p className="text-sm font-semibold text-gray-800">暂无 FAQ</p>
          <p className="text-xs" style={{ color: "#8A8A8A" }}>
            点击「新增 FAQ」或通过 Excel 批量导入
          </p>
        </div>
      )}

      {createOpen && (
        <FaqDialog
          title="新增 FAQ"
          loading={createMutation.isPending}
          onClose={() => setCreateOpen(false)}
          onSubmit={(data) => createMutation.mutate(data)}
        />
      )}
      {editTarget && (
        <FaqDialog
          title="编辑 FAQ"
          initial={editTarget}
          loading={updateMutation.isPending}
          onClose={() => setEditTarget(null)}
          onSubmit={(data) =>
            updateMutation.mutate({ id: editTarget.id, body: data })
          }
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
      {toast && (
        <Toast
          message={toast.msg}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
}
