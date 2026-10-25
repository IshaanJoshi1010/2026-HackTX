"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { customerText } from "@/ui/profile/customerText";
import { impactSentence, momentSentence, type EventImpact } from "./impact";
import type { Journey } from "./types";

/** How long a changed event stays lit. */
const FLASH_MS = 1600;

/**
 * The same size in every state, so choosing an event, moving the scrubber or recalculating never moves the page.
 * Long text is clamped inside it; the full account is behind "Explain this".
 */
export const EVENT_CARD_SIZE = "h-[148px] sm:h-[124px]";

export interface EventCardProps {
  journey: Journey;
  /** What the selected event changes (useEventImpact). Null while it is being worked out, or with no event selected. */
  impact: EventImpact | null;
  /** Opens the explanation drawer. Only offered when an event is selected. */
  onExplain(): void;
  className?: string;
}

/**
 * The short explanation under the timeline: the selected event's name, date and one sentence about what it changes, with
 * "Explain this". With no event selected it says where the selected month stands instead, and offers nothing to press.
 */
export function EventCard({ journey, impact, onExplain, className }: EventCardProps) {
  const event = journey.events.find((e) => e.id === journey.selectedEventId) ?? null;
  const branch = journey.selectedFuture === "switch" && journey.switch ? journey.switch : journey.keep;

  // A change that touched this event lights it once, then lets go. A new change lights it again.
  const litKey = event?.changed ? event.id : null;
  const [seenKey, setSeenKey] = useState<string | null>(litKey);
  const [calm, setCalm] = useState(false);
  if (seenKey !== litKey) {
    setSeenKey(litKey);
    setCalm(false);
  }
  useEffect(() => {
    if (litKey === null || calm) return;
    const timer = setTimeout(() => setCalm(true), FLASH_MS);
    return () => clearTimeout(timer);
  }, [litKey, calm]);
  const lit = litKey !== null && !calm;

  return (
    <section
      role="region"
      aria-label="Selected moment"
      data-testid="event-card"
      data-state={event ? "event" : "moment"}
      data-updating={journey.updating ? "true" : "false"}
      data-changed={lit ? "true" : "false"}
      className={cn(
        "flex flex-col gap-1 overflow-hidden rounded-xl border border-line px-5 py-4 transition-colors duration-700",
        EVENT_CARD_SIZE,
        lit && "fork-fade bg-ink/10",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p data-testid="event-card-when" className="min-w-0 truncate text-sm text-ink/60">
          {event ? `${customerText(event.dateLabel)} · ${customerText(event.whenLabel)}` : customerText(branch.title)}
        </p>
        <p aria-live="polite" data-testid="event-card-updating" className="shrink-0 text-xs text-ink/60">
          {journey.updating ? "Updating" : ""}
        </p>
      </div>

      {event ? (
        <>
          <div className="flex items-start justify-between gap-4">
            <h3 data-testid="event-card-title" className="min-w-0 truncate text-xl leading-9 font-medium tracking-tight text-ink">
              {customerText(event.title)}
            </h3>
            <button
              type="button"
              onClick={onExplain}
              className="h-9 shrink-0 rounded-full bg-ink px-4 text-sm font-medium text-canvas transition-colors duration-200 hover:bg-ink/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Explain this
            </button>
          </div>
          <p data-testid="event-card-sentence" className={cn("line-clamp-2 text-base text-ink/80", journey.updating && "opacity-60")}>
            {customerText(impactSentence(event, impact, { updating: journey.updating }))}
          </p>
        </>
      ) : (
        <p data-testid="event-card-sentence" className={cn("line-clamp-3 text-lg text-ink/85", journey.updating && "opacity-60")}>
          {customerText(momentSentence(journey))}
        </p>
      )}
    </section>
  );
}
