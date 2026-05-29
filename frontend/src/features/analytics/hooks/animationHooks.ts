import { useEffect, useState } from "react";

export function useCountUp(target: number, duration = 1000, enabled = true) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    if (!target) {
      setCount(0);
      return;
    }
    let startTs: number;
    let raf: number;
    const tick = (ts: number) => {
      startTs ??= ts;
      const p = Math.min((ts - startTs) / duration, 1);
      setCount(Math.round((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, enabled]);
  return count;
}

export function useDelayedTrue(delayMs: number) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);
  return ready;
}
