import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

export interface ToastPayload {
  id: string;
  message: string;
  type: "success" | "error";
}

export interface ConfirmPayload {
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

interface UIState {
  sidebarCollapsed: boolean;
  toasts: ToastPayload[];
  confirmDialog: ConfirmPayload | null;
  activeKBName: string | null;

  setSidebarCollapsed: (v: boolean) => void;
  showToast: (message: string, type: "success" | "error") => void;
  dismissToast: (id: string) => void;
  showConfirm: (payload: ConfirmPayload) => void;
  dismissConfirm: () => void;
  setActiveKBName: (name: string | null) => void;
}

const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  toasts: [],
  confirmDialog: null,
  activeKBName: null,

  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),

  showToast: (message, type) => {
    const id = `${Date.now()}-${Math.random()}`;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3500);
  },

  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  showConfirm: (payload) => set({ confirmDialog: payload }),
  dismissConfirm: () => set({ confirmDialog: null }),

  setActiveKBName: (name) => set({ activeKBName: name }),
}));

// Selector hooks
export const useToast = () =>
  useUIStore(
    useShallow((s) => ({
      toasts: s.toasts,
      showToast: s.showToast,
      dismissToast: s.dismissToast,
    })),
  );
export const useConfirm = () =>
  useUIStore(
    useShallow((s) => ({
      dialog: s.confirmDialog,
      showConfirm: s.showConfirm,
      dismissConfirm: s.dismissConfirm,
    })),
  );
export const useActiveKB = () => useUIStore((s) => s.activeKBName);
export const useSetActiveKB = () => useUIStore((s) => s.setActiveKBName);
export const useSidebar = () =>
  useUIStore(
    useShallow((s) => ({
      collapsed: s.sidebarCollapsed,
      set: s.setSidebarCollapsed,
    })),
  );

export default useUIStore;
