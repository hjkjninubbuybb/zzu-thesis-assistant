import { createContext, useContext } from "react";
import type { UserInfo } from "@/types/api";

export interface AuthContextType {
  user: UserInfo | null;
  isAdmin: boolean;
  isTeacher: boolean;
  isStudent: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  setUser: (user: UserInfo) => void;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  isAdmin: false,
  isTeacher: false,
  isStudent: false,
  login: async () => {},
  logout: () => {},
  setUser: () => {},
});

export function useAuth(): AuthContextType {
  return useContext(AuthContext);
}
