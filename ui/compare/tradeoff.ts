import type { DecisionEvaluation, DriverProfile } from "@/contracts";
import type { ScenarioScore } from "@/decision";

/**
 * Why a comparison comes out the way it does, from the engine's own per-priority scores. Pure: words about what the engine
 * already calculated, never a number the engine did not produce. SHARED CONTRACT: the types below are fixed. Whoever owns
 * `buildTradeoff` fills in the body; the page and the timeline read `Tradeoff` through `useTradeoff`.
 */
export type FactorKey = "cost" | "fuel" | "longevity" | "family" | "comfort";

/** Who is ahead on one priority, after weighting it by how much you said it matters. */
export type Leader = "keep" | "switch" | "level";

export interface TradeoffRow {
  key: FactorKey;
  /** "Cost", "Fuel use", "Life left", "Family fit", "Comfort". */
  label: string;
  leader: Leader;
}

export interface Tradeoff {
  /** All five priorities, in this order: cost, fuel, longevity, family, comfort. */
  rows: TradeoffRow[];
  /**
   * One or two sentences for under the totals: what each car is ahead on, and why that does or does not settle it. Words
   * only, no dollar figures and no scores, since the totals are already on the page.
   */
  sentence: string;
  /** True when the engine called it a close call (inconclusive). */
  closeCall: boolean;
}

export interface TradeoffInput {
  scores: ScenarioScore[];
  evaluation: DecisionEvaluation;
  keepId: string;
  replaceId: string;
  /** "the Camry" */
  keepName: string;
  /** "the RAV4" */
  switchName: string;
  priorities: DriverProfile["priorities"];
}

/** A gap in weighted contribution smaller than this is a tie. */
const LEVEL_GAP = 0.005;

const FACTORS: ReadonlyArray<{ key: FactorKey; label: string }> = [
  { key: "cost", label: "Cost" },
  { key: "fuel", label: "Fuel use" },
  { key: "longevity", label: "Life left" },
  { key: "family", label: "Family fit" },
  { key: "comfort", label: "Comfort" },
];

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "a", "a and b", "a, b and c". */
function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const finite = (n: number | undefined) => (typeof n === "number" && Number.isFinite(n) ? n : 0);

/**
 * What the engine's hard-limit text means in plain words. The engine's text can carry dollar figures and month numbers;
 * none of that is repeated here, so the sentence stays words only.
 */
function plainReason(detail: string): string {
  if (/car_seats_exceed|car seat/i.test(detail)) return "doesn't have room for the car seats you listed";
  if (/seats?_|seats?\b/i.test(detail)) return "doesn't have enough seats for your household";
  if (/budget/i.test(detail)) return "goes over your monthly budget";
  return "breaks a limit you set";
}

/** The plain reasons for one future, from the engine's "Name: detail" lines. Each reason once. */
function reasonsFor(name: string, hardConstraints: string[]): string[] {
  const prefix = `${name}: `;
  const reasons = hardConstraints.filter((line) => line.startsWith(prefix)).map((line) => plainReason(line.slice(prefix.length)));
  return [...new Set(reasons)];
}

function hardLimitSentence(a: {
  keepName: string;
  switchName: string;
  keepReasons: string[];
  switchReasons: string[];
  winner: "keep" | "switch" | null;
}): string {
  const { keepName, switchName, keepReasons, switchReasons, winner } = a;
  const left = (side: "keep" | "switch") => `That leaves ${side === "keep" ? `keeping ${keepName}` : switchName} as the only option that fits.`;
  if (keepReasons.length > 0 && switchReasons.length > 0) {
    if (list(keepReasons) === list(switchReasons)) {
      return `A hard limit rules out both cars: each one ${list(keepReasons)}. So neither car clearly leads.`;
    }
    return `A hard limit rules out both cars. ${cap(keepName)} ${list(keepReasons)}, and ${switchName} ${list(switchReasons)}. So neither car clearly leads.`;
  }
  if (keepReasons.length > 0) {
    return `A hard limit rules out keeping ${keepName}: it ${list(keepReasons)}. ${winner === "switch" ? left("switch") : "So the weighing of your priorities does not settle it."}`;
  }
  if (switchReasons.length > 0) {
    return `A hard limit rules out ${switchName}: it ${list(switchReasons)}. ${winner === "keep" ? left("keep") : "So the weighing of your priorities does not settle it."}`;
  }
  // The engine named a limit for a future that is not one of these two.
  return "A hard limit rules out one of the options, so the weighing of your priorities does not settle it.";
}

