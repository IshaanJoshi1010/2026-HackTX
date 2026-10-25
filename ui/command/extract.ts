/**
 * Offline interpreter for the command bar: turns a typed sentence into proposed life
 * events, and tells a question from a statement, using plain rules. It runs when the AI
 * is not available (no key, no network), so the whole demo still works without it.
 *
 * Rules it follows (from the project's rules, not optional):
 * - Extract, never invent. A value is only produced if the user wrote it. No defaults for
 *   place, miles, price, or family size.
 * - Dates follow the team's rules (the same as ai/dates.ts): "next year" is 12 months,
 *   "in N years" is 12N, a bare year is June of that year (flagged inferred), and with no
 *   time at all the change starts now (flagged inferred, with the assumption written out).
 *   Months are measured from the date the session started from, never the clock.
 * - Payload keys are the ones the simulation reads: location, annualMiles, children,
 *   childrenDelta, fuelPricePerGal.
 * - Nothing here is confirmed. The caller stages these as proposals.
 * - A question creates no events. It only says what the user is asking for, from keywords.
 *   It never produces a number.
 */
import type { Intent, LifeEvent } from "@/contracts";

export type ExtractedEvent = Omit<LifeEvent, "id" | "status">;

const MAX_MONTH = 60;
const clamp = (n: number) => Math.min(MAX_MONTH, Math.max(0, Math.round(n)));

/** Months from now that a clause says, or null if it names no time. */
function monthsIn(clause: string, year: number, month: number): { month: number; inferred: boolean; assumptions: string[] } | null {
  const c = clause.toLowerCase();
  const exact = (m: number) => ({ month: clamp(m), inferred: false, assumptions: [] as string[] });
  if (/\bnext month\b/.test(c)) return exact(1);
  if (/\bnext year\b/.test(c)) return exact(12);
  let m = /\bin (\d{1,2}) (?:years?|yrs?)\b/.exec(c);
  if (m) return exact(Number(m[1]) * 12);
  m = /\bin (\d{1,2}) (?:months?|mos?)\b/.exec(c);
  if (m) return exact(Number(m[1]));
  // a calendar year, but not "2030 miles"
  m = /\b(20[2-4]\d)\b(?!\s*(?:miles|mi|k)\b)/.exec(c);
  if (m) {
    return {
      month: clamp((Number(m[1]) - year) * 12 + 6 - month),
      inferred: true,
      assumptions: ["A bare year is taken as June of that year. Confirm the month."],
    };
  }
  return null;
}

const titleCase = (s: string) => s.replace(/\b[a-z]/g, (ch) => ch.toUpperCase());

const CITY = /\b(?:moving|move|relocating|relocate)\s+to\s+([a-z][a-z.'-]*(?:\s+[a-z][a-z.'-]*){0,2}?)(?=\s+(?:next|in|this|by|for|with|around|soon)\b|[,.;!]|$)/i;
const MILES = /(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k)?\s*(?:miles|mi)\b(?:\s*(?:a|per|\/)\s*(?:year|yr)|\s+(?:annually|yearly))?/i;
const FUEL = /\$\s?(\d+(?:\.\d+)?)\s*(?:\/|per|a)\s*(?:gal|gallon)\b/i;
const ORDINAL_CHILD = /\b(second|2nd|third|3rd|fourth|4th)\s+(?:child|baby|kid)\b/i;
const MORE_CHILD = /\b(?:another|new)\s+(?:child|baby|kid)\b|\b(?:expecting|pregnant|having a baby|adding a (?:child|baby))\b/i;
const EXPECTING = /\b(?:expecting|pregnant|having a baby)\b/i;
const ORDINAL: Record<string, number> = { second: 2, "2nd": 2, third: 3, "3rd": 3, fourth: 4, "4th": 4 };

/** Splits a sentence into the pieces a person means as separate changes. */
function clausesOf(text: string): string[] {
  // Commas inside numbers ("20,000") are not clause breaks.
  const NUM_COMMA = "\u0001";
  return text
    .replace(/(\d),(?=\d)/g, `$1${NUM_COMMA}`)
    .split(/[;,]+|\s+and\s+/i)
    .map((c) => c.split(NUM_COMMA).join(",").trim())
    // "…, and expecting…" leaves a leading "and" on the piece. Neither it nor the full stop is part of the change.
    .map((c) => c.replace(/^(?:and|but|also)\s+/i, "").replace(/[.!]+$/, "").trim())
    .filter(Boolean);
}

