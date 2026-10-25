"use client";

import { GitBranch, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { monthLabel } from "@/ui/profile/format";
import { eventDetail, eventTitle } from "@/ui/store/eventLabels";
import { useForkStore } from "@/ui/store/useForkStore";

export interface ConfirmProposalCardProps {
  className?: string;
  onConfirmed?: () => void;
}

/**
 * What Fork understood, before it counts. Each change says what it is, when, and in your own words; anything Fork had to
 * assume says so right there, so nothing is confirmed on a guess you could not see.
 */
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
      className={cn("fork-rise rounded-xl border border-line bg-canvas/95 p-4 text-left shadow-2xl backdrop-blur-md", className)}
    >
      <h3 className="text-sm font-medium text-ink">
        {drafts.length} {drafts.length === 1 ? "change" : "changes"} to confirm
      </h3>

      <ul className="mt-2 divide-y divide-line">
        {drafts.map((draft) => {
          const detail = eventDetail(draft);
          return (
            <li key={draft.id} data-testid={`draft-row-${draft.id}`} className="flex items-start justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <p>
                  <span className="font-medium text-ink">{eventTitle(draft)}</span>
                  <span className="text-ink/60">
                    {" "}
                    {draft.month === 0 ? "now" : `in ${monthLabel(draft.month)}`}
                    {detail ? `, ${detail}` : ""}
                    {draft.certainty === "inferred" ? ", inferred" : ""}
                  </span>
                </p>
                {draft.quote && <p className="mt-0.5 truncate text-xs italic text-ink/60">&ldquo;{draft.quote}&rdquo;</p>}
                {draft.assumptions.length > 0 && (
                  <ul data-testid="draft-assumptions" className="mt-1 text-xs leading-5 text-ink/60">
                    {draft.assumptions.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                )}
              </div>

              <button
                type="button"
                onClick={() => rejectDraft(draft.id)}
                title="Remove change"
                aria-label="Remove change"
                className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-ink/55 transition-colors hover:bg-ink/10 hover:text-ink"
              >
                <X className="size-3.5" />
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => drafts.forEach((d) => rejectDraft(d.id))}
          className="cursor-pointer text-xs text-ink/60 transition-colors hover:text-ink"
        >
          Discard
        </button>

        <button
          type="button"
          disabled={isBusy}
          onClick={handleConfirm}
          className={cn(
            "flex h-8 cursor-pointer items-center gap-2 rounded px-4 text-xs font-medium transition-colors",
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
