"use client";

import { Check } from "lucide-react";
import type { DriverProfile } from "@/contracts";
import { cn } from "@/lib/utils";
import { SourceBadge } from "@/ui/profile/SourceBadge";
import { useForkStore } from "@/ui/store/useForkStore";

export interface FinanceChipsProps {
  className?: string;
}

const FINANCE_OPTIONS: Array<{ id: DriverProfile["financeType"]; label: string; detail: string }> = [
  { id: "paid_off", label: "Paid off", detail: "Own vehicle clear" },
  { id: "loan", label: "Active loan", detail: "Monthly payment" },
  { id: "lease", label: "Lease", detail: "Term end date" },
];

export function FinanceChips({ className }: FinanceChipsProps) {
  const twin = useForkStore((s) => s.twin);
  const profile = useForkStore((s) => s.explore.confirmedProfile);
  const answerQuestion = useForkStore((s) => s.actions.answerQuestion);

  const currentType = twin?.finance.financeType ?? profile.financeType;
  const source = twin?.finance.provenance.financeType ?? profile.provenance.financeType;

  return (
    <div data-testid="finance-chips" className={cn("space-y-2 text-left", className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-ink/60">
          Vehicle Ownership Structure
        </span>
        <SourceBadge compact source={source} />
      </div>

      <div className="flex flex-wrap gap-2">
        {FINANCE_OPTIONS.map(({ id, label, detail }) => {
          const isSelected = currentType === id;

          return (
            <button
              key={id}
              type="button"
              onClick={() => answerQuestion("financeType", id)}
              className={cn(
                "flex items-center gap-2 rounded border px-3 py-1.5 text-xs transition-colors cursor-pointer",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                isSelected
                  ? "border-ink bg-ink text-canvas font-medium"
                  : "border-line bg-ink/5 text-ink hover:bg-ink/10",
              )}
            >
              <span>{label}</span>
              <span className={cn("text-[10px]", isSelected ? "text-canvas/70" : "text-ink/40")}>
                {detail}
              </span>
              {isSelected && <Check className="size-3" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
