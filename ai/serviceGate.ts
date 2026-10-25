/** Best-effort per-process protection. Hosting still needs shared provider quotas across instances. */
export function createServiceGate(now: () => number = Date.now, maxStarts = 20) {
  maxStarts = Number.isInteger(maxStarts) && maxStarts >= 1 && maxStarts <= 60 ? maxStarts : 20;
  const maxExplanations = Math.min(4, Math.floor(maxStarts / 3));
  let active = 0, activeExplanations = 0, blockedUntil = 0;
  let starts: { time: number; purpose: string }[] = [];
  return {
    acquire(purpose: "interpret" | "explain" = "interpret"): { ok: true; release: () => void } | { ok: false; retryAfter: number } {
      const time = now();
      starts = starts.filter(start => time - start.time < 60_000);
      const explanations = starts.filter(start => start.purpose === "explain");
      // Background explanations may occupy only one slot and four starts/minute; leave room for typed input.
      const wait = Math.max(blockedUntil - time, starts.length >= maxStarts ? starts[0].time + 60_000 - time : 0,
        active >= 2 || (purpose === "explain" && activeExplanations >= 1) ? 1000 : 0,
        purpose === "explain" && explanations.length >= maxExplanations ? (maxExplanations === 0 ? 60_000 : explanations[0].time + 60_000 - time) : 0);
      if (wait > 0) return { ok: false, retryAfter: Math.max(1, Math.ceil(wait / 1000)) };
      starts.push({ time, purpose }); active++;
      if (purpose === "explain") activeExplanations++;
      let released = false;
      return { ok: true, release() {
        if (!released) { active--; if (purpose === "explain") activeExplanations--; released = true; }
      } };
    },
    failure(status: number) {
      if (status === 429 || status === 503 || status === 504) blockedUntil = Math.max(blockedUntil, now() + (status === 429 ? 60_000 : 8000));
    },
  };
}
export const geminiServiceGate = createServiceGate(Date.now, Number(process.env.GEMINI_REQUESTS_PER_MINUTE ?? 20));
