"use client";

import { cn } from "@/lib/utils";
import { data } from "@/ui/mocks";

export interface StarterChipsProps {
  /** Puts the example in the box. It does not submit it. */
  onSelect(prompt: string): void;
  disabled?: boolean;
  className?: string;
}

/** The one example, and the sentence the demo uses. It is Dev 3's, so the AI and the offline rules read the same words. */
export const STARTER_PROMPT = data.demo.brainDump;

/** A single quiet line under the command bar. Clicking it fills the box. */
export function StarterChips({ onSelect, disabled = false, className }: StarterChipsProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(STARTER_PROMPT)}
      className={cn(
        "mx-auto block max-w-full truncate px-2 text-sm text-ink/45 transition-colors hover:text-ink/80 disabled:opacity-40",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
        className,
      )}
    >
      Try: &ldquo;{STARTER_PROMPT}&rdquo;
    </button>
  );
}
