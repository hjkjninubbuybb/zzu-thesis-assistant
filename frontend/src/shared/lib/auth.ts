/**
 * 认证 token 和用户信息的 localStorage 管理工具。
 * admin / student 两端使用独立的 key 前缀，互不干扰。
 */

import type { LoginResponse, UserInfo } from '@shared/types/api';

export type Portal = 'admin' | 'student';

/** 根据当前 URL 推断所在门户 */
export function getCurrentPortal(): Portal {
  return window.location.pathname.startsWith('/student') ? 'student' : 'admin';
}

function keyOf(portal: Portal) {
  return {
    access: `rag_${portal}_access_token`,
    refresh: `rag_${portal}_refresh_token`,
    user: `rag_${portal}_user`,
  };
}

export function getAccessToken(portal?: Portal): string | null {
  const k = keyOf(portal ?? getCurrentPortal());
  return localStorage.getItem(k.access);
}

export function getRefreshToken(portal?: Portal): string | null {
  const k = keyOf(portal ?? getCurrentPortal());
  return localStorage.getItem(k.refresh);
}

export function getStoredUser(portal?: Portal): UserInfo | null {
  const k = keyOf(portal ?? getCurrentPortal());
  const raw = localStorage.getItem(k.user);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserInfo;
  } catch {
    return null;
  }
}

export function saveAuth(data: LoginResponse, portal?: Portal): void {
  const k = keyOf(portal ?? getCurrentPortal());
  localStorage.setItem(k.access, data.access_token);
  localStorage.setItem(k.refresh, data.refresh_token);
  localStorage.setItem(k.user, JSON.stringify(data.user));
}

export function clearAuth(portal?: Portal): void {
  const k = keyOf(portal ?? getCurrentPortal());
  localStorage.removeItem(k.access);
  localStorage.removeItem(k.refresh);
  localStorage.removeItem(k.user);
}

export function isLoggedIn(portal?: Portal): boolean {
  return !!getAccessToken(portal);
}

/** 从 JWT 中提取过期时间戳（秒），解析失败返回 null */
export function getTokenExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

/** Access token 默认有效期（秒），JWT 解析失败时的兜底值 */
export const ACCESS_TOKEN_LIFETIME_SEC = 480 * 60;
