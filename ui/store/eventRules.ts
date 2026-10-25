import type { LifeEvent } from "@/contracts";

// Rules every change has to pass before it can count, wherever it came from: a typed sentence, the AI, or the manual form.

/** What a number in a change may be, and what to call it. Past these the number is a typo, and a simulation of it would hang. */
const LIMITS: Record<string, { max: number; min?: number; label: string }> = {
  annualMiles: { max: 200_000, label: "Yearly driving" },
  commuteMilesOneWay: { max: 500, label: "A one way commute" },
  commuteDaysPerWeek: { max: 7, label: "Commute days a week" },
  householdSize: { max: 20, min: 1, label: "Household size" },
  children: { max: 20, label: "Children" },
  childrenDelta: { max: 20, min: -20, label: "New children" },
  carSeats: { max: 10, label: "Car seats" },
  fuelPricePerGal: { max: 50, label: "Fuel price" },
  monthlyBudget: { max: 100_000, label: "Monthly budget" },
  price: { max: 10_000_000, label: "Purchase price" },
  mileage: { max: 1_000_000, label: "Odometer" },
};

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** A plain sentence when a change has a number that cannot be real, otherwise null. */
export function payloadProblem(e: Pick<LifeEvent, "payload">): string | null {
  for (const [key, value] of Object.entries(e.payload)) {
    const limit = LIMITS[key];
    if (!limit || typeof value !== "number") continue;
    if (!Number.isFinite(value)) return `${limit.label} is not a number Fork can use.`;
    const min = limit.min ?? 0;
    if (value > limit.max || value < min) {
      return `${limit.label} of ${whole.format(value)} is outside what Fork can model (${whole.format(min)} to ${whole.format(limit.max)}). Check the number.`;
    }
  }
  return null;
}

/** Two changes are the same change when they are the same kind, in the same month, setting the same things. */
export function eventKey(e: Pick<LifeEvent, "type" | "month" | "payload">): string {
  const payload = Object.fromEntries(Object.entries(e.payload).sort(([a], [b]) => (a < b ? -1 : 1)));
  return JSON.stringify([e.type, Math.round(e.month), payload]);
}

/** The proposals that are not already waiting, and not already part of the future they would be added to. */
export function freshProposals<T extends Pick<LifeEvent, "type" | "month" | "payload">>(proposals: T[], waiting: LifeEvent[], inFuture: LifeEvent[]): T[] {
  const taken = new Set([...waiting, ...inFuture.filter((e) => e.status === "confirmed")].map(eventKey));
  const out: T[] = [];
  for (const p of proposals) {
    const k = eventKey(p);
    if (taken.has(k)) continue;
    taken.add(k); // and not twice inside one sentence either
    out.push(p);
  }
  return out;
}

/** A scenario with an id nobody else has: the same one when it is free, otherwise with -2, -3 and so on. */
export function withUniqueId<T extends { id: string }>(scenario: T, taken: Array<{ id: string }>): T {
  const used = new Set(taken.map((s) => s.id));
  if (!used.has(scenario.id)) return scenario;
  let n = 2;
  while (used.has(`${scenario.id}-${n}`)) n += 1;
  return { ...scenario, id: `${scenario.id}-${n}` };
}
