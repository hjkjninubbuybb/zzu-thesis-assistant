import { useEffect, useRef } from 'react'
import { authApi } from '@/lib/api'
import type { UserInfo } from '@/types/api'
import {
  getAccessToken,
  getRefreshToken,
  saveAuth,
  getTokenExp,
  ACCESS_TOKEN_LIFETIME_SEC,
  type Portal,
} from '@/lib/auth'

/**
 * 在 access token 过期前自动刷新（剩余时间 75% 处触发）。
 * 刷新失败时 30 秒后重试一次，之后交给 401 拦截器兜底。
 */
export function useTokenAutoRefresh(
  portal: Portal,
  loggedIn: boolean,
  onRefreshed?: (user: UserInfo) => void,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!loggedIn) {
      if (timerRef.current) clearTimeout(timerRef.current)
      return
    }

    function schedule() {
      if (timerRef.current) clearTimeout(timerRef.current)

      const token = getAccessToken(portal)
      if (!token) return

      const exp = getTokenExp(token)
      const now = Math.floor(Date.now() / 1000)

      let delayMs: number
      if (exp) {
        const remaining = exp - now
        delayMs = remaining <= 60 ? 0 : remaining * 0.75 * 1000
      } else {
        delayMs = ACCESS_TOKEN_LIFETIME_SEC * 0.75 * 1000
      }

      timerRef.current = setTimeout(async () => {
        const rt = getRefreshToken(portal)
        if (!rt) return

        try {
          const data = await authApi.refresh(rt)
          saveAuth(data, portal)
          onRefreshed?.(data.user)
          schedule()
        } catch {
          // 30 秒后重试一次
          timerRef.current = setTimeout(async () => {
            const rt2 = getRefreshToken(portal)
            if (!rt2) return
            try {
              const data = await authApi.refresh(rt2)
              saveAuth(data, portal)
              onRefreshed?.(data.user)
              schedule()
            } catch {
              // 放弃主动刷新，401 拦截器兜底
            }
          }, 30_000)
        }
      }, delayMs)
    }

    schedule()

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [portal, loggedIn])
}
