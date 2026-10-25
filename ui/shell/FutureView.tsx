"use client";

import { ExplainContent } from "@/ui/journey/ExplainContent";
import { EventCard } from "@/ui/journey/EventCard";
import { JourneyDrawers } from "@/ui/journey/JourneyDrawers";
import { JourneyHeader } from "@/ui/journey/JourneyHeader";
import { JourneyTimeline } from "@/ui/journey/JourneyTimeline";
import { Scrubber } from "@/ui/journey/Scrubber";
import { useEventImpact } from "@/ui/journey/useEventImpact";
import { useJourney, useJourneyActions } from "@/ui/journey/useJourney";
import { usePlayback } from "@/ui/journey/usePlayback";
import { useForkStore } from "@/ui/store/useForkStore";
import { FutureSelector } from "./FutureSelector";

/**
 * The second page: your next five years as one interactive road. Everything on it reads the same clock (the selected
 * month) and the same scenario state, through one Journey:
 *   the recommendation and what it costs, the road with both futures, a scrubber with play, and one compact explanation
 *   of the selected moment. Costs over time, the reasoning and the inputs are each one deliberate click away.
 * The chat composer sits below this page (Workspace gives it room), so it never covers the road.
 */
export function FutureView({ bottomInset = 0 }: { bottomInset?: number }) {
  const journey = useJourney();
  const go = useJourneyActions();
  const playing = useForkStore((s) => s.ui.playing);
  const reducedMotion = useForkStore((s) => s.ui.reducedMotion);
  const nextActionLabel = useForkStore((s) => s.evaluation?.nextAction.label ?? "");
  const play = useForkStore((s) => s.actions.play);
  const pause = useForkStore((s) => s.actions.pause);

  // The player moves the one clock; it never starts by itself.
  usePlayback(journey?.stops ?? []);
  const impact = useEventImpact(journey?.selectedEventId ?? null, { future: journey?.selectedFuture });

  if (!journey) return null;

  return (
    <>
      {/* Content slides away under a soft fade, not under the header. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-[11] h-20 bg-gradient-to-b from-black via-black/80 to-transparent" />
      <div
        data-testid="future-view"
        style={{ bottom: bottomInset }}
        className="fork-page absolute inset-x-0 top-0 z-10 overflow-y-auto px-[clamp(1rem,4vw,3rem)] pb-8 pt-[clamp(3.5rem,8vh,5.5rem)]"
      >
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-5">
          <JourneyHeader
            journey={journey}
            nextActionLabel={nextActionLabel}
            onOpenRecommendation={() => go.openDrawer("recommendation")}
            onOpenCosts={() => go.openDrawer("costs")}
            onCompare={go.compare}
          />

          {/* Only when you have made more than one life to look at. */}
          <FutureSelector className="self-end" />

          <JourneyTimeline
            journey={journey}
            reducedMotion={reducedMotion}
            onScrub={go.scrub}
            onSelectEvent={go.selectEvent}
            onSelectFuture={go.selectFuture}
            onCompare={go.compare}
          />

          <Scrubber journey={journey} playing={playing} onScrub={go.scrub} onTogglePlay={() => (playing ? pause() : play())} />

          <EventCard journey={journey} impact={impact} onExplain={() => go.openDrawer("explain")} />
        </div>
      </div>

      <JourneyDrawers journey={journey} explain={<ExplainContent journey={journey} impact={impact} />} />
    </>
  );
}
