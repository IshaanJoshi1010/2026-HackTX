"use client";

import { cn } from "@/lib/utils";
import { SourceBadge } from "@/ui/profile/SourceBadge";
import { useForkStore } from "@/ui/store/useForkStore";

export interface WeightsEditorProps {
  className?: string;
}

export function WeightsEditor({ className }: WeightsEditorProps) {
  const profile = useForkStore((s) => s.explore.confirmedProfile);
  const priorities = profile.priorities;
  const source = profile.provenance.priorities;

  const entries: Array<{ label: string; key: keyof typeof priorities }> = [
    { label: "Cost", key: "cost" },
    { label: "Family / Space", key: "family" },
    { label: "Longevity", key: "longevity" },
    { label: "Fuel Economy", key: "fuel" },
    { label: "Comfort", key: "comfort" },
  ];

  return (
    <div data-testid="weights-editor" className={cn("space-y-2 text-left", className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-ink/60">
          Decision Weights
        </span>
        <SourceBadge compact source={source} />
      </div>

      <div className="grid grid-cols-5 gap-2">
        {entries.map(({ label, key }) => {
          const val = Math.round((priorities[key] ?? 0.2) * 100);
          return (
            <div
              key={key}
              className="flex flex-col items-center rounded border border-line bg-ink/[0.02] p-2 text-center"
            >
              <span className="text-sm font-medium tabular-nums text-ink">{val}%</span>
              <span className="text-xs text-ink/50 truncate max-w-full">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
