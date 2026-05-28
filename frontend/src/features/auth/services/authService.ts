import { authApi } from "@shared/lib/api";
import { saveAuth, clearAuth, type Portal } from "@shared/lib/auth";
import type { LoginResponse } from "@shared/types/api";

export const authService = {
  login: (username: string, password: string): Promise<LoginResponse> =>
    authApi.login(username, password),

  refresh: (refreshToken: string): Promise<LoginResponse> =>
    authApi.refresh(refreshToken),

  persist: (data: LoginResponse, portal: Portal): void =>
    saveAuth(data, portal),

  clear: (portal: Portal): void => clearAuth(portal),
};
