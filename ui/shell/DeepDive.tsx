"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { ComparisonChange, ComparisonWhy } from "@/ui/compare/ComparisonSection";
import { openFuturePanel, useForkStore, type FuturePanel } from "@/ui/store/useForkStore";
import { CostsPanel } from "./CostsPanel";

const PANEL_ID = "future-deep-dive";

const tabClass = (open: boolean) =>
  cn(
    "border-b-2 pb-1.5 text-base transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
    open ? "border-ink text-ink" : "border-transparent text-ink/60 hover:text-ink",
  );

const TITLES: Record<FuturePanel, string> = { costs: "Costs", why: "Why this result", change: "What could change" };

/**
 * The deeper information, grouped by the question it answers, one deliberate click away: Costs (how the cost builds up
 * month by month, and what each change contributed), Why this result (the engine's reasons and how robust it is), What
 * could change (what it would take to flip the answer). Only one is open at a time. Editing the inputs is a drawer, not a
 * panel, so it is a button that opens that.
 */
export function DeepDive() {
  const panel = useForkStore((s) => openFuturePanel(s.ui));
  const compared = useForkStore((s) => s.comparison !== null && s.evaluation !== null);
  const reducedMotion = useForkStore((s) => s.ui.reducedMotion);
  const detailsOpen = useForkStore((s) => s.ui.detailsOpen);
  const { setFuturePanel, setDetailsOpen } = useForkStore((s) => s.actions);
  const region = useRef<HTMLDivElement>(null);

  // The reasons only exist once there is a comparison. With none, only Costs is offered.
  const tabs: FuturePanel[] = compared ? ["costs", "why", "change"] : ["costs"];
  const shown = panel && tabs.includes(panel) ? panel : null;

  // What you just opened should not appear out of sight under the fold.
  useEffect(() => {
    if (shown) region.current?.scrollIntoView?.({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  }, [shown, reducedMotion]);

  return (
    <section aria-label="More about this future" data-testid="deep-dive" className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-x-9 gap-y-3 border-t border-line pt-6">
        {tabs.map((id) => (
          <button
            key={id}
            type="button"
            data-testid={`tab-${id}`}
            aria-expanded={shown === id}
            aria-controls={PANEL_ID}
            onClick={() => setFuturePanel(shown === id ? null : id)}
            className={tabClass(shown === id)}
          >
            {TITLES[id]}
          </button>
        ))}
        <button
          type="button"
          data-testid="tab-assumptions"
          aria-haspopup="dialog"
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen(true)}
          className={cn(tabClass(false), "sm:ml-auto")}
        >
          Edit assumptions
        </button>
      </div>

      {shown && (
        <div ref={region} id={PANEL_ID} role="region" aria-label={TITLES[shown]} data-testid={`panel-${shown}`} className="scroll-mt-24">
          {shown === "costs" && <CostsPanel />}
          {shown === "why" && <ComparisonWhy />}
          {shown === "change" && <ComparisonChange />}
        </div>
      )}
    </section>
  );
}
