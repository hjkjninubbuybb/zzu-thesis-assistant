/**
 * 认证 token 和用户信息的 localStorage 管理工具。
 */

import type { LoginResponse, UserInfo } from '@/types/api'

const ACCESS_TOKEN_KEY = 'rag_access_token'
const REFRESH_TOKEN_KEY = 'rag_refresh_token'
const USER_KEY = 'rag_user'

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

export function getStoredUser(): UserInfo | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as UserInfo
  } catch {
    return null
  }
}

export function saveAuth(data: LoginResponse): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token)
  localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token)
  localStorage.setItem(USER_KEY, JSON.stringify(data.user))
}

export function clearAuth(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export function isLoggedIn(): boolean {
  return !!getAccessToken()
}
