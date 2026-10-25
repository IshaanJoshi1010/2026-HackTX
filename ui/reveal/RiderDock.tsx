"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useForkStore, type Riders } from "@/ui/store/useForkStore";
import { DOCK_MS, STAGGER_MS, arcKeyframes } from "./arc";

export const RIDER_CHOICES: Array<{ id: Riders; label: string; detail: string }> = [
  { id: "solo", label: "Just me", detail: "1 person" },
  { id: "partner", label: "Partner", detail: "2 people" },
  { id: "kids", label: "Kids", detail: "Family with a child" },
  { id: "mixed", label: "Mixed", detail: "4 or more people" },
];

/** Which rider chip matches the profile right now, if any. */
export function activeRider(householdSize: number, children: number): Riders | null {
  if (householdSize === 1 && children === 0) return "solo";
  if (householdSize === 2 && children === 0) return "partner";
  if (householdSize === 3 && children === 1) return "kids";
  if (householdSize === 4 && children === 2) return "mixed";
  return null;
}

export type DockMode = "row" | "panel";

/** Where the row sits while the car forms: above the Skip button, in the gap the reveal overlay leaves for it. */
export const ROW_BOTTOM = 100;

/**
 * "Who rides with you most?" It is asked while the car forms, in a row at the bottom. When the car is ready the chips do
 * not vanish: they fly up and across in an arc to a quiet panel at the side, where the answer can still be changed. It is
 * one set of elements that changes layout, so each chip really is the same chip before and after, and the move is played
 * back from where each one was (FLIP). A replayed reveal sends them back down the same way. With reduced motion they just
 * appear in their place.
 */
export function RiderDock() {
  const phase = useForkStore((s) => s.phase);
  const view = useForkStore((s) => s.ui.view);
  const reducedMotion = useForkStore((s) => s.ui.reducedMotion);
  const profile = useForkStore((s) => s.explore.confirmedProfile);
  const hasCar = useForkStore((s) => s.twin !== null);
  const answerRiders = useForkStore((s) => s.actions.answerRiders);

  const root = useRef<HTMLDivElement>(null);
  const from = useRef<Map<string, DOMRect> | null>(null);
  const lastMode = useRef<DockMode | null>(null);

  const mode: DockMode = phase === "reveal" ? "row" : "panel";
  // The row belongs to the reveal and the panel to the car page. Neither shows on the future page.
  const visible = phase === "reveal" || view === "car";
  const selected = activeRider(profile.householdSize, profile.children);

  const measure = useCallback(() => {
    const out = new Map<string, DOMRect>();
    root.current?.querySelectorAll<HTMLElement>("[data-flip]").forEach((el) => out.set(el.dataset.flip!, el.getBoundingClientRect()));
    return out;
  }, []);

  // The instant the phase is about to change, write down where every chip is. Subscribing means this runs before React
  // redraws, so the old layout is still on screen (and a move already in flight is caught where it is, not where it ends).
  useEffect(
    () =>
      useForkStore.subscribe((s, prev) => {
        if ((s.phase === "reveal") !== (prev.phase === "reveal")) from.current = measure();
      }),
    [measure],
  );

  useLayoutEffect(() => {
    if (lastMode.current === mode) return;
    const first = lastMode.current === null;
    lastMode.current = mode;
    const start = from.current;
    from.current = null;
    const el = root.current;
    if (first || !start || !el || reducedMotion || typeof el.animate !== "function") return;
    el.querySelectorAll<HTMLElement>("[data-flip]").forEach((chip, i) => {
      const was = start.get(chip.dataset.flip!);
      if (!was) return;
      const now = chip.getBoundingClientRect();
      const dx = was.left - now.left;
      const dy = was.top - now.top;
      if (Math.abs(dx) + Math.abs(dy) < 2) return;
      chip.getAnimations?.().forEach((a) => a.cancel());
      chip.animate(arcKeyframes({ dx, dy }), { duration: DOCK_MS, delay: i * STAGGER_MS, easing: "linear", fill: "backwards" });
    });
  }, [mode, reducedMotion]);

  if (!hasCar) return null;

  const row = mode === "row";
  return (
    <div
      ref={root}
      data-testid="rider-dock"
      data-mode={mode}
      data-visible={visible}
      role="group"
      aria-label="Who rides with you most?"
      inert={!visible}
      className={cn(
        "pointer-events-none absolute z-20 flex flex-col transition-opacity duration-300",
        row ? "inset-x-0 items-center gap-3" : "top-1/2 right-6 w-44 -translate-y-1/2 gap-3",
        visible ? "opacity-100" : "opacity-0",
      )}
      style={row ? { bottom: ROW_BOTTOM } : undefined}
    >
      {/* The panel itself fades in once the chips have landed. */}
      <div
        aria-hidden="true"
        data-testid="rider-panel-chrome"
        className={cn(
          "absolute -inset-4 -z-10 rounded-2xl border border-line bg-black/40 backdrop-blur-md transition-opacity duration-500",
          row ? "opacity-0" : "opacity-100 delay-700",
        )}
      />
      <span data-flip="title" className="pointer-events-auto text-sm text-ink/60">
        Who rides with you most?
      </span>
      <div className={cn("flex gap-2", row ? "flex-wrap justify-center" : "flex-col")}>
        {RIDER_CHOICES.map(({ id, label, detail }) => (
          <button
            key={id}
            type="button"
            data-flip={id}
            onClick={() => answerRiders(id)}
            title={detail}
            aria-pressed={selected === id}
            className={cn(
              "pointer-events-auto rounded text-sm font-medium transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
              row ? "h-9 px-4" : "h-10 w-full px-4 text-left",
              selected === id ? "bg-ink text-canvas" : "bg-ink/10 text-ink hover:bg-ink/20",
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
