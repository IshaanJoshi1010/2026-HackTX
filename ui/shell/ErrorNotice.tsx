"use client";

import { X } from "lucide-react";
import { customerText } from "@/ui/profile/customerText";
import { useForkStore } from "@/ui/store/useForkStore";

/**
 * Says so when something did not work, instead of failing in silence. It sits above the command
 * bar on both pages, in the store's own words, and goes away when dismissed or when the next
 * action starts. (The landing page shows its own errors next to its own fields.)
 */
export function ErrorNotice() {
  const error = useForkStore((s) => s.error);
  const clearError = useForkStore((s) => s.actions.clearError);
  if (!error) return null;
  const text = customerText(error);
  return (
    <div
      role="alert"
      data-testid="error-notice"
      className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 rounded-full bg-ink/10 py-1.5 pr-1.5 pl-4 text-sm text-ink backdrop-blur-xl"
    >
      <span className="min-w-0 flex-1 truncate" title={text}>
        {text}
      </span>
      <button
        type="button"
        onClick={clearError}
        aria-label="Dismiss"
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-ink/60 transition-colors hover:bg-ink/10 hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
