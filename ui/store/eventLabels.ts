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

/** Short human title for an event. Uses a city when the payload has one. */
export function eventTitle(e: Pick<LifeEvent, "type" | "payload">): string {
  if (e.type === "relocation" && typeof e.payload.city === "string") return `Move to ${e.payload.city}`;
  return EVENT_LABEL[e.type];
}
