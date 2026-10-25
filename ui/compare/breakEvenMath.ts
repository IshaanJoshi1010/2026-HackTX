/**
 * Pure helpers for the "what would change it" view. No React, no store. Every number
 * comes in from the engine (findBreakEven and reproduceBreakEven); this only words and
 * places them.
 */
import type { BreakEvenResult, DriverProfile, Scenario, Source } from "@/contracts";
import type { BreakEvenCheck } from "@/ui/store/useForkStore";

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const usdFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** "14,434 mi/yr" for driving, "$4.12/gal" for fuel price. */
export function formatParameter(parameter: string, value: number): string {
  return parameter === "fuelPricePerGal" ? `$${value.toFixed(2)}/gal` : `${whole.format(value)} mi/yr`;
}

/** Where a value sits on the tested range, from 0 (left end) to 1 (right end). Outside the range pins to an end. */
export function fractionAlong(value: number, bounds: readonly [number, number]): number {
  const [lo, hi] = bounds;
  if (!(hi > lo)) return 0;
  return Math.min(1, Math.max(0, (value - lo) / (hi - lo)));
}

export interface BreakEvenNames {
  keepId: string;
  replaceId: string;
  /** With the article: "the Camry". */
  keepName: string;
  replaceName: string;
}

export interface BreakEvenRow {
  side: "below" | "above";
  /** The value tested on this side, formatted. */
  at: string;
  /** Who leads there, in words. */
  leads: string;
  keepNet: number | null;
  replaceNet: number | null;
}

export interface BreakEvenCopy {
  headline: string;
  /** Where this plan stands today, or null when nothing was found. */
  today: string | null;
  /** The two reruns that let anyone check the flip by typing the numbers in. Empty when there is no threshold. */
  rows: BreakEvenRow[];
}

function leaderText(preferred: string | undefined, n: BreakEvenNames): string {
  if (preferred === n.keepId) return `Keeping ${n.keepName} leads`;
  if (preferred === n.replaceId) return `Switching to ${n.replaceName} leads`;
  return "No clear winner";
}

export function breakEvenCopy(a: { breakEven: BreakEvenResult; check: BreakEvenCheck | null } & BreakEvenNames): BreakEvenCopy {
  const { breakEven: be, check } = a;
  if (!be.found) {
    const [lo, hi] = be.testedBounds;
    return {
      headline: `Nothing between ${formatParameter(be.parameter, lo)} and ${formatParameter(be.parameter, hi)} changes the answer`,
      today: null,
      rows: [],
    };
  }
  const value = formatParameter(be.parameter, be.threshold);
  // On the flip side the other car leads. The rerun says which one, so the words never guess.
  const target = check?.[be.direction].preferredScenarioId;
  const headline =
    target === a.keepId
      ? `Keeping ${a.keepName} wins ${be.direction} ${value}`
      : target === a.replaceId
        ? `Switching to ${a.replaceName} wins ${be.direction} ${value}`
        : `The answer changes ${be.direction} ${value}`;
  const row = (side: "below" | "above"): BreakEvenRow | null => {
    const r = check?.[side];
    return r
      ? {
          side,
          at: formatParameter(be.parameter, r.value),
          leads: leaderText(r.preferredScenarioId, a),
          keepNet: r.netCost[a.keepId] ?? null,
          replaceNet: r.netCost[a.replaceId] ?? null,
        }
      : null;
  };
  return {
    headline,
    today: `In this plan: ${formatParameter(be.parameter, be.currentValue)}`,
    rows: [row("below"), row("above")].filter((r): r is BreakEvenRow => r !== null),
  };
}

export const money = (n: number): string => usdFmt.format(n);

/**
 * Where the yearly mileage in a future came from. A mileage the person said and confirmed is
 * theirs ("user"); otherwise it is whatever the profile says it is. Undefined shows the gap.
 */
export function annualMilesSource(scenario: Scenario | undefined, profile: DriverProfile): Source | undefined {
  const said = [...(scenario?.events ?? [])]
    .reverse()
    .find((e) => e.status === "confirmed" && e.type === "mileage_change" && typeof e.payload.annualMiles === "number");
  return said ? "user" : profile.provenance.annualMiles;
}
