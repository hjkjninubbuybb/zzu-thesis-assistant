import { useState } from "react";
import { useIsAdmin } from "@shared/store/authStore";
import { StudentsTab } from "./StudentsTab";
import { TeachersTab } from "./TeachersTab";
import { MentorRelationsTab } from "./MentorRelationsTab";

type TabKey = "students" | "teachers" | "relations";

const ALL_TABS: { key: TabKey; label: string; adminOnly?: boolean }[] = [
  { key: "students", label: "学生管理" },
  { key: "teachers", label: "教师管理", adminOnly: true },
  { key: "relations", label: "导师关系", adminOnly: true },
];

export function UsersRoot() {
  const isAdmin = useIsAdmin();
  const [tab, setTab] = useState<TabKey>("students");

  const tabs = ALL_TABS.filter((t) => !t.adminOnly || isAdmin);

  return (
    <div className="px-8 py-8 flex-1 overflow-y-auto glass-card rounded-2xl custom-scrollbar flex flex-col gap-5">
      {/* 标题 + Tab 栏 */}
      <div>
        <h1 className="text-2xl font-bold text-[#334155]">师生管理</h1>
        <div className="flex items-center gap-1 mt-3 border-b border-[#E8E4DC]">
          {tabs.map((t) => (
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

      {/* Tab 内容 */}
      {tab === "students" && <StudentsTab />}
      {tab === "teachers" && isAdmin && <TeachersTab />}
      {tab === "relations" && isAdmin && <MentorRelationsTab />}
    </div>
  );
}

export default UsersRoot;
