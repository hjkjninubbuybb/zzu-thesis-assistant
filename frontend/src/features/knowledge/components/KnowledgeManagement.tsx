import { useState } from 'react';
import { Plus, Loader2, AlertCircle, Database, BookOpen, Users } from 'lucide-react';
import type { KBInfo } from '@shared/types/api';
import { useConfirm } from '@shared/store/uiStore';
import { useKnowledgeManagement } from '../hooks/useKnowledgeManagement';
import { CreateKBDialog } from './CreateKBDialog';
import { DocumentPanel } from './DocumentPanel';
import { StatusBanner } from './StatusBanner';
import { KBCard } from './KBCard';

// ── Constants ──────────────────────────────────────────────

const KB_COLORS = ['#E85D4A', '#F0C040', '#5EE67A', '#60A5FA', '#C084FC', '#FB923C'];

const settle = (d: number): React.CSSProperties => ({
  animation: `appleSettleIn 0.75s cubic-bezier(0.25, 1, 0.5, 1) ${d}ms both`,
});

// ── KnowledgeManagement ────────────────────────────────────

export function KnowledgeManagement() {
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<KBInfo | null>(null);
  const [expandedKb, setExpandedKb] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  const { showConfirm, dismissConfirm } = useConfirm();

  const {
    kbList,
    isLoading,
    error,
    studentKbName,
    adminKbName,
    createKB,
    isCreating,
    createError,
    deleteKB,
    isDeletingKB,
    setStudentKB,
    isSettingStudent,
    clearStudentKB,
    isClearingStudent,
    setAdminKB,
    isSettingAdmin,
    clearAdminKB,
    isClearingAdmin,
  } = useKnowledgeManagement();

  const showToast = (message: string, type: 'success' | 'error') => {
    setToastMsg({ message, type });
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleDeleteClick = (kb: KBInfo) => {
    setDeleteTarget(kb);
    showConfirm({
      title: '删除知识库',
      description: `将删除知识库 "${kb.name}" 及其所有文档，此操作不可撤销。`,
      onConfirm: () => {
        deleteKB(kb.name, {
          onSuccess: () => {
            if (expandedKb === kb.name) setExpandedKb(null);
            setDeleteTarget(null);
            dismissConfirm();
          },
          onSettled: () => setDeleteTarget(null),
        });
      },
      onCancel: () => {
        setDeleteTarget(null);
        dismissConfirm();
      },
    });
  };

  return (
    <div className="px-8 py-8 flex-1 overflow-y-auto glass-card rounded-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6" style={settle(0)}>
        <div>
          <h1 className="text-2xl font-bold text-[#334155]">知识库</h1>
          <p className="mt-1 text-sm" style={{ color: '#8A8A8A' }}>
            管理知识库，分别为管理端和学生端指定使用的知识库
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white text-sm rounded-xl hover:bg-slate-800 transition-colors apple-press"
        >
          <Plus size={15} />
          新建知识库
        </button>
      </div>

      {/* Status banners */}
      <div className="grid grid-cols-2 gap-3 mb-6" style={settle(60)}>
        <StatusBanner
          icon={BookOpen}
          kbName={adminKbName}
          label="管理端当前知识库"
          subLabel="教师/管理员的对话将路由至此知识库"
          emptyLabel="尚未为管理端分配知识库"
          emptySubLabel="教师和管理员将无法发起问答，请从下方选择"
          accentColor="emerald"
          onClear={() => clearAdminKB()}
          clearing={isClearingAdmin}
        />
        <StatusBanner
          icon={Users}
          kbName={studentKbName}
          label="学生端当前知识库"
          subLabel="所有学生的问答请求将路由至此知识库"
          emptyLabel="尚未为学生分配知识库"
          emptySubLabel="学生将无法发起问答，请从下方选择"
          accentColor="indigo"
          onClear={() => clearStudentKB()}
          clearing={isClearingStudent}
        />
      </div>

      {/* Loading / error / empty states */}
      {isLoading && (
        <div
          className="flex items-center gap-2 text-sm py-24 justify-center"
          style={{ color: '#8A8A8A' }}
        >
          <Loader2 size={16} className="animate-spin" />
          加载中...
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-500 py-4">
          <AlertCircle size={16} />
          加载失败，请检查后端服务
        </div>
      )}

      {!isLoading && !error && kbList.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#F2EFE9] flex items-center justify-center">
            <Database size={22} className="text-[#334155]" strokeWidth={1.6} />
          </div>
          <p className="text-sm font-semibold text-gray-800">暂无知识库</p>
          <p className="text-xs" style={{ color: '#8A8A8A' }}>
            点击右上角「新建知识库」开始
          </p>
        </div>
      )}

      {/* KB list */}
      {kbList.length > 0 && (
        <div className="space-y-2">
          {kbList.map((kb, i) => {
            const isExpanded = expandedKb === kb.name;
            const isBeingDeleted = deleteTarget?.name === kb.name && isDeletingKB;

            return (
              <KBCard
                key={kb.id}
                kb={kb}
                color={KB_COLORS[i % KB_COLORS.length]}
                animationStyle={settle(Math.min(120 + i * 50, 500))}
                isAdminKb={kb.name === adminKbName}
                isStudentKb={kb.name === studentKbName}
                isExpanded={isExpanded}
                isBeingDeleted={isBeingDeleted}
                isClearingAdmin={isClearingAdmin}
                isSettingAdmin={isSettingAdmin}
                isClearingStudent={isClearingStudent}
                isSettingStudent={isSettingStudent}
                onSetAdmin={() => setAdminKB(kb.name)}
                onClearAdmin={() => clearAdminKB()}
                onSetStudent={() => setStudentKB(kb.name)}
                onClearStudent={() => clearStudentKB()}
                onToggleExpand={() => setExpandedKb(isExpanded ? null : kb.name)}
                onDelete={() => handleDeleteClick(kb)}
              >
                {isExpanded && <DocumentPanel kbName={kb.name} onToast={showToast} />}
              </KBCard>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      {createOpen && (
        <CreateKBDialog
          isCreating={isCreating}
          createError={createError}
          onClose={() => setCreateOpen(false)}
          onSubmit={(payload) => {
            createKB(payload, {
              onSuccess: () => setCreateOpen(false),
            });
          }}
        />
      )}

      {/* Inline toast for document panel events */}
      {toastMsg && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm text-white ${
            toastMsg.type === 'success' ? 'bg-emerald-600' : 'bg-red-500'
          }`}
        >
          {toastMsg.message}
        </div>
      )}
    </div>
  );
}
