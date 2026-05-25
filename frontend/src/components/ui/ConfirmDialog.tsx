import { Loader2 } from "lucide-react";

interface ConfirmDialogProps {
  title?: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
  destructive?: boolean;
}

export function ConfirmDialog({
  title = "确认删除",
  message,
  confirmLabel = "删除",
  onConfirm,
  onCancel,
  loading,
  destructive = true,
}: ConfirmDialogProps) {
  const btnClass = destructive
    ? "bg-red-600 text-white hover:bg-red-700"
    : "bg-slate-700 text-white hover:bg-slate-800";

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-40 animate-apple-fade">
      <div className="glass-card rounded-xl p-6 w-full max-w-sm mx-4 animate-apple-pop">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        <p className="mt-2 text-sm text-gray-500">{message}</p>
        <div className="mt-4 flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-md border border-gray-300 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 text-sm rounded-md disabled:opacity-60 flex items-center gap-2 ${btnClass}`}
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
