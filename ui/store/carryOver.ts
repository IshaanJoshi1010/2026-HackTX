import type { LifeEvent, Scenario } from "@/contracts";
import { eventTitle } from "./eventLabels";
import { clampMonth } from "./months";

// sim.fork keeps the parent's past and drops the parent's own future, by design. A second brain dump is not a
// reason to forget what the first one said, so the store hands fork the later parent events too, unless the new
// events speak for the same thing.

/** "city" is the old spelling of "location". */
const keyOf = (k: string) => (k === "city" ? "location" : k);

/** Delta keys add to what is there (a new child on top of a new child), so two of them never replace each other. */
const absoluteKeys = (e: LifeEvent): string[] => Object.keys(e.payload).filter((k) => !/Delta$/.test(k)).map(keyOf);

/**
 * The new event speaks for the carried one when it is the same kind of change, sets the same value, and lands on or
 * before it. Left in, the carried event would undo the new one the month it fires.
 */
function overrides(next: LifeEvent, carried: LifeEvent): boolean {
  if (next.type !== carried.type || clampMonth(next.month) > carried.month) return false;
  const keys = new Set(absoluteKeys(carried));
  return absoluteKeys(next).some((k) => keys.has(k));
}

export interface CarryOver {
  /** Everything to give sim.fork: the carried parent events, then the new ones. */
  events: LifeEvent[];
  carried: LifeEvent[];
  /** Parent events at or after the fork month that a new event replaced. */
  replaced: LifeEvent[];
}

/**
 * Parent events at or after `forkMonth` that survive into the new branch, plus the new events. A replaced parent
 * event is named on the event that replaced it, so the loss is visible and not silent.
 */
export function carryOver(parent: Scenario, forkMonth: number, newEvents: LifeEvent[]): CarryOver {
  const from = clampMonth(forkMonth);
  const later = parent.events.filter((e) => e.status === "confirmed" && e.month >= from);
  const replaced = later.filter((c) => newEvents.some((n) => overrides(n, c)));
  const carried = later.filter((c) => !replaced.includes(c));
  const noted = newEvents.map((n) => {
    const hit = replaced.filter((c) => overrides(n, c));
    if (hit.length === 0) return n;
    const lines = hit.map((c) => `Replaces "${eventTitle(c)}" at month ${c.month} from the earlier future`);
    return { ...n, assumptions: [...n.assumptions, ...lines] };
  });
  return { events: [...carried, ...noted], carried, replaced };
}
