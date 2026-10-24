/**
 * Offline fallback for the brain dump box: turns a typed sentence into proposed
 * life events using plain rules, when the AI is not available.
 *
 * Rules it follows (from the project's rules, not optional):
 * - Extract, never invent. A value is only produced if the user wrote it. No
 *   defaults for place, miles, price, or family size.
 * - If the user did not say when, the month stays a labeled default (12) and the
 *   event is marked "inferred" with an assumption saying so.
 * - Payload keys are the ones the simulation reads: location, annualMiles,
 *   childrenDelta, fuelPricePerGal.
 * - Nothing here is confirmed. The caller stages these as proposals.
 *
 * This belongs in Dev 3's offline interpret. Move it there when that lands.
 */
import type { LifeEvent } from "@/contracts";

export type ExtractedEvent = Omit<LifeEvent, "id" | "status">;

export const DEFAULT_MONTH = 12;
const MAX_MONTH = 60;
const clamp = (n: number) => Math.min(MAX_MONTH, Math.max(0, Math.round(n)));

/** Months from now that a clause says, or null if it names no time. */
function monthsIn(clause: string, nowYear: number): number | null {
  const c = clause.toLowerCase();
  if (/\bnext month\b/.test(c)) return 1;
  if (/\bnext year\b/.test(c)) return 12;
  let m = /\bin (\d{1,2}) (?:years?|yrs?)\b/.exec(c);
  if (m) return clamp(Number(m[1]) * 12);
  m = /\bin (\d{1,2}) (?:months?|mos?)\b/.exec(c);
  if (m) return clamp(Number(m[1]));
  // a calendar year, but not "2030 miles"
  m = /\b(20[2-4]\d)\b(?!\s*(?:miles|mi|k)\b)/.exec(c);
  if (m) return clamp((Number(m[1]) - nowYear) * 12);
  return null;
}

const titleCase = (s: string) => s.replace(/\b[a-z]/g, (ch) => ch.toUpperCase());

const CITY = /\b(?:moving|move|relocating|relocate)\s+to\s+([a-z][a-z.'-]*(?:\s+[a-z][a-z.'-]*){0,2}?)(?=\s+(?:next|in|this|by|for|with|around|soon)\b|[,.;!]|$)/i;
const MILES = /(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k)?\s*(?:miles|mi)\b(?:\s*(?:a|per|\/)\s*(?:year|yr)|\s+(?:annually|yearly))?/i;
const FUEL = /\$\s?(\d+(?:\.\d+)?)\s*(?:\/|per|a)\s*(?:gal|gallon)\b/i;
const CHILD = /\b(?:second|2nd|third|3rd|another|new)\s+(?:child|baby|kid)\b|\b(?:expecting|pregnant|having a baby|adding a (?:child|baby))\b/i;

/** Splits a sentence into the pieces a person means as separate changes. */
function clausesOf(text: string): string[] {
  // Commas inside numbers ("20,000") are not clause breaks.
  const NUM_COMMA = "\u0001";
  return text
    .replace(/(\d),(?=\d)/g, `$1${NUM_COMMA}`)
    .split(/[;,]+|\s+and\s+/i)
    .map((c) => c.split(NUM_COMMA).join(",").trim())
    .filter(Boolean);
}

export function extractEvents(text: string, nowYear: number): ExtractedEvent[] {
  const events: ExtractedEvent[] = [];
  let carried: number | null = null; // the last time the user named, for clauses that name none

  for (const clause of clausesOf(text)) {
    const own = monthsIn(clause, nowYear);
    if (own !== null) carried = own;

    const timing = (): Pick<ExtractedEvent, "month" | "certainty" | "assumptions"> => {
      if (own !== null) return { month: own, certainty: "clear", assumptions: [] };
      if (carried !== null) {
        return { month: carried, certainty: "inferred", assumptions: ["No time given here, so this uses the time from the change before it."] };
      }
      return { month: DEFAULT_MONTH, certainty: "inferred", assumptions: [`You didn't say when, so this assumes ${DEFAULT_MONTH} months from now.`] };
    };

    const base = { source: "user" as const, quote: clause };

    const city = CITY.exec(clause);
    if (city) {
      events.push({ ...base, type: "relocation", payload: { location: titleCase(city[1].trim()) }, ...timing() });
    }

    const fuel = FUEL.exec(clause);
    if (fuel) {
      events.push({ ...base, type: "fuel_price_change", payload: { fuelPricePerGal: Number(fuel[1]) }, ...timing() });
    } else {
      const miles = MILES.exec(clause);
      if (miles) {
        const n = Number(miles[1].replace(/,/g, "")) * (miles[2] ? 1000 : 1);
        // Only a yearly figure counts. "40 miles each way" is a commute, not annual miles.
        const yearly = /(?:annual|yearly|per year|a year|\/\s*year|\/\s*yr)/i.test(clause);
        if (n >= 1000 || yearly) events.push({ ...base, type: "mileage_change", payload: { annualMiles: n }, ...timing() });
      }
    }

    if (CHILD.test(clause)) {
      events.push({ ...base, type: "family_change", payload: { childrenDelta: 1 }, ...timing() });
    }
  }
  return events;
}
