import type { LifeEvent, Scenario } from "../contracts";
import { HORIZON_MONTHS } from "./config";

// Branching is pure and immutable: every function returns a new Scenario built from deep copies,
// so no later change to a child can reach its parent or siblings. The sim is causal (month t only depends
// on months <= t), so a branch's points before its fork month are identical to its parent's.

const clampMonth = (m: number) => Math.min(HORIZON_MONTHS, Math.max(0, Math.round(m)));
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "branch";
const copy = <T>(x: T): T => structuredClone(x);

/** Thrown when an edit would rewrite history a branch inherited from its parent. */
export class InheritedEventError extends Error {
  constructor(scenarioId: string, eventId: string) {
    super(`Event ${eventId} is inherited by ${scenarioId} from before its fork month; change it on the parent instead`);
    this.name = "InheritedEventError";
  }
}

/** Branch-owned events land at or after the fork month; earlier months are inherited. */
function placeInBranch(e: LifeEvent, forkMonth: number): LifeEvent {
  const month = clampMonth(e.month);
  if (month >= forkMonth) return { ...copy(e), month };
  return { ...copy(e), month: forkMonth, assumptions: [...e.assumptions, `Moved from month ${month} to the fork month ${forkMonth}`] };
}

/** True when an event belongs to an inherited period that this scenario must not rewrite. */
export function isInherited(s: Scenario, e: LifeEvent): boolean {
  return s.parentId !== null && e.month < s.forkMonth;
}

/** Whether the UI may move, edit or delete this event in this scenario. */
export function canEditEvent(s: Scenario, eventId: string): boolean {
  const e = s.events.find(x => x.id === eventId);
  return e !== undefined && !isInherited(s, e);
}

/**
 * A new branch of `parent` at `month`. It inherits every parent event before the fork month, drops the parent's
 * own future (events at or after the fork month), and adds `newEvents` from the fork month on.
 * The id is deterministic: `${parent.id}/${month}-${slug(name)}`.
 */
export function fork(parent: Scenario, month: number, newEvents: LifeEvent[], name: string): Scenario {
  const forkMonth = clampMonth(month);
  return {
    id: `${parent.id}/${forkMonth}-${slug(name)}`,
    parentId: parent.id,
    forkMonth,
    name,
    events: [...parent.events.filter(e => e.month < forkMonth).map(copy), ...newEvents.map(e => placeInBranch(e, forkMonth))],
    assumptions: copy(parent.assumptions),
  };
}

function updateEvent(s: Scenario, eventId: string, change: (e: LifeEvent) => LifeEvent | null): Scenario {
  const target = s.events.find(e => e.id === eventId);
  if (!target) return copy(s);
  if (isInherited(s, target)) throw new InheritedEventError(s.id, eventId);
  const events: LifeEvent[] = [];
  for (const e of s.events) {
    if (e.id !== eventId) { events.push(copy(e)); continue; }
    const next = change(copy(e));
    if (next) events.push(s.parentId === null ? { ...next, month: clampMonth(next.month) } : placeInBranch(next, s.forkMonth));
  }
  return { ...copy(s), events };
}

/** Moves one event. In a branch it cannot move before the fork month. Unknown ids return an unchanged copy. */
export function moveEvent(s: Scenario, eventId: string, newMonth: number): Scenario {
  return updateEvent(s, eventId, e => ({ ...e, month: newMonth }));
}

/** Patches one event. The id never changes; a payload in the patch replaces the whole payload. */
export function editEvent(s: Scenario, eventId: string, patch: Partial<LifeEvent>): Scenario {
  return updateEvent(s, eventId, e => ({ ...e, ...copy(patch), id: e.id }));
}

export function deleteEvent(s: Scenario, eventId: string): Scenario {
  return updateEvent(s, eventId, () => null);
}

/**
 * First month whose projection can differ between two versions of a scenario (the earliest month any event was
 * added, removed or changed). Points before it are guaranteed identical. Null when the events are equal.
 */
export function affectedFromMonth(before: Scenario, after: Scenario): number | null {
  const key = (e: LifeEvent) => JSON.stringify(e);
  const was = new Map(before.events.map(e => [e.id, e])), now = new Map(after.events.map(e => [e.id, e]));
  let earliest: number | null = null;
  const touch = (m: number) => { earliest = earliest === null ? m : Math.min(earliest, m); };
  for (const [id, e] of was) {
    const n = now.get(id);
    if (!n) touch(e.month);
    else if (key(n) !== key(e)) touch(Math.min(e.month, n.month));
  }
  for (const [id, e] of now) if (!was.has(id)) touch(e.month);
  if (JSON.stringify(before.assumptions) !== JSON.stringify(after.assumptions)) touch(0);
  return earliest;
}
