import {
  FileText,
  ChevronDown,
  ChevronUp,
  Trash2,
  X,
  BookOpen,
  Users,
  Loader2,
} from 'lucide-react';
import type { KBInfo } from '@shared/types/api';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

interface KBCardActionsProps {
  kb: KBInfo;
  isAdminKb: boolean;
  isStudentKb: boolean;
  isExpanded: boolean;
  isBeingDeleted: boolean;
  isClearingAdmin: boolean;
  isSettingAdmin: boolean;
  isClearingStudent: boolean;
  isSettingStudent: boolean;
  onSetAdmin: () => void;
  onClearAdmin: () => void;
  onSetStudent: () => void;
  onClearStudent: () => void;
  onToggleExpand: () => void;
  onDelete: () => void;
}

interface KBCardProps extends KBCardActionsProps {
  color: string;
  animationStyle: React.CSSProperties;
  children?: React.ReactNode;
}

export function KBCard({
  kb,
  color,
  isAdminKb,
  isStudentKb,
  isExpanded,
  isBeingDeleted,
  isClearingAdmin,
  isSettingAdmin,
  isClearingStudent,
  isSettingStudent,
  animationStyle,
  onSetAdmin,
  onClearAdmin,
  onSetStudent,
  onClearStudent,
  onToggleExpand,
  onDelete,
  children,
}: KBCardProps) {
  const highlighted = isStudentKb || isAdminKb;

  return (
    <div style={animationStyle}>
      <div
        className={`flex items-center gap-4 px-5 py-4 rounded-2xl border transition-colors ${
          highlighted
            ? 'bg-white border-gray-300'
            : isExpanded
              ? 'border-slate-400 bg-white'
              : 'border-[#F0EDE8] bg-white hover:bg-[#F8F6F2]'
        }`}
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0 select-none"
          style={{ background: color }}
        >
          {kb.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-[#334155]">{kb.name}</p>
            {isAdminKb && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-semibold rounded-full border border-emerald-200">
                <BookOpen size={9} />
                管理端
              </span>
            )}
            {isStudentKb && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-[#EEF2FF] text-[#4338CA] text-[10px] font-semibold rounded-full border border-[#C7D2FE]">
                <Users size={9} />
                学生端
              </span>
            )}
          </div>
          <p className="text-xs truncate mt-0.5" style={{ color: '#8A8A8A' }}>
            {kb.description || '暂无描述'}
          </p>
        </div>
        <div className="text-center w-16 shrink-0">
          <p className="text-lg font-bold text-[#334155]">{kb.doc_count}</p>
          <p className="text-xs" style={{ color: '#8A8A8A' }}>
            篇文档
          </p>
        </div>
        <p className="text-xs w-24 text-right shrink-0" style={{ color: '#8A8A8A' }}>
          {formatDate(kb.created_at)}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {/* Admin KB button */}
          {isAdminKb ? (
            <button
              onClick={onClearAdmin}
              disabled={isClearingAdmin}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 transition-colors"
            >
              {isClearingAdmin ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
              取消管理端
            </button>
          ) : (
            <button
              onClick={onSetAdmin}
              disabled={isSettingAdmin}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-[#E8E4DC] text-gray-600 hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 transition-colors"
            >
              {isSettingAdmin ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <BookOpen size={11} />
              )}
              设为管理端
            </button>
          )}
          {/* Student KB button */}
          {isStudentKb ? (
            <button
              onClick={onClearStudent}
              disabled={isClearingStudent}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-[#A5B4FC] bg-[#EEF2FF] text-[#4338CA] hover:bg-[#E0E7FF] disabled:opacity-50 transition-colors"
            >
              {isClearingStudent ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
              取消学生端
            </button>
          ) : (
            <button
              onClick={onSetStudent}
              disabled={isSettingStudent}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-[#E8E4DC] text-gray-600 hover:border-[#818CF8] hover:text-[#4338CA] hover:bg-[#EEF2FF] disabled:opacity-50 transition-colors"
            >
              {isSettingStudent ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <Users size={11} />
              )}
              设为学生端
            </button>
          )}
          <button
            onClick={onToggleExpand}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${
              isExpanded
                ? 'bg-slate-700 text-white border-slate-400'
                : 'border-[#F0EDE8] text-[#334155] hover:bg-[#F2EFE9]'
            }`}
          >
            <FileText size={12} />
            {isExpanded ? '收起' : '管理文档'}
            {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
          <button
            onClick={onDelete}
            disabled={isBeingDeleted}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {isBeingDeleted ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}
