/** Best-effort per-process protection, shared by interpretation and explanation.
 * Multi-instance hosting must also enforce a shared provider quota at the platform edge. */
export function createServiceGate(now: () => number = Date.now) {
  let active = 0, blockedUntil = 0;
  let starts: number[] = [];
  return {
    acquire(): { ok: true; release: () => void } | { ok: false; retryAfter: number } {
      const time = now();
      starts = starts.filter(start => time - start < 60_000);
      const wait = Math.max(blockedUntil - time, starts.length >= 10 ? starts[0] + 60_000 - time : 0, active >= 2 ? 1000 : 0);
      if (wait > 0) return { ok: false, retryAfter: Math.max(1, Math.ceil(wait / 1000)) };
      starts.push(time); active++;
      let released = false;
      return { ok: true, release() { if (!released) { active--; released = true; } } };
    },
    failure(status: number) {
      if (status === 429 || status === 503 || status === 504) blockedUntil = Math.max(blockedUntil, now() + (status === 429 ? 60_000 : 8000));
    },
  };
}
export const geminiServiceGate = createServiceGate();
