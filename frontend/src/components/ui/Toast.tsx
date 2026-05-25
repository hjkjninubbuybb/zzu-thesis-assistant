import { useEffect } from "react";
import { X } from "lucide-react";

interface ToastProps {
  message: string;
  type: "success" | "error";
  onClose: () => void;
  /** Auto-dismiss delay in ms. Pass 0 to disable. Default: 3000 */
  duration?: number;
}

export function Toast({ message, type, onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    if (duration <= 0) return;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  return (
    <div
      className={`fixed bottom-6 right-6 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-white text-sm z-50 animate-apple-toast ${
        type === "success" ? "bg-slate-700" : "bg-red-600"
      }`}
    >
      <span>{message}</span>
      <button
        onClick={onClose}
        className="opacity-70 hover:opacity-100 transition-opacity"
      >
        <X size={14} />
      </button>
    </div>
  );
}
