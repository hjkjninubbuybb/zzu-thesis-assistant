import { useState } from "react";
import { DocumentKnowledgeTab } from "@/pages/KnowledgeBasePage";
import { FaqKnowledgeTab } from "@/pages/FaqPage";

type TabKey = "documents" | "faq";

const TABS: { key: TabKey; label: string }[] = [
  { key: "documents", label: "文档知识" },
  { key: "faq", label: "FAQ 知识" },
];

export default function KnowledgeManagementPage() {
  const [tab, setTab] = useState<TabKey>("documents");

  return (
    <div className="px-8 py-8 flex-1 overflow-y-auto glass-card rounded-2xl custom-scrollbar flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-[#334155]">知识库管理</h1>
        <div className="flex items-center gap-1 mt-3 border-b border-[#E8E4DC]">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium transition-colors relative ${
                tab === t.key
                  ? "text-[#334155]"
                  : "text-[#9A9A9A] hover:text-[#6A6A6A]"
              }`}
            >
              {t.label}
              {tab === t.key && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-slate-700 rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {tab === "documents" && <DocumentKnowledgeTab />}
      {tab === "faq" && <FaqKnowledgeTab />}
    </div>
  );
}