/**
 * Why a comparison comes out the way it does, in words, from the engine's own per-priority scores. Nothing here is
 * calculated: it reads which car's weighted contribution is higher on each priority, and the engine's verdict.
 * Null when either future has no score. `priorities` is not read: the weights are already inside each contribution.
 */
export function buildTradeoff(input: TradeoffInput): Tradeoff | null {
  const { scores, evaluation, keepId, replaceId, keepName, switchName } = input;
  const keep = scores.find((s) => s.scenarioId === keepId);
  const replace = scores.find((s) => s.scenarioId === replaceId);
  if (!keep || !replace) return null;

  const rows: TradeoffRow[] = FACTORS.map(({ key, label }) => {
    const gap = finite(keep.contributions?.[key]) - finite(replace.contributions?.[key]);
    const leader: Leader = Math.abs(gap) < LEVEL_GAP ? "level" : gap > 0 ? "keep" : "switch";
    return { key, label, leader };
  });

  const closeCall = evaluation.preferredScenarioId === "inconclusive";
  const winner: "keep" | "switch" | null =
    evaluation.preferredScenarioId === keepId ? "keep" : evaluation.preferredScenarioId === replaceId ? "switch" : null;

  if (evaluation.hardConstraints.length > 0) {
    const sentence = hardLimitSentence({
      keepName,
      switchName,
      keepReasons: reasonsFor(keep.name, evaluation.hardConstraints),
      switchReasons: reasonsFor(replace.name, evaluation.hardConstraints),
      winner,
    });
    return { rows, sentence, closeCall };
  }

  const names = (leader: Leader) => rows.filter((r) => r.leader === leader).map((r) => r.label.toLowerCase());
  const keepLeads = names("keep");
  const switchLeads = names("switch");
  const keepPhrase = `keeping ${keepName}`;
  const winnerPhrase = winner === "keep" ? keepPhrase : winner === "switch" ? switchName : "one of the futures";
  const margin = "Fork's margin";

  if (keepLeads.length === 0 && switchLeads.length === 0) {
    const level = "The two cars are level on every priority";
    return {
      rows,
      closeCall,
      sentence: closeCall
        ? `${level}, so neither car clearly leads.`
        : `${level}, so Fork can't say what puts ${winnerPhrase} ahead.`,
    };
  }

  const keepSide = keepLeads.length > 0 ? `${cap(keepPhrase)} is ahead on ${list(keepLeads)}.` : `${cap(keepPhrase)} isn't ahead on anything.`;
  const switchSide = switchLeads.length > 0 ? `${cap(switchName)} is ahead on ${list(switchLeads)}.` : `${cap(switchName)} isn't ahead on anything.`;
  // Say the side that leads first, so "isn't ahead on anything" is never the opening line.
  const leads = keepLeads.length === 0 ? `${switchSide} ${keepSide}` : `${keepSide} ${switchSide}`;
  const bothLead = keepLeads.length > 0 && switchLeads.length > 0;

  const weighed = closeCall
    ? bothLead
      ? `Weighted by what you said matters, they balance out within ${margin}, so neither car clearly leads.`
      : `Weighted by what you said matters, that lead is too small to count within ${margin}, so neither car clearly leads.`
    : bothLead
      ? `Weighted by what you said matters, those gaps don't cancel out, so ${winnerPhrase} comes out ahead by more than ${margin}.`
      : `Weighted by what you said matters, that lead adds up, so ${winnerPhrase} comes out ahead by more than ${margin}.`;

  return { rows, sentence: `${leads} ${weighed}`, closeCall };
}
