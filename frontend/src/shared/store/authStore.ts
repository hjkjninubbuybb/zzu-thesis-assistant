import { create } from "zustand";
import type { UserInfo } from "@shared/types/api";
import {
  getStoredUser,
  saveAuth,
  clearAuth,
  getCurrentPortal,
  type Portal,
} from "@shared/lib/auth";
import { authApi } from "@shared/lib/api";

interface AuthState {
  user: UserInfo | null;
  portal: Portal | null;
  setUser: (user: UserInfo | null) => void;
  setPortal: (portal: Portal) => void;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isAdmin: () => boolean;
  isTeacher: () => boolean;
  isStudent: () => boolean;
  hydrate: () => void;
}

const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  portal: null,

  setUser: (user) => set({ user }),
  setPortal: (portal) => set({ portal }),

  hydrate: () => {
    const portal = getCurrentPortal();
    const user = getStoredUser(portal);
    set({ user, portal });
  },

  login: async (username, password) => {
    const portal = get().portal ?? getCurrentPortal();
    const data = await authApi.login(username, password);
    saveAuth(data, portal);
    set({ user: data.user });
  },

  logout: () => {
    const portal = get().portal ?? getCurrentPortal();
    clearAuth(portal);
    set({ user: null });
  },

  isAdmin: () => get().user?.role === "admin",
  isTeacher: () => get().user?.role === "teacher",
  isStudent: () => get().user?.role === "student",
}));

// Selector hooks — components only use these, never the store directly
export const useAuthUser = () => useAuthStore((s) => s.user);
export const useAuthLogin = () => useAuthStore((s) => s.login);
export const useAuthLogout = () => useAuthStore((s) => s.logout);
export const useSetUser = () => useAuthStore((s) => s.setUser);
export const useSetPortal = () => useAuthStore((s) => s.setPortal);
export const useHydrate = () => useAuthStore((s) => s.hydrate);
export const useIsAdmin = () => useAuthStore((s) => s.isAdmin());
export const useIsTeacher = () => useAuthStore((s) => s.isTeacher());
export const useIsStudent = () => useAuthStore((s) => s.isStudent());
export const useAuthPortal = () => useAuthStore((s) => s.portal);

export default useAuthStore;
