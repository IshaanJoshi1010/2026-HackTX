import type { EventType, LifeEvent, Source } from "@/contracts";

/**
 * The Future page's one view of the scenario: everything the timeline, scrubber, event card, drawers and header draw is
 * read from a `Journey`, and a `Journey` is derived (buildJourney) from the store. Nothing here is stored or invented:
 * every month is a modeled month, every dollar is the simulation's, every name comes from the data.
 *
 * SHARED CONTRACT. These types are fixed. Components take a `Journey` (or a piece of one) as a prop so they can be built
 * and tested against `fixtures.ts` with no store, then used with the real thing through `useJourney()`.
 */

/** The two futures on the page: keeping your car, and switching. A "future" is a branch, not a life. */
export type FutureKind = "keep" | "switch";

/** The months the road covers. The x axis of the timeline is this and nothing else. */
export const HORIZON = 60;

export interface VehicleSegment {
  vehicleId: string;
  /** "2022 Camry SE" */
  name: string;
  /** "Camry" */
  model: string;
  /** Months, inclusive of fromMonth. A swap in month 12 gives [0, 12) in the old car and [12, 60] in the new one. */
  fromMonth: number;
  toMonth: number;
}

export interface JourneyEvent {
  id: string;
  type: EventType;
  /** "life": something you told Fork, in both futures at the same month. "swap": the replacement, only in the switch future. */
  kind: "life" | "swap";
  /** The modeled month, 0 to 60. This is the event's position on the time axis, never adjusted for drawing. */
  month: number;
  /** "Move to Denver" */
  title: string;
  /** Calendar date of that month from the scenario's start: "Oct 2027". Month 0 is the month the scenario starts in. */
  dateLabel: string;
  /** "Now", "In 1 yr", "In 2 yr 8 mo" */
  whenLabel: string;
  futures: FutureKind[];
  certainty: LifeEvent["certainty"];
  /** What the person said, when they said it. */
  quote?: string;
  /** As the model wrote them. Technical wording: ui/journey/explain.ts rewrites these for people. */
  assumptions: string[];
  payload: LifeEvent["payload"];
  /** True while the last change touched it, so the page can briefly highlight it. */
  changed: boolean;
}

export interface JourneyBranch {
  kind: FutureKind;
  /** The simulated scenario behind it. Null for the switch offer that has not been compared yet. */
  scenarioId: string | null;
  /** "Keep your Camry", "Switch to the RAV4" */
  title: string;
  /** False for the offer: no cost exists until it is compared, and none is invented. */
  priced: boolean;
  /**
   * Where this branch leaves the other: the modeled swap month for the switch. Null for keep, which never leaves.
   * For the unpriced offer it is where the swap would default to, and the road draws it dashed.
   */
  splitMonth: number | null;
  segments: VehicleSegment[];
  /** The car it ends in. */
  endVehicle: VehicleSegment | null;
  /** Modeled net cost over the whole five years, month 60. It does not depend on the selected month. Null when not priced. */
  fiveYearCost: number | null;
  costSource: Source | undefined;
  /** Net cost through the selected month (the simulation's own monthly figure), labeled as such wherever it is shown. */
  costThroughMonth: number | null;
  selected: boolean;
  /** What the engine said about this branch. For the header only: it is never drawn on the road. */
  verdict: "recommended" | "alternative" | "close" | null;
}

export interface Journey {
  /** The store's revision when this was built. */
  revision: number;
  /** True while a change is being worked out, so affected results can say they are updating. */
  updating: boolean;
  /** Always HORIZON. */
  horizon: number;
  /** The selected month, 0 to 60: the one clock. */
  month: number;
  /** Calendar date of the selected month. */
  monthLabel: string;
  selectedFuture: FutureKind;
  selectedEventId: string | null;
  /** Every event on the road, chronological (ties keep the order they were made in). Life events once, the swap once. */
  events: JourneyEvent[];
  keep: JourneyBranch;
  /** Null when there is no other car to offer. */
  switch: JourneyBranch | null;
  /** The car in the selected future at the selected month. */
  vehicleNow: VehicleSegment;
  /** Switching minus keeping, over the five years, from the two rounded figures shown. Null until both are priced. */
  difference: { amount: number; phrase: string; source: Source | undefined } | null;
  /** Months playback briefly pauses on: each event, and the split. Sorted, unique, within 0 to 60. */
  stops: number[];
  /** The engine's call: which future it prefers, a close call, or nothing yet. */
  call: "keep" | "switch" | "close" | null;
}
