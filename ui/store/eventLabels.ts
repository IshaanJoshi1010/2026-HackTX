import type { LifeEvent } from "@/contracts";

export const EVENT_LABEL: Record<LifeEvent["type"], string> = {
  relocation: "Move",
  mileage_change: "Driving change",
  family_change: "Family change",
  cargo_change: "Cargo change",
  budget_change: "Budget change",
  fuel_price_change: "Fuel price change",
  maintenance_decision: "Maintenance",
  vehicle_replacement: "Replace car",
};

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/**
 * Short human title for an event, using what the event actually says when it says it:
 * "Move to Denver", "20,000 miles a year", "New child", "Fuel $4.50 a gallon".
 */
export function eventTitle(e: Pick<LifeEvent, "type" | "payload">): string {
  const p = e.payload;
  // The simulation reads `location`; `city` is accepted so older saved events still read well.
  const place = p.location ?? p.city;
  if (e.type === "relocation" && typeof place === "string" && place) return `Move to ${place}`;
  if (e.type === "mileage_change" && typeof p.annualMiles === "number") return `${whole.format(p.annualMiles)} miles a year`;
  if (e.type === "family_change" && typeof p.children === "number" && p.children >= 1) {
    // an absolute count the person gave: "second child" is children 2
    return p.children === 1 ? "First child" : p.children === 2 ? "Second child" : p.children === 3 ? "Third child" : `${p.children} children`;
  }
  if (e.type === "family_change" && typeof p.childrenDelta === "number") {
    return p.childrenDelta > 0 ? (p.childrenDelta === 1 ? "New child" : `${p.childrenDelta} new children`) : EVENT_LABEL.family_change;
  }
  if (e.type === "fuel_price_change" && typeof p.fuelPricePerGal === "number") return `Fuel $${p.fuelPricePerGal.toFixed(2)} a gallon`;
  return EVENT_LABEL[e.type];
}

/**
 * What an event sets, when its title does not already say it: "$900 a month", "High cargo need", "18 miles each way".
 * Read from the payload and nothing else; null when the title is the whole story.
 */
export function eventDetail(e: Pick<LifeEvent, "type" | "payload">): string | null {
  const p = e.payload;
  if (e.type === "budget_change" && typeof p.monthlyBudget === "number") return `$${whole.format(p.monthlyBudget)} a month`;
  if (e.type === "cargo_change" && typeof p.cargoNeed === "string") return `${p.cargoNeed.charAt(0).toUpperCase()}${p.cargoNeed.slice(1)} cargo need`;
  const parts: string[] = [];
  if (typeof p.commuteMilesOneWay === "number") parts.push(`${whole.format(p.commuteMilesOneWay)} miles each way`);
  if (typeof p.commuteDaysPerWeek === "number") parts.push(`${p.commuteDaysPerWeek} days a week`);
  return parts.length > 0 ? parts.join(", ") : null;
}

