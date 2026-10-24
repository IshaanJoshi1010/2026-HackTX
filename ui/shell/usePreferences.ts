"use client";

import { useEffect } from "react";
import { useForkStore } from "@/ui/store/useForkStore";

/**
 * Keeps store.ui.reducedMotion in step with the OS setting and mirrors it onto
 * <html data-reduced-motion> so CSS can switch motion off too.
 */
export function usePreferences(): void {
  const setReducedMotion = useForkStore((s) => s.actions.setReducedMotion);
  const reduced = useForkStore((s) => s.ui.reducedMotion);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [setReducedMotion]);

  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(reduced);
  }, [reduced]);
}
