"use client";

import type { Source } from "@/contracts";
import { cn } from "@/lib/utils";
import { SourceBadge } from "@/ui/profile/SourceBadge";
import { ROW_H, usdCompact, type Lane } from "./layout";

export interface ScenarioNodeProps {
  lane: Lane;
  /** Net cost for this future at the playhead month. Undefined when there is no projection at that month. */
  netCost: number | undefined;
  source: Source | undefined;
  /** Month label for the value's tooltip, for example "3 yr". */
  at: string;
  onSelect(id: string): void;
}

/**
 * The label (left) and the value at the playhead (right) for one future.
 * Returns two grid cells that line up with the lane row.
 */
export function ScenarioNode({ lane, netCost, source, at, onSelect }: ScenarioNodeProps) {
  const row = lane.row + 1;
  return (
    <>
      <button
        type="button"
        onClick={() => onSelect(lane.id)}
        aria-current={lane.active ? "true" : undefined}
        title={lane.name}
        style={{ gridColumn: 1, gridRow: row, height: ROW_H }}
        className={cn(
          "flex min-w-0 items-center gap-2.5 pr-4 text-left text-sm transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink",
          lane.active ? "font-medium text-ink" : "text-ink/50 hover:text-ink",
        )}
      >
        <span
          aria-hidden="true"
          className={cn("size-2 shrink-0 rounded-full", lane.active ? "bg-ink" : "border border-ink/50")}
        />
        <span className="truncate">{lane.name}</span>
      </button>

      <div
        data-slot="lane-value"
        title={netCost === undefined ? undefined : `Net cost at ${at}`}
        style={{ gridColumn: 3, gridRow: row, height: ROW_H }}
        className="flex flex-col items-end justify-center pl-4 text-right"
      >
        {netCost !== undefined && (
          <>
            <span className={cn("text-sm font-medium tabular-nums", lane.active ? "text-ink" : "text-ink/60")}>
              {usdCompact(netCost)}
            </span>
            <SourceBadge compact source={source} />
          </>
        )}
      </div>
    </>
  );
}
