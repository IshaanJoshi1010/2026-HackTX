"use client";

import { useEffect, useRef } from "react";
import { FutureTimeline } from "@/ui/timeline/FutureTimeline";

/**
 * Bottom dock. It fades up from black so the timeline stays readable over the
 * car, and reports its height so the side panels can stop above it.
 */
export function BottomDock({ onHeight }: { onHeight?: (px: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !onHeight || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => onHeight(Math.round(el.getBoundingClientRect().height)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [onHeight]);

  return (
    <div
      ref={ref}
      style={{ "--d": "700ms" } as React.CSSProperties}
      className="fork-fade bg-gradient-to-t from-black via-black/85 to-transparent px-[4%] pb-4 pt-12"
    >
      <FutureTimeline />
    </div>
  );
}
