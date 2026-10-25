"use client";

import { SlidersHorizontal } from "lucide-react";
import { useForkStore } from "@/ui/store/useForkStore";
import { IconButton } from "./IconButton";

/** A wordmark, and one button for everything that is not the car or the future. */
export function AppHeader() {
  const inWorkspace = useForkStore((s) => s.phase === "workspace");
  const open = useForkStore((s) => s.ui.detailsOpen);
  const setDetailsOpen = useForkStore((s) => s.actions.setDetailsOpen);

  return (
    <header className="absolute inset-x-0 top-0 z-20 flex h-14 items-center justify-between px-6">
      <span className="text-[13px] font-bold tracking-[0.4em] text-ink">FORK</span>
      {inWorkspace && !open && (
        <IconButton label="Edit assumptions" aria-haspopup="dialog" aria-expanded={open} active={open} onClick={() => setDetailsOpen(!open)}>
          <SlidersHorizontal />
        </IconButton>
      )}
    </header>
  );
}
