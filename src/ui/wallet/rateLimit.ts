/**
 * In-memory throttling for unlock and export password attempts (UX F-4/F-6).
 *
 * This is shoulder-surfing friction, not a security boundary: an offline
 * attacker ignores it. The two callers keep independent counters on purpose so
 * the export dialog cannot be used to bypass the unlock countdown.
 */
import { useEffect, useState } from 'react';

const BACKOFF_SECONDS = [1, 2, 4, 8, 16, 30] as const;

function delaySeconds(failures: number): number {
  if (failures < 5) return 0;
  const index = Math.min(failures - 5, BACKOFF_SECONDS.length - 1);
  return BACKOFF_SECONDS[index] ?? 30;
}

export interface FailureBackoff {
  failures: number;
  remainingSeconds: number;
  blocked: boolean;
  fail: () => void;
  reset: () => void;
}

export function useFailureBackoff(): FailureBackoff {
  const [failures, setFailures] = useState(0);
  const [blockedUntil, setBlockedUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (blockedUntil === 0) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [blockedUntil]);

  const remainingMs = Math.max(0, blockedUntil - now);

  return {
    failures,
    remainingSeconds: Math.ceil(remainingMs / 1000),
    blocked: remainingMs > 0,
    fail() {
      const next = failures + 1;
      setFailures(next);
      const seconds = delaySeconds(next);
      if (seconds > 0) {
        const until = Date.now() + seconds * 1000;
        setBlockedUntil(until);
        setNow(Date.now());
      }
    },
    reset() {
      setFailures(0);
      setBlockedUntil(0);
    },
  };
}
