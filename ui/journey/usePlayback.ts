"use client";

import { useEffect, useRef } from "react";
import { useForkStore } from "@/ui/store/useForkStore";
import { resyncPlayback, startPlayback, tickPlayback, type PlaybackParams } from "./playback";

/** A tab that was asleep must not make the player lurch: no frame counts for more than this. */
const MAX_FRAME_MS = 250;
/** Used only where requestAnimationFrame does not exist. */
const FALLBACK_FRAME_MS = 16;

/**
 * The player. Mount it once on the Future page, passing the months to rest on (journey.stops).
 *
 * It only reacts to the store: while `ui.playing` is true it moves the one clock with `advanceMonth` (never
 * `setActiveMonth`, which would stop it), resting at each stop, and at month 60 it stops itself. It never calls `play()`,
 * so nothing autoplays: the play button (or whoever starts playback) does that. A manual move, an event pick, another
 * future, an open drawer or leaving the page all set `ui.playing` to false in the store, and this loop checks that flag on
 * every frame, so it stops within one frame. Reduced motion jumps from stop to stop instead of gliding.
 */
export function usePlayback(stops: number[]): void {
  const playing = useForkStore((s) => s.ui.playing);
  const reducedMotion = useForkStore((s) => s.ui.reducedMotion);

  // The loop reads the latest of these on every frame without restarting.
  const params = useRef<PlaybackParams>({ stops, reducedMotion });
  useEffect(() => {
    params.current = { stops, reducedMotion };
  }, [stops, reducedMotion]);

  useEffect(() => {
    if (!playing) return;

    const store = useForkStore;
    const raf = typeof requestAnimationFrame === "function" && typeof cancelAnimationFrame === "function";
    let handle: number | ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    let last: number | null = null;
    let run = startPlayback(store.getState().activeMonth, params.current);
    if (run.month !== store.getState().activeMonth) store.getState().actions.advanceMonth(run.month);

    const frame = (stamp?: number) => {
      if (cancelled) return;
      const s = store.getState();
      // Something else paused it (a manual move, a drawer, a view change): stop at once, before React re-renders.
      if (!s.ui.playing) return;

      const now = typeof stamp === "number" ? stamp : Date.now();
      const dt = last === null ? 0 : Math.min(MAX_FRAME_MS, Math.max(0, now - last));
      last = now;

      // The store is the one clock: if someone else moved it, follow.
      run = resyncPlayback(run, s.activeMonth, params.current);
      const next = tickPlayback(run, dt, params.current);
      run = next;
      if (next.month !== s.activeMonth) s.actions.advanceMonth(next.month);
      if (next.done) {
        s.actions.pause();
        return;
      }
      schedule();
    };

    const schedule = () => {
      handle = raf ? requestAnimationFrame(frame) : setTimeout(() => frame(), FALLBACK_FRAME_MS);
    };

    schedule();
    return () => {
      cancelled = true;
      if (handle === undefined) return;
      if (raf) cancelAnimationFrame(handle as number);
      else clearTimeout(handle as ReturnType<typeof setTimeout>);
    };
  }, [playing]);
}
