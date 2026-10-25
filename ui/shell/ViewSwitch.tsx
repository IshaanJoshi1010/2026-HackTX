"use client";

import { cn } from "@/lib/utils";
import { useForkStore, type View } from "@/ui/store/useForkStore";
import { Tabs } from "./Tabs";

const VIEWS: Array<{ id: View; label: string }> = [
  { id: "car", label: "Car" },
  { id: "future", label: "Future" },
];

/** The only navigation. Two pages: the car, and the timeline of futures. Workspace renders each page as the tab's panel. */
export function ViewSwitch() {
  const view = useForkStore((s) => s.ui.view);
  const setView = useForkStore((s) => s.actions.setView);

  return (
    <Tabs
      group="page"
      label="Page"
      tabs={VIEWS}
      value={view}
      onChange={setView}
      className="mx-auto flex w-fit rounded-full bg-ink/10 p-1 backdrop-blur-xl"
      tabClassName={(selected) =>
        cn(
          "h-8 min-w-20 rounded-full px-5 text-sm font-medium transition-colors duration-300",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
          selected ? "bg-ink text-canvas" : "text-ink/60 hover:text-ink",
        )
      }
    />
  );
}
