"use client";

import { useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { BASE_ID, lifeOf, useForkStore } from "@/ui/store/useForkStore";

/**
 * The other futures you have made, as one quiet selector beside the timeline. Each option is a life (what you told Fork),
 * not a car: the car swap is the fork at the end of the path. Choosing one looks at it, and with a comparison open the
 * comparison follows, so the totals, the verdict and the path always describe the same future.
 */
export function FutureSelector({ className }: { className?: string }) {
  const scenarios = useForkStore((s) => s.explore.scenarios);
  const activeId = useForkStore((s) => s.activeScenarioId);
  const explore = useForkStore((s) => s.explore);
  const busy = useForkStore((s) => s.ui.busy);
  const selectFuture = useForkStore((s) => s.actions.selectFuture);

  const lives = useMemo(() => scenarios.filter((sc) => !sc.events.some((e) => e.type === "vehicle_replacement")), [scenarios]);
  const active = scenarios.find((sc) => sc.id === activeId);
  const current = active ? lifeOf({ explore }, active).id : activeId;

  if (lives.length < 2) return null;
  return (
    <label className={cn("relative inline-flex items-center", className)}>
      <span className="sr-only">Future</span>
      <select
        data-testid="future-selector"
        value={lives.some((l) => l.id === current) ? current : lives[0].id}
        disabled={busy !== "idle"}
        onChange={(e) => selectFuture(e.target.value)}
        className="h-10 max-w-[260px] cursor-pointer appearance-none truncate rounded-full border border-line bg-ink/10 pr-10 pl-4 text-sm text-ink transition-colors hover:bg-ink/15 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        {lives.map((life) => (
          <option key={life.id} value={life.id} className="bg-canvas text-ink">
            {life.id === BASE_ID ? "If nothing changes" : life.name}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 size-4 text-ink/60" />
    </label>
  );
}
