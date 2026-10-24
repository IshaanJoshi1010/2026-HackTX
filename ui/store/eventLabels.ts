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
  if (e.type === "family_change" && typeof p.childrenDelta === "number") {
    return p.childrenDelta > 0 ? (p.childrenDelta === 1 ? "New child" : `${p.childrenDelta} new children`) : EVENT_LABEL.family_change;
  }
  if (e.type === "fuel_price_change" && typeof p.fuelPricePerGal === "number") return `Fuel $${p.fuelPricePerGal.toFixed(2)} a gallon`;
  return EVENT_LABEL[e.type];
}
