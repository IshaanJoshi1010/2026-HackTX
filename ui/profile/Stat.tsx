import type { ReactNode } from "react";
import type { Source } from "@/contracts";
import { cn } from "@/lib/utils";
import { SourceBadge } from "./SourceBadge";

export interface StatProps {
  label: string;
  value: ReactNode;
  /** Required on purpose: every number shows where it came from. Pass undefined to show the gap. */
  source: Source | undefined;
  detail?: string;
  size?: "lg" | "md";
}

/** A big number with a small label and its source underneath. Same pattern as a spec row. */
export function Stat({ label, value, source, detail, size = "md" }: StatProps) {
  return (
    <div data-slot="stat" className="flex flex-col items-center gap-1.5 text-center">
      <span
        className={cn(
          "leading-none font-medium tabular-nums tracking-tight whitespace-nowrap text-ink",
          size === "lg" ? "text-[56px]" : "text-[28px]",
        )}
      >
        {value}
      </span>
      <span className="text-[13px] text-ink/60">{label}</span>
      <SourceBadge compact source={source} detail={detail} />
    </div>
  );
}
