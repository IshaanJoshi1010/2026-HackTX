import type { BreakEvenResult, DecisionEvaluation, NextAction, SimulationResult, VehicleTwin } from "../contracts";
import { FRONT_SEATS, REEVALUATE_MONTHS, REPLACEMENT_NAME } from "./config";
import { leaseEndInHorizon } from "./lease";
import { keepsCurrentCar, metricsOf } from "./metrics";

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const mi = (n: number) => `${Math.round(n).toLocaleString("en-US")} mi`;
const MILESTONE = /^Month (\d+): (.+) at ([\d,]+) mi \(\$([\d,]+)/;

/**
 * First major scheduled service in a result, from the sim's milestones: the costliest task at the earliest
 * milestone month. Falls back to the first month with any service.
 */
function nextService(r: SimulationResult): { month: number; label: string; miles: number } | null {
  const parsed = r.milestones.map(m => MILESTONE.exec(m)).filter((h): h is RegExpExecArray => h !== null)
    .map(h => ({ month: Number(h[1]), label: h[2], miles: Number(h[3].replace(/,/g, "")), cost: Number(h[4].replace(/,/g, "")) }));
  if (parsed.length) {
    const first = Math.min(...parsed.map(p => p.month));
    const { month, label, miles } = parsed.filter(p => p.month === first).reduce((a, b) => (b.cost > a.cost ? b : a));
    return { month, label, miles };
  }
  const p = r.points.find(x => x.maintenanceSpend > 0);
  return p ? { month: p.month, label: "scheduled service", miles: p.mileage } : null;
}

/** Plain-language advantages of `a` over `b`, each tied to a modeled metric key. */
function advantages(a: SimulationResult, b: SimulationResult): { factor: string; text: string }[] {
  const x = metricsOf(a), y = metricsOf(b), out: { factor: string; text: string }[] = [];
  if (x.netCost < y.netCost) out.push({ factor: "net_cost", text: `${usd(y.netCost - x.netCost)} lower net cost` });
  if (x.fuel < y.fuel) out.push({ factor: "fuel", text: `${usd(y.fuel - x.fuel)} less fuel` });
  if (x.family > y.family) out.push({ factor: "family", text: `better family fit (${x.family.toFixed(2)} vs ${y.family.toFixed(2)})` });
  if (x.longevity > y.longevity) out.push({ factor: "longevity", text: "more miles of life left at the end" });
  if (x.comfort > y.comfort) out.push({ factor: "comfort", text: "higher comfort score" });
  return out;
}

/**
 * Next best action, deterministic rules, first match wins:
 * 1. The current car breaks a hard constraint: investigate the replacement, citing it.
 * 2. Verdict keep: keep the car and review the next major service (mileage from the sim).
 * 3. Verdict replace and finance unknown: get a payoff or trade-in quote first.
 * 4. Verdict replace: investigate the replacement, citing the modeled factors.
 * 5. Inconclusive: when a lease ends inside the projection, get the lease-end terms first; else reevaluate at the
 *    break-even threshold if one exists, else at a mileage or month.
 * `results` (the evaluated simulations) unlocks rules 2 to 4; evaluate() passes them. Never implies a booking,
 * application or approval happened. officialLink is omitted: no verified official links are supplied yet.
 */
export function nextAction(e: DecisionEvaluation, twin: VehicleTwin, be?: BreakEvenResult, results: SimulationResult[] = []): NextAction {
  const current = twin.vehicle;
  const model = current.model;
  const replacement = REPLACEMENT_NAME[current.id] ?? "a replacement";
  const keep = results.find(r => keepsCurrentCar(r, current.id));
  const preferred = results.find(r => r.scenarioId === e.preferredScenarioId);

  // 1. Current car breaks a hard constraint (today, or in the keep projection).
  const d = twin.driver;
  const todayIssue = d.householdSize > current.seats ? "seats_below_household"
    : d.carSeats > Math.max(0, current.seats - FRONT_SEATS) ? "car_seats_exceed_rear_positions" : null;
  const futureIssue = keep?.points.find(p => p.suitability.passengerFit === "insufficient");
  if (todayIssue || futureIssue) {
    const key = todayIssue ?? futureIssue!.suitability.constraints[0] ?? "seats_insufficient";
    const when = todayIssue ? "today" : `from month ${futureIssue!.month}`;
    // Counts at the moment of the problem: today's profile, or the projected month's suitability notes.
    const note = (k: string) => Number(futureIssue?.suitability.notes.find(n => n.startsWith(`${k}=`))?.split("=")[1]);
    const household = todayIssue ? d.householdSize : note("household");
    const carSeats = todayIssue ? d.carSeats : note("car_seats");
    const rear = Math.max(0, current.seats - FRONT_SEATS);
    const detail = key === "car_seats_exceed_rear_positions"
      ? `Your ${model} has ${rear} rear seat positions, fewer than the ${carSeats} car seats you need ${when}. `
        + "Fork does not verify physical car seat fit, so check it in person."
      : `Your ${model} has ${current.seats} seats, fewer than your household of ${household} ${when}.`;
    return { label: `Investigate a ${replacement}`, detail, factors: [`hard_constraint:${key}`] };
  }

  if (e.preferredScenarioId !== "inconclusive" && preferred) {
    // 2. Keep.
    if (keepsCurrentCar(preferred, current.id)) {
      const others = results.filter(r => r !== preferred);
      const best = others.length ? others.reduce((a, b) => (metricsOf(a).netCost <= metricsOf(b).netCost ? a : b)) : null;
      const service = nextService(preferred);
      const cost = `Keeping has a modeled net cost of ${usd(metricsOf(preferred).netCost)} over ${preferred.points.length} months`
        + (best ? ` vs ${usd(metricsOf(best).netCost)} for the best alternative.` : ".");
      return service
        ? { label: `Keep your ${model} and review the service at ${mi(service.miles)}`,
            detail: `${cost} Next major service: ${service.label} around month ${service.month}${/illustrative/i.test(service.label) ? "" : " (illustrative)"}.`,
            factors: ["net_cost", "maintenance_milestone"] }
        : { label: `Keep your ${model}`, detail: cost, factors: ["net_cost"] };
    }
    const pros = keep ? advantages(preferred, keep) : [];
    const why = pros.length ? ` Modeled advantages: ${pros.map(p => p.text).join(", ")}.` : "";
    // 3. Replace, but the trade-in math rests on unknown finance terms.
    if (d.financeType === "unknown") {
      return {
        label: "Get a payoff or trade-in quote before deciding",
        detail: `Replacing leads on your priorities, but your current loan or lease terms are unknown, so the trade-in numbers are estimates.${why}`,
        factors: ["finance_unknown", ...pros.map(p => p.factor)],
      };
    }
    // 4. Replace.
    return {
      label: `Investigate a ${replacement}`,
      detail: `Replacing leads on your weighted priorities.${why}`,
      factors: pros.length ? pros.map(p => p.factor) : ["weighted_score"],
    };
  }

  // 5. Inconclusive (or no results to tell keep from replace).
  // A lease that ends inside the projection leaves the keep side with no modeled cost, so the numbers cannot settle it.
  const leaseEnd = keep ? leaseEndInHorizon(twin, results) : null;
  if (leaseEnd !== null) {
    return {
      label: "Get your lease-end terms before deciding",
      detail: `Your lease ends at month ${leaseEnd}. Fork does not model a renewal or a buyout, so keeping your ${model} looks cheaper than it is after that. Find out your buyout price or renewal terms, then compare again.`,
      factors: ["lease_end"],
    };
  }
  if (be?.found) {
    const value = be.parameter === "annualMiles" ? `${Math.round(be.threshold).toLocaleString("en-US")} mi/yr` : `$${be.threshold.toFixed(2)}/gal`;
    const what = be.parameter === "annualMiles" ? "your driving" : "fuel prices";
    return {
      label: `Reevaluate if ${what} ${be.direction === "above" ? "rises above" : "drops below"} ${value}`,
      detail: `Neither option leads by a clear margin today. The verdict changes at ${value} (modeled break-even, tested between ${be.testedBounds[0]} and ${be.testedBounds[1]}).`,
      factors: ["break_even", be.parameter],
    };
  }
  const at = keep?.points[REEVALUATE_MONTHS - 1]?.mileage ?? twin.mileage + d.annualMiles * REEVALUATE_MONTHS / 12;
  return {
    label: `Reevaluate at ${mi(at)} or in ${REEVALUATE_MONTHS} months`,
    detail: be && !be.found
      ? `Neither option leads by a clear margin on your priorities, and no ${be.parameter === "annualMiles" ? "mileage" : "fuel price"} between ${be.testedBounds[0]} and ${be.testedBounds[1]} changes that.`
      : "Neither option leads by a clear margin on your priorities.",
    factors: be && !be.found ? ["no_clear_leader", `no_break_even:${be.parameter}`] : ["no_clear_leader"],
  };
}
