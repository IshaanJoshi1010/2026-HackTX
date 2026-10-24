import type { HistoryRecord } from "../contracts";
import { HistoryRecordSchema } from "../contracts/schemas";
import camryListing from "./listings/camry-primary.json";
import rav4Listing from "./listings/rav4-primary.json";

// A fixed demo timeline anchored to saved snapshots, never to the runtime clock.
// Historical records stay separate from LifeEvent scenarios and simulation output.
function shiftMonths(date: string, months: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + months, day)).toISOString().slice(0, 10);
}
function makeHistory(listing: typeof camryListing, ownedMonths: number): HistoryRecord[] {
  const start = shiftMonths(listing.capturedOn, -ownedMonths);
  const milesPerMonth = 1000; // Synthetic steady 12,000 mi/year assumption for both primary demo cars.
  if (listing.fields.mileage !== ownedMonths * milesPerMonth) throw new Error("Synthetic history must match the saved demo odometer");
  const records: HistoryRecord[] = [];
  const add = (month: number, type: string, description: string) => {
    records.push(HistoryRecordSchema.parse({
      date: shiftMonths(start, month), type, description: `Synthetic: ${description}`,
      mileage: month * milesPerMonth, source: "synthetic",
      provenance: `Fictional ${listing.id} ownership history from data/history.ts, using a steady 12,000 mi/year demo assumption. Not a service record, VIN-derived fact, diagnosis or simulated future event. Final odometer matches data/listings/${listing.id}.json.`,
    }));
  };
  add(0, "ownership", "demo vehicle purchase and ownership start");
  for (let month = 0; month <= ownedMonths; month += 3) {
    add(month, "odometer", month === ownedMonths ? "current demo odometer" : "quarterly odometer reading");
  }
  for (let month = 5; month <= ownedMonths; month += 5) {
    add(month, "maintenance", "tire rotation and routine inspection");
    if (month === 5) add(month, "ownership", "first routine service milestone");
  }
  for (let month = 10; month <= ownedMonths; month += 10) {
    add(month, "maintenance", "oil and filter change");
  }
  if (ownedMonths >= 30) add(30, "service", "engine and cabin air filters replaced");
  if (ownedMonths >= 36) add(36, "service", "12-volt battery replaced as a fictional prior service event");
  else if (ownedMonths >= 18) add(18, "service", "wiper blades replaced as a fictional prior service event");
  // Same-day events are valid. Stable insertion order makes ties deterministic.
  records.sort((a, b) => a.date.localeCompare(b.date) || a.mileage - b.mileage);
  return records;
}
const histories: Record<string, HistoryRecord[]> = {
  [camryListing.fields.vehicleId]: makeHistory(camryListing, 48),
  [rav4Listing.fields.vehicleId]: makeHistory(rav4Listing, 24),
};
/** Primary demo history only. Unknown vehicles never inherit another vehicle's records. */
export function getHistory(vehicleId: string): HistoryRecord[] {
  return Object.hasOwn(histories, vehicleId) ? structuredClone(histories[vehicleId]) : [];
}
