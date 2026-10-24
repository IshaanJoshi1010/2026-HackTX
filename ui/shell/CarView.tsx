"use client";

import { SkipForward } from "lucide-react";
import { useForkStore } from "@/ui/store/useForkStore";
import { Identity } from "./Identity";

/**
 * The first page: the car, and what it is called. The command bar and the page
 * switch float at the bottom (see Workspace). That is all.
 */
export function CarView() {
  const morphing = useForkStore((s) => s.stage.phase === "transition");
  const skip = useForkStore((s) => s.actions.skip);

  return (
    <>
      <Identity />
      {morphing && (
        <button
          type="button"
          onClick={skip}
          className="absolute left-1/2 top-40 z-10 flex h-9 -translate-x-1/2 items-center gap-2 rounded-full bg-ink/10 px-5 text-sm font-medium text-ink backdrop-blur-md transition-colors hover:bg-ink/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Skip <SkipForward className="size-4" />
        </button>
      )}
    </>
  );
}
