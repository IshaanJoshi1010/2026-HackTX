"use client";

import { useState, type ReactNode } from "react";
import { useComparison } from "@/ui/compare/ComparisonSection";
import { verdictHeadline } from "@/ui/compare/Verdict";
import { customerText } from "@/ui/profile/customerText";
import { useForkStore, type DrawerId } from "@/ui/store/useForkStore";
import { CostsContent } from "./CostsContent";
import { Drawer } from "./Drawer";
import { RecommendationContent } from "./RecommendationContent";
import type { Journey } from "./types";

export interface JourneyDrawersProps {
  journey: Journey;
  /** What "Explain this" shows for the selected moment. Another part of the page provides it. */
  explain: ReactNode;
}

/**
 * The Future page's one drawer. The store says which of the three is open (`ui.drawer`) and this draws exactly one
 * panel: opening another while it is up swaps what is inside it, it never stacks a second. Closing, by the button, the
 * dim layer or Escape, goes through the store's closeDrawer.
 *
 *  - explain: the selected moment (`explain` is the body)
 *  - costs: "Compare costs"
 *  - recommendation: titled with the engine's own headline ("Close call")
 */
export function JourneyDrawers({ journey, explain }: JourneyDrawersProps) {
  const drawer = useForkStore((s) => s.ui.drawer);
  const closeDrawer = useForkStore((s) => s.actions.closeDrawer);
  const c = useComparison();

  // While it slides shut the panel keeps saying what it was showing, rather than going blank.
  const [shown, setShown] = useState<DrawerId>(drawer ?? "explain");
  if (drawer !== null && drawer !== shown) setShown(drawer);

  let title: string;
  let body: ReactNode;
  if (shown === "costs") {
    title = "Compare costs";
    body = <CostsContent journey={journey} />;
  } else if (shown === "recommendation") {
    title = c
      ? customerText(
          verdictHeadline({
            evaluation: c.evaluation,
            keepId: c.comparison.keepId,
            replaceId: c.comparison.replaceId,
            keepModel: c.twin.vehicle.model,
            replaceModel: c.replacement.model,
          }).headline,
        )
      : "Keep or switch?";
    body = <RecommendationContent journey={journey} />;
  } else {
    title = customerText(journey.events.find((e) => e.id === journey.selectedEventId)?.title ?? "This moment");
    body = explain;
  }

  return (
    <Drawer open={drawer !== null} title={title} onClose={closeDrawer}>
      {body}
    </Drawer>
  );
}
