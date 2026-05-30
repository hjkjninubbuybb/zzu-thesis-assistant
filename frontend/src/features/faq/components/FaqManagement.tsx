import { useState, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useIsAdmin } from "@shared/store/authStore";
import { useConfirm, useToast } from "@shared/store/uiStore";
import { useKBList } from "@shared/hooks/useKBList";
import type { FAQItem, FAQUpdate } from "@shared/types/api";
import { faqService } from "../services/faqService";
import { useFaqList } from "../hooks/useFaqList";
import { useFaqSearch } from "../hooks/useFaqSearch";
import { FaqTable, FaqEmptyNoKb, FaqEmptyList } from "./FaqTable";
import { FaqForm } from "./FaqForm";
import { FaqImportDialog } from "./FaqImportDialog";
import { FaqToolbar } from "./FaqToolbar";
import { FaqFilterBar } from "./FaqFilterBar";

const FK_STORAGE_KEY = "faq-selected-kb";

const settle = (d: number): React.CSSProperties => ({
  animation: `appleSettleIn 0.75s cubic-bezier(0.25, 1, 0.5, 1) ${d}ms both`,
});

/** Admin FAQ management panel — KB selector + search + CRUD. Also exported as FaqKnowledgeTab. */
export function FaqManagement() {
  const isAdmin = useIsAdmin();
  const { showToast } = useToast();
  const { showConfirm, dismissConfirm } = useConfirm();

  const [selectedKb, setSelectedKb] = useState(
    () => localStorage.getItem(FK_STORAGE_KEY) ?? "",
  );
  const [categoryFilter, setCategoryFilter] = useState("全部");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<FAQItem | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const qc = useQueryClient();
  const {
    faqs,
    isLoading,
    createFaq,
    updateFaq,
    deleteFaq,
    isCreating,
    isUpdating,
  } = useFaqList(selectedKb);

  useEffect(() => {
    if (!searchText) {
      setDebouncedSearch("");
      return;
    }
    const timer = setTimeout(() => setDebouncedSearch(searchText.trim()), 500);
    return () => clearTimeout(timer);
  }, [searchText]);

  const { data: kbs } = useKBList();

  useEffect(() => {
    if (!kbs) return;
    const names = kbs.map((kb) => kb.name);
    if (selectedKb && !names.includes(selectedKb)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedKb("");
      localStorage.removeItem(FK_STORAGE_KEY);
    }
  }, [kbs, selectedKb]);

  const { data: searchData, isFetching: isSearching } = useFaqSearch(
    selectedKb,
    debouncedSearch,
  );

  const isAiSearch = debouncedSearch.length > 0;
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["faq", selectedKb] });

  const allCategories = useMemo(
    () => Array.from(new Set(faqs.map((f) => f.category).filter(Boolean))),
    [faqs],
  );

  const displayFaqs = useMemo(() => {
    let items = isAiSearch ? (searchData?.items ?? []) : faqs;
    const statusMap: Record<string, string> = {
      已发布: "approved",
      待审核: "pending",
      已驳回: "rejected",
      草稿: "draft",
    };
    if (!isAiSearch && categoryFilter !== "全部")
      items = items.filter((f) => f.category === categoryFilter);
    if (!isAiSearch && statusFilter !== "全部")
      items = items.filter((f) => f.status === statusMap[statusFilter]);
    return items;
  }, [isAiSearch, searchData, faqs, categoryFilter, statusFilter]);

  const handleKbChange = (val: string) => {
    setSelectedKb(val);
    if (val) localStorage.setItem(FK_STORAGE_KEY, val);
    else localStorage.removeItem(FK_STORAGE_KEY);
    setCategoryFilter("全部");
    setStatusFilter("全部");
    setSearchText("");
  };

  const handleClearSearch = () => {
    setSearchText("");
    setDebouncedSearch("");
  };

  const handleUpdate = (id: number, payload: FAQUpdate) =>
    updateFaq({ id, payload });

  const handleDeleteClick = (faq: FAQItem) => {
    const label =
      faq.question.length > 30
        ? faq.question.slice(0, 30) + "..."
        : faq.question;
    showConfirm({
      title: "删除 FAQ",
      description: `将删除 "${label}"，并从向量库中移除对应向量。此操作不可撤销。`,
      onConfirm: () =>
        deleteFaq(faq.id, {
          onSuccess: dismissConfirm,
          onSettled: dismissConfirm,
        }),
      onCancel: dismissConfirm,
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div style={settle(0)}>
        <FaqToolbar
          kbs={kbs}
          selectedKb={selectedKb}
          onKbChange={handleKbChange}
          searchText={searchText}
          onSearchChange={(v) => {
            setSearchText(v);
            setCategoryFilter("全部");
          }}
          onClearSearch={handleClearSearch}
          isSearching={isSearching}
          isAiSearch={isAiSearch}
          totalCount={faqs.length}
          approvedCount={faqs.filter((f) => f.status === "approved").length}
          isAdmin={isAdmin}
          onImportClick={() => setImportOpen(true)}
          onCreateClick={() => setCreateOpen(true)}
          onExportExcel={() => faqService.exportExcel(selectedKb)}
          onDownloadTemplate={() => faqService.downloadTemplate(selectedKb)}
        />
      </div>

      {selectedKb && !isAiSearch && (
        <div style={settle(50)}>
          <FaqFilterBar
            categories={allCategories}
            categoryFilter={categoryFilter}
            onCategoryChange={setCategoryFilter}
            statusFilter={statusFilter}
            onStatusChange={setStatusFilter}
          />
        </div>
      )}

      <div
        className="flex-1 border border-[#F0EDE8] rounded-2xl overflow-hidden bg-white/50"
        style={settle(100)}
      >
        {!selectedKb && <FaqEmptyNoKb />}
        {selectedKb && isLoading && (
          <div className="flex items-center justify-center h-48 text-sm text-[#9A9A9A]">
            加载中...
          </div>
        )}
        {selectedKb && !isLoading && faqs.length === 0 && <FaqEmptyList />}
        {selectedKb &&
          !isLoading &&
          displayFaqs.length === 0 &&
          faqs.length > 0 && (
            <p className="text-xs text-center py-12 text-[#AAAAAA]">
              没有匹配的 FAQ
            </p>
          )}
        {selectedKb && !isLoading && displayFaqs.length > 0 && (
          <div className="p-3">
            <FaqTable
              faqs={displayFaqs}
              searchMode={isAiSearch}
              onEdit={setEditTarget}
              onDelete={handleDeleteClick}
              onUpdate={handleUpdate}
            />
          </div>
        )}
      </div>

      {createOpen && (
        <FaqForm
          title="新增 FAQ"
          loading={isCreating}
          onClose={() => setCreateOpen(false)}
          onSubmit={(data) =>
            createFaq(data, {
              onSuccess: () => {
                setCreateOpen(false);
                showToast("FAQ 已提交审核", "success");
              },
            })
          }
        />
      )}
      {editTarget && (
        <FaqForm
          title="编辑 FAQ"
          initial={editTarget}
          loading={isUpdating}
          onClose={() => setEditTarget(null)}
          onSubmit={(data) =>
            updateFaq(
              { id: editTarget.id, payload: data },
              { onSuccess: () => setEditTarget(null) },
            )
          }
        />
      )}
      {importOpen && (
        <FaqImportDialog
          kbName={selectedKb}
          onClose={() => setImportOpen(false)}
          onImported={invalidate}
          showToast={showToast}
        />
      )}
    </div>
  );
}
