import type { ReactNode } from "react";
import type { Source } from "@/contracts";
import { SourceBadge } from "./SourceBadge";

export interface DataRowProps {
  label: string;
  value: ReactNode;
  /** Required on purpose: every number shows where it came from. Pass undefined to show the gap. */
  source: Source | undefined;
  detail?: string;
}

/** One labeled number with a quiet source label beneath it. Used inside panels. */
export function DataRow({ label, value, source, detail }: DataRowProps) {
  return (
    <div data-slot="data-row" className="flex items-start justify-between gap-4 border-b border-line py-3 last:border-b-0">
      <span className="pt-0.5 text-sm text-ink/60">{label}</span>
      <span className="flex flex-col items-end gap-0.5">
        <span className="text-base font-medium tabular-nums whitespace-nowrap text-ink">{value}</span>
        <SourceBadge compact source={source} detail={detail} />
      </span>
    </div>
  );
}