/** Year and month (1 to 12) of an ISO date. Falls back to the clock only if the date is unusable. */
function datePartsOf(todayISO: string): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(todayISO);
  if (m) return { year: Number(m[1]), month: Number(m[2]) };
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function extractEvents(text: string, todayISO: string): ExtractedEvent[] {
  const { year, month: nowMonth } = datePartsOf(todayISO);
  const events: ExtractedEvent[] = [];

  for (const clause of clausesOf(text)) {
    const own = monthsIn(clause, year, nowMonth);

    const timing = (pregnancy = false): Pick<ExtractedEvent, "month" | "certainty" | "assumptions"> => {
      if (own) return { month: own.month, certainty: own.inferred ? "inferred" : "clear", assumptions: own.assumptions };
      if (pregnancy) {
        return { month: 9, certainty: "inferred", assumptions: ["Expecting a child is taken as about 9 months away. Confirm the timing."] };
      }
      return { month: 0, certainty: "inferred", assumptions: ["You didn't say when, so this starts now."] };
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

    // "second child" is a count the user gave: children becomes 2. "Another baby" only adds one.
    const ordinal = ORDINAL_CHILD.exec(clause);
    if (ordinal) {
      events.push({ ...base, type: "family_change", payload: { children: ORDINAL[ordinal[1].toLowerCase()] }, ...timing(EXPECTING.test(clause)) });
    } else if (MORE_CHILD.test(clause)) {
      events.push({ ...base, type: "family_change", payload: { childrenDelta: 1 }, ...timing(EXPECTING.test(clause)) });
    }
  }
  return events;
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

const QUESTION_START = /^\s*(?:would|should|could|can|will|is|are|does|do|what|how|which|why|if)\b/i;
const BREAK_EVEN =
  /\b(?:what (?:\w+ ){0,3}?(?:would|will) (?:have to|need to|it take to) change|what (?:\w+ ){0,3}?would make|what needs to change|how (?:low|few|little)\b|break[ -]?even|at what (?:\w+ ){0,2}?(?:point|mileage|price)|threshold)\b/i;
const COMPARE =
  /\b(?:switch(?:ing)?|replac(?:e|ing)|trad(?:e|ing)[ -]?in|swap(?:ping)?|rav4|hybrid|new car|make more sense|better (?:off|choice|option)|buy(?:ing)? (?:a |an )?(?:new )?(?:car|suv))\b/i;
// The two supported cars are the Camry (the one you have) and the RAV4. Naming any other Toyota is a different question.
const OTHER_MODEL = /\b(?:corolla|prius|highlander|tacoma|tundra|sienna|4runner|venza|sequoia|crown|c-hr|bz4x|land cruiser|supra|gr86)\b/i;

export interface OfflineReading {
  intent: Intent;
  events: ExtractedEvent[];
  /** Why nothing was done, when it is not simply "nothing found". */
  note?: string;
}

/**
 * What the user wants, read without the AI. Statements with a change in them become
 * proposed events. Questions about replacing or about what would change the answer
 * say so. Anything else is "clarify": nothing happens and nothing is made up.
 */
export function interpretOffline(text: string, todayISO: string): OfflineReading {
  const events = extractEvents(text, todayISO);
  if (events.length > 0) return { intent: "CREATE_SCENARIO", events };

  const isQuestion = text.includes("?") || QUESTION_START.test(text);
  if (!isQuestion) return { intent: "CLARIFY", events: [] };
  if (BREAK_EVEN.test(text)) return { intent: "FIND_BREAK_EVEN", events: [] };
  if (OTHER_MODEL.test(text) && !/rav4/i.test(text)) {
    return { intent: "CLARIFY", events: [], note: "I can only compare with the 2024 RAV4 Hybrid XLE for now." };
  }
  if (COMPARE.test(text)) return { intent: "COMPARE_SCENARIOS", events: [] };
  return { intent: "CLARIFY", events: [] };
}
