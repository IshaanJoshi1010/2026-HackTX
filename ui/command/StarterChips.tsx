"use client";

import { cn } from "@/lib/utils";
import { data } from "@/ui/mocks";

export interface StarterChipsProps {
  /** The example to offer. */
  prompt: string;
  /** Puts the example in the box. It does not submit it. */
  onSelect(prompt: string): void;
  disabled?: boolean;
  className?: string;
}

/** The first example, and the sentence the demo uses. It is Dev 3's, so the AI and the offline rules read the same words. */
export const STARTER_PROMPT = data.demo.brainDump;

interface StarterContext {
  /** Futures on the road, counting the baseline. One means nothing has changed yet. */
  futures: number;
  /** A keep vs replace comparison exists. */
  compared: boolean;
  /** The car the person owns, and the other car Fork knows. */
  current: { model: string };
  other?: { model: string; powertrain: "gas" | "hybrid" };
}

/**
 * The next thing worth typing: first what is changing, then whether another car would make more sense, then what
 * would flip that. Each is a sentence the engine already routes. The chip stays so there is always one to start from.
 */
export function starterPrompt({ futures, compared, current, other }: StarterContext): string {
  if (futures <= 1) return STARTER_PROMPT;
  if (compared || !other) return `What would have to change for keeping the ${current.model} to be the better option?`;
  return `Would switching to a ${other.model}${other.powertrain === "hybrid" ? " Hybrid" : ""} make more sense?`;
}

/** One example, as a chip under the command bar. Clicking it fills the box. */
export function StarterChips({ prompt, onSelect, disabled = false, className }: StarterChipsProps) {
  return (
    <button
      type="button"
      data-testid="starter-chip"
      disabled={disabled}
      onClick={() => onSelect(prompt)}
      className={cn(
        "mx-auto block max-w-xl rounded-full border border-line bg-ink/10 px-4 py-2 text-center text-sm leading-5 text-ink/80 transition-colors",
        "hover:bg-ink/15 hover:text-ink disabled:opacity-40",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
        className,
      )}
    >
      <span className="text-ink/60">Try: </span>&ldquo;{prompt}&rdquo;
    </button>
  );
}
