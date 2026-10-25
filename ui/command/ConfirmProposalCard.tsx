"use client";

import { GitBranch, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { monthLabel } from "@/ui/profile/format";
import { eventTitle } from "@/ui/store/eventLabels";
import { useForkStore } from "@/ui/store/useForkStore";

export interface ConfirmProposalCardProps {
  className?: string;
  onConfirmed?: () => void;
}

export function ConfirmProposalCard({ className, onConfirmed }: ConfirmProposalCardProps) {
  const drafts = useForkStore((s) => s.explore.draftChanges);
  const busy = useForkStore((s) => s.ui.busy);
  const { confirmDrafts, rejectDraft } = useForkStore((s) => s.actions);

  if (drafts.length === 0) return null;

  const handleConfirm = () => {
    confirmDrafts(drafts.map((d) => d.id));
    onConfirmed?.();
  };

  const isBusy = busy !== "idle";

  return (
    <div
      data-testid="confirm-proposal-card"
      className={cn(
        "fork-rise rounded-xl border border-line bg-canvas/95 p-4 text-left shadow-2xl backdrop-blur-md",
        className,
      )}
    >
      <div className="flex items-center justify-between pb-2.5 border-b border-line">
        <div className="flex items-center gap-2">
          <span className="flex size-2 rounded-full bg-ink animate-pulse" />
          <h3 className="text-sm font-medium text-ink">
            {drafts.length} {drafts.length === 1 ? "life change" : "life changes"} mapped
          </h3>
        </div>
        <span className="text-xs text-ink/40">Ready to simulate</span>
      </div>

      <div className="mt-3 space-y-2">
        {drafts.map((draft) => (
          <div
            key={draft.id}
            data-testid={`draft-row-${draft.id}`}
            className="flex items-center justify-between gap-3 rounded-lg border border-line bg-ink/[0.03] px-3 py-2 text-xs"
          >
            <div className="flex-1 truncate">
              <div className="flex items-center gap-2">
                <span className="font-medium text-ink">{eventTitle(draft)}</span>
                <span className="rounded bg-ink/10 px-1.5 py-0.5 text-[10px] text-ink/60 tabular-nums">
                  {monthLabel(draft.month)}
                </span>
                {draft.certainty === "inferred" && (
                  <span className="rounded border border-line px-1 text-[10px] uppercase text-ink/60">
                    inferred
                  </span>
                )}
              </div>
              {draft.quote && (
                <p className="mt-0.5 text-[11px] italic text-ink/50 truncate">
                  &ldquo;{draft.quote}&rdquo;
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => rejectDraft(draft.id)}
              title="Remove change"
              aria-label="Remove change"
              className="flex size-6 shrink-0 items-center justify-center rounded text-ink/40 hover:bg-ink/10 hover:text-ink transition-colors cursor-pointer"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3.5 flex items-center justify-between pt-2.5 border-t border-line">
        <button
          type="button"
          onClick={() => drafts.forEach((d) => rejectDraft(d.id))}
          className="text-xs text-ink/50 hover:text-ink transition-colors cursor-pointer"
        >
          Discard
        </button>

        <button
          type="button"
          disabled={isBusy}
          onClick={handleConfirm}
          className={cn(
            "flex h-8 items-center gap-2 rounded px-4 text-xs font-medium transition-colors cursor-pointer",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
            "bg-ink text-canvas hover:bg-ink/85 disabled:opacity-50",
          )}
        >
          <GitBranch className="size-3.5" />
          <span>Branch timeline</span>
        </button>
      </div>
    </div>
  );
}
