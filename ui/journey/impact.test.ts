import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Fit, LifeEvent, ProjectionPoint, Scenario, SimulationResult } from "@/contracts";
import { ai, data, sim } from "@/ui/mocks";
import { resetForkStoreForTests, simulationInputs, useForkStore } from "@/ui/store/useForkStore";
import { fixtureEvents, journeyCompared, journeyOffer, journeySwitchSelected } from "./fixtures";
import { calendarLabel, computeImpact, impactSentence, momentSentence, momentWhere, type EventImpact } from "./impact";
import type { JourneyEvent } from "./types";

const EM_DASH = String.fromCharCode(0x2014);

// ---------------------------------------------------------------------------
// A stand-in simulation, so every branch of computeImpact can be driven by hand.
// Each confirmed event may carry: cost (dollars a month from its month), fuel (dollars a month), miles (a month),
// fit ("tight" | "insufficient"), constrain (a key), car (switch to this vehicle id), warn (a note it raises).
// ---------------------------------------------------------------------------

const ev = (id: string, month: number, payload: LifeEvent["payload"], status: LifeEvent["status"] = "confirmed"): LifeEvent => ({
  id, type: "mileage_change", month, payload, source: "user", assumptions: [], certainty: "clear", status,
});
const scenario = (events: LifeEvent[]): Scenario => ({ id: "s", parentId: null, forkMonth: 0, name: "s", events, assumptions: {} });

function fake(s: Scenario): SimulationResult {
  const warnings: string[] = [];
  const points: ProjectionPoint[] = [];
  let net = 0, mileage = 0;
  for (let month = 1; month <= 60; month++) {
    let fuelSpend = 0, vehicleId = "camry", passengerFit: Fit = "good";
    const constraints: string[] = [];
    let perMonth = 100, miles = 1000;
    for (const e of s.events) {
      if (e.status !== "confirmed" || e.month > month) continue;
      perMonth += Number(e.payload.cost ?? 0);
      fuelSpend += Number(e.payload.fuel ?? 0);
      miles += Number(e.payload.miles ?? 0);
      if (e.payload.fit) passengerFit = e.payload.fit as Fit;
      if (e.payload.constrain) constraints.push(String(e.payload.constrain));
      if (e.payload.car) vehicleId = String(e.payload.car);
    }
    net += perMonth;
    mileage += miles;
    points.push({
      month, vehicleId, mileage: vehicleId === "camry" ? mileage : mileage / 10, fuelSpend, maintenanceSpend: 0, vehicleValue: 0, loanBalance: 0,
      cumulativeCash: 0, netEconomicCost: net,
      suitability: { passengerFit, cargoFit: "good", tradeoffs: [], constraints, notes: [] },
    });
  }
  for (const e of s.events) if (e.status === "confirmed" && e.payload.warn) warnings.push(`Event ${e.id}: ${String(e.payload.warn)}`);
  return { scenarioId: s.id, points, milestones: [], warnings, summary: { totalCash: 0, netCost: 0 } };
}

const impactOf = (events: LifeEvent[], id: string, extra: Partial<Parameters<typeof computeImpact>[0]> = {}) =>
  computeImpact({ scenario: scenario(events), eventId: id, simulate: fake, ...extra });

describe("computeImpact on a stand-in simulation", () => {
  it("is the five-year cost of the future with the event minus the future without it", () => {
    const i = impactOf([ev("a", 12, { cost: 10 }), ev("b", 24, { cost: -5 })], "a")!;
    expect(i.costDelta).toBe(10 * 49); // months 12 to 60
    expect(i.changesCost).toBe(true);
    expect(impactOf([ev("a", 12, { cost: 10 }), ev("b", 24, { cost: -5 })], "b")!.costDelta).toBe(-5 * 37);
  });

  it("does not change with the selected month: it always reads month 60", () => {
    const events = [ev("a", 12, { cost: 10 })];
    expect(impactOf(events, "a")!.costDelta).toBe(fake(scenario(events)).points[59].netEconomicCost - fake(scenario([])).points[59].netEconomicCost);
  });

  it("only counts a cost change of at least a dollar", () => {
    expect(impactOf([ev("a", 12, { cost: 0.01 })], "a")!.changesCost).toBe(false); // a cent a month adds up to 49 cents by month 60
    expect(impactOf([ev("a", 12, { cost: 0.5 })], "a")!.changesCost).toBe(true); // 50 cents a month passes a dollar by month 13
  });

  it("counts a change that is a dollar in any single month, even when the five years end the same", () => {
    // Pays $30 more for a year, then $30 less: the total comes back to zero by month 60.
    const result = (s: Scenario): SimulationResult => {
      const r = fake(s);
      if (!s.events.some((e) => e.id === "wobble")) return r;
      return { ...r, points: r.points.map((p) => ({ ...p, netEconomicCost: p.netEconomicCost + (p.month >= 12 && p.month < 60 ? 30 : 0) })) };
    };
    const i = computeImpact({ scenario: scenario([ev("wobble", 12, {})]), eventId: "wobble", simulate: result })!;
    expect(i.costDelta).toBe(0);
    expect(i.changesCost).toBe(true);
    expect(i.modeled).toBe(true);
  });

  it("an event the model gives no number to is not modeled: every field says nothing, and nothing is invented", () => {
    const i = impactOf([ev("a", 12, {})], "a")!;
    expect(i).toEqual({
      eventId: "a", costDelta: 0, changesCost: false, fuelDelta: null, milesDelta: null, carChangeMonth: null,
      fit: [], constraints: [], modeled: false, warning: null,
    });
  });

  it("sums fuel and compares the odometer at month 60", () => {
    const i = impactOf([ev("a", 6, { cost: 1, fuel: 20, miles: 500 })], "a")!;
    expect(i.fuelDelta).toBe(20 * 55); // months 6 to 60
    expect(i.milesDelta).toBe(500 * 55);
    expect(i.modeled).toBe(true);
  });

  it("leaves miles out when the two runs end in different cars, because the odometers are not comparable", () => {
    const i = impactOf([ev("swap", 12, { car: "rav4", cost: 5, miles: 10 })], "swap")!;
    expect(i.carChangeMonth).toBe(12);
    expect(i.milesDelta).toBeNull();
    expect(i.modeled).toBe(true);
  });

  it("says where fit changes, the first month it differs, in plain words", () => {
    const i = impactOf([ev("kid", 32, { fit: "tight" })], "kid", { dateLabel: (m) => (m === 32 ? "Jun 2029" : `m${m}`) })!;
    expect(i.fit).toEqual(["Passenger fit goes from good to tight from Jun 2029"]);
    expect(i.changesCost).toBe(false);
    expect(i.modeled).toBe(true);
    expect(i.costDelta).toBe(0);
  });

  it("says insufficient fit as 'not enough'", () => {
    expect(impactOf([ev("kid", 8, { fit: "insufficient" })], "kid")!.fit).toEqual(["Passenger fit goes from good to not enough from month 8"]);
  });

  it("lists a new hard constraint once, with its first month, and ignores one that was already there", () => {
    const i = impactOf([ev("kid", 32, { constrain: "seats_below_household" })], "kid", { dateLabel: () => "Jun 2029" })!;
    expect(i.constraints).toEqual(["There are fewer seats than people in your household, from Jun 2029"]);
    const already = impactOf([ev("old", 0, { constrain: "seats_below_household" }), ev("kid", 32, { constrain: "seats_below_household" })], "kid")!;
    expect(already.constraints).toEqual([]);
  });

  it("brings the simulation's own note about the event, in plain words, and ignores notes about other events", () => {
    const events = [ev("a", 12, { warn: "ignored unknown payload key mood" }), ev("b", 12, { warn: "ignored invalid annualMiles = 3" })];
    expect(impactOf(events, "a")!.warning).toBe("Part of what you said is not something Fork models, so it is left out.");
    expect(impactOf(events, "b")!.warning).toBe("One value could not be used, so it is left out.");
    expect(impactOf([ev("a", 12, {})], "a")!.warning).toBeNull();
  });

  it("does not mistake an event whose id contains another's id", () => {
    const events = [ev("a", 12, {}), ev("ev-a", 12, { warn: "ignored unknown payload key mood" })];
    expect(impactOf(events, "a")!.warning).toBeNull();
  });

  it("an event that is only noted by the model is still 'not modeled', and the note says why in words that never claim no effect", () => {
    const i = impactOf([ev("a", 12, { warn: "vehicle_replacement has no vehicleId, so it has no effect" })], "a")!;
    expect(i.modeled).toBe(false);
    expect(i.warning).toBe("The swap does not say which car to switch to, so it is not modeled.");
    expect(JSON.stringify(i)).not.toMatch(/no effect/i);
  });

  it("is null for an event that is not in the future, one that is only a proposal, or a simulation that cannot run", () => {
    expect(impactOf([ev("a", 12, { cost: 1 })], "missing")).toBeNull();
    expect(impactOf([ev("a", 12, { cost: 1 }, "proposed")], "a")).toBeNull();
    expect(computeImpact({ scenario: scenario([ev("a", 12, { cost: 1 })]), eventId: "a", simulate: () => { throw new Error("no spec sheet"); } })).toBeNull();
  });

  it("uses the result it is handed for the future as it is, and only runs the one without the event", () => {
    const events = [ev("a", 12, { cost: 10 })];
    const run = vi.fn(fake);
    const given = fake(scenario(events));
    const i = computeImpact({ scenario: scenario(events), eventId: "a", simulate: run, result: given })!;
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0].events).toEqual([]);
    expect(i.costDelta).toBe(490);
  });

  it("never changes the scenario it was given", () => {
    const s = scenario([ev("a", 12, { cost: 10 }), ev("b", 24, { cost: 1 })]);
    const frozen = JSON.stringify(s);
    computeImpact({ scenario: s, eventId: "a", simulate: fake });
    expect(JSON.stringify(s)).toBe(frozen);
  });
});

describe("calendarLabel", () => {
  it("counts months from the month today falls in", () => {
    expect(calendarLabel("2026-10-24", 0)).toBe("Oct 2026");
    expect(calendarLabel("2026-10-24", 3)).toBe("Jan 2027");
    expect(calendarLabel("2026-10-24", 12)).toBe("Oct 2027");
    expect(calendarLabel("2026-10-24", 32)).toBe("Jun 2029");
    expect(calendarLabel("2026-01-01", 60)).toBe("Jan 2031");
  });
});

// ---------------------------------------------------------------------------
// Sentences, from hand built impacts.
// ---------------------------------------------------------------------------

const impact = (over: Partial<EventImpact> = {}): EventImpact => ({
  eventId: "x", costDelta: 0, changesCost: false, fuelDelta: null, milesDelta: null, carChangeMonth: null,
  fit: [], constraints: [], modeled: false, warning: null, ...over,
});
const life = (type: JourneyEvent["type"], over: Partial<JourneyEvent> = {}): JourneyEvent => ({ ...fixtureEvents[1], type, kind: "life", ...over });
const swapEvent = fixtureEvents.find((e) => e.id === "swap")!;

describe("impactSentence", () => {
  it("a cost that goes up adds, one that goes down saves", () => {
    expect(impactSentence(life("family_change"), impact({ costDelta: 3763.4, changesCost: true, modeled: true }))).toBe("Adds $3,763 to your five-year cost.");
    expect(impactSentence(life("family_change"), impact({ costDelta: -1200, changesCost: true, modeled: true }))).toBe("Saves $1,200 on your five-year cost.");
  });

  it("a driving change leads with the miles, round to the way a person says it, and points the cost the right way", () => {
    const up = impactSentence(life("mileage_change"), impact({ costDelta: 5912, changesCost: true, milesDelta: 40000, modeled: true }));
    expect(up).toBe("Adds about 40,000 miles over five years, which raises your cost.");
    expect(impactSentence(life("mileage_change"), impact({ costDelta: 800, changesCost: true, milesDelta: 7963, modeled: true }))).toBe("Adds about 8,000 miles over five years, which raises your cost.");
    expect(impactSentence(life("mileage_change"), impact({ costDelta: -400, changesCost: true, milesDelta: -3000, modeled: true }))).toBe("Removes about 3,000 miles over five years, which lowers your cost.");
    expect(impactSentence(life("mileage_change"), impact({ milesDelta: 247, modeled: true }))).toBe("Adds about 250 miles over five years.");
  });

  it("a driving change with no miles to show falls back to the cost", () => {
    expect(impactSentence(life("mileage_change"), impact({ costDelta: 90, changesCost: true, modeled: true }))).toBe("Adds $90 to your five-year cost.");
  });

  it("fit or a constraint without a cost says so and then says what changed", () => {
    expect(impactSentence(life("family_change"), impact({ fit: ["Passenger fit goes from good to tight from Jun 2029"], modeled: true }))).toBe(
      "No direct vehicle-cost change modeled. Passenger fit goes from good to tight from Jun 2029.",
    );
    expect(impactSentence(life("family_change"), impact({ constraints: ["There are fewer seats than people in your household, from Jun 2029"], modeled: true }))).toBe(
      "No direct vehicle-cost change modeled. There are fewer seats than people in your household, from Jun 2029.",
    );
  });

  it("a change that moves cost around but ends the same says that", () => {
    expect(impactSentence(life("budget_change"), impact({ changesCost: true, modeled: true }))).toBe(
      "No direct vehicle-cost change modeled. Costs shift along the way but end about the same over five years.",
    );
  });

  it("an event the model gives no number to says so, and never 'no effect'", () => {
    const s = impactSentence(life("relocation"), impact());
    expect(s).toBe("No direct vehicle-cost change modeled for this yet.");
    expect(s).not.toMatch(/no effect|matter/i);
  });

  it("the swap names the dollars, the direction and the month the car changes", () => {
    expect(impactSentence(swapEvent, impact({ costDelta: 4352, changesCost: true, carChangeMonth: 12, modeled: true }))).toBe(
      "Switching adds $4,352 over five years and changes your car in Oct 2027.",
    );
    expect(impactSentence(swapEvent, impact({ costDelta: -2100, changesCost: true, carChangeMonth: 12, modeled: true }))).toBe(
      "Switching saves $2,100 over five years and changes your car in Oct 2027.",
    );
    expect(impactSentence(swapEvent, impact({ carChangeMonth: 12, modeled: true }))).toBe("Switching changes your car in Oct 2027 and leaves your five-year cost about the same.");
    expect(impactSentence(swapEvent, impact())).toBe("No direct vehicle-cost change modeled for this yet.");
  });

  it("says it is working on it while there is no result, or updating it", () => {
    expect(impactSentence(life("family_change"), null)).toBe("Working out what this changes.");
    expect(impactSentence(life("family_change"), null, { updating: true })).toBe("Updating what this changes.");
  });

  it("is one short line with at most one figure, and none of the forbidden words, whatever the impact", () => {
    const impacts: Array<EventImpact | null> = [
      null,
      impact(),
      impact({ costDelta: 99999, changesCost: true, modeled: true }),
      impact({ costDelta: -99999, changesCost: true, modeled: true }),
      impact({ costDelta: 99999, changesCost: true, milesDelta: 123456, fuelDelta: 4000, modeled: true }),
      impact({ fit: ["Passenger fit goes from good to tight from Jun 2029"], modeled: true }),
      impact({ carChangeMonth: 12, costDelta: 2000, changesCost: true, modeled: true }),
    ];
    for (const e of [...fixtureEvents, life("cargo_change")]) {
      for (const i of impacts) {
        const s = impactSentence(e, i);
        expect(s.length, s).toBeLessThan(140);
        expect(s, s).not.toMatch(/no effect|doesn'?t matter|\bdemo\b|\bdata\b/i);
        expect(s).not.toContain(EM_DASH);
        expect((s.match(/[$\d][\d,.]*\d/g) ?? []).filter((n) => !/^20\d\d$/.test(n)).length, s).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("momentSentence", () => {
  it("says the date, the car, the changes so far, and when the cars part", () => {
    const atSplit = { ...journeyCompared, month: 12, monthLabel: "Oct 2027" };
    expect(momentSentence(atSplit)).toBe("Oct 2027: you are in the Camry, with 2 changes so far. The switch future changes cars this month.");
  });

  it("counts only what has happened by that month", () => {
    expect(momentSentence({ ...journeyCompared, month: 0, monthLabel: "Oct 2026" })).toBe("Oct 2026: you are in the Camry, with 1 change so far.");
    expect(momentSentence({ ...journeyCompared, month: 40, monthLabel: "Feb 2030" })).toBe("Feb 2030: you are in the Camry, with 3 changes so far.");
    expect(momentSentence({ ...journeyOffer, events: [], month: 5, monthLabel: "Mar 2027" })).toBe("Mar 2027: you are in the Camry, with no changes yet.");
  });

  it("speaks in the selected future: in the switch future at the swap month, you change cars", () => {
    const j = { ...journeySwitchSelected, month: 12, monthLabel: "Oct 2027", selectedEventId: null };
    expect(momentSentence(j)).toBe("Oct 2027: you are in the RAV4, with 2 changes so far. You change cars this month.");
  });

  it("says nothing about a switch that has not been compared", () => {
    expect(momentSentence({ ...journeyOffer, month: 12, monthLabel: "Oct 2027" })).not.toMatch(/switch/i);
  });

  it("exposes the part after the date for the drawer", () => {
    expect(momentWhere({ ...journeyCompared, month: 12, monthLabel: "Oct 2027" })).toBe("you are in the Camry, with 2 changes so far. The switch future changes cars this month.");
  });
});

// ---------------------------------------------------------------------------
// The real engine: every figure must come out of two simulate() calls and nothing else.
// ---------------------------------------------------------------------------

const state = () => useForkStore.getState();
const actions = () => useForkStore.getState().actions;

async function alexCompared() {
  vi.spyOn(ai, "interpret").mockResolvedValue({ aiAvailable: false });
  await actions().startFromSample("camry-2022-se");
  actions().onRevealStage("done");
  await actions().submitDump(data.demo.brainDump);
  actions().confirmDrafts(state().explore.draftChanges.map((d) => d.id));
  await actions().openReplaceComparison();
}

describe("computeImpact on the real engine: Alex", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    resetForkStoreForTests();
    useForkStore.setState({ hydrated: true });
  });

  async function setup() {
    await alexCompared();
    const s = state();
    const inputs = simulationInputs(s)!;
    const run = (sc: Scenario) => sim.simulate(inputs.twin, sc, inputs.ctx);
    const keep = s.explore.scenarios.find((x) => x.id === s.comparison!.keepId)!;
    const replace = s.explore.scenarios.find((x) => x.id === s.comparison!.replaceId)!;
    const idOf = (sc: Scenario, type: LifeEvent["type"]) => sc.events.find((e) => e.type === type)!.id;
    const without = (sc: Scenario, id: string) => run({ ...sc, events: sc.events.filter((e) => e.id !== id) });
    const label = (m: number) => calendarLabel(s.todayISO, m);
    return { keep, replace, run, idOf, without, label };
  }

  it("the driving change adds cost, fuel and miles, exactly as two runs of the engine say", async () => {
    const { keep, run, idOf, without, label } = await setup();
    const id = idOf(keep, "mileage_change");
    const i = computeImpact({ scenario: keep, eventId: id, simulate: run, dateLabel: label })!;
    const a = run(keep), b = without(keep, id);
    expect(i.costDelta).toBeCloseTo(a.points[59].netEconomicCost - b.points[59].netEconomicCost, 6);
    expect(i.costDelta).toBeGreaterThan(1000);
    expect(i.changesCost).toBe(true);
    expect(i.fuelDelta).toBeCloseTo(a.points.reduce((t, p) => t + p.fuelSpend, 0) - b.points.reduce((t, p) => t + p.fuelSpend, 0), 6);
    expect(i.milesDelta).toBeCloseTo(a.points[59].mileage - b.points[59].mileage, 6);
    expect(i.milesDelta).toBeGreaterThan(30000);
    expect(i.modeled).toBe(true);
    expect(impactSentence({ ...fixtureEvents[0], id, type: "mileage_change" }, i)).toMatch(/^Adds about [\d,]+ miles over five years, which raises your cost\.$/);
  });

  it("moving to Denver is not modeled: no direct cost change, and it does not say it has no effect", async () => {
    const { keep, run, idOf, without, label } = await setup();
    const id = idOf(keep, "relocation");
    const i = computeImpact({ scenario: keep, eventId: id, simulate: run, dateLabel: label })!;
    const a = run(keep), b = without(keep, id);
    expect(a.points.map((p) => p.netEconomicCost)).toEqual(b.points.map((p) => p.netEconomicCost));
    expect(i.modeled).toBe(false);
    expect(i.changesCost).toBe(false);
    expect(i.costDelta).toBe(0);
    expect(impactSentence({ ...fixtureEvents[1], id, type: "relocation" }, i)).toBe("No direct vehicle-cost change modeled for this yet.");
  });

  it("the second child changes fit only if the engine's two runs differ in fit", async () => {
    const { keep, replace, run, idOf, without, label } = await setup();
    for (const sc of [keep, replace]) {
      const id = idOf(sc, "family_change");
      const i = computeImpact({ scenario: sc, eventId: id, simulate: run, dateLabel: label })!;
      const a = run(sc), b = without(sc, id);
      const differs = a.points.some((p, k) => p.suitability.passengerFit !== b.points[k].suitability.passengerFit || p.suitability.cargoFit !== b.points[k].suitability.cargoFit);
      expect(i.fit.length > 0).toBe(differs);
      const constraintsDiffer = a.points.some((p, k) => p.suitability.constraints.some((c) => !b.points[k].suitability.constraints.includes(c)));
      expect(i.constraints.length > 0).toBe(constraintsDiffer);
      expect(i.costDelta).toBeCloseTo(a.points[59].netEconomicCost - b.points[59].netEconomicCost, 6);
      expect(i.modeled).toBe(differs || constraintsDiffer || i.changesCost);
    }
  });

  it("the swap is the whole gap between the two futures: take it out of the switch future and you are in the keep future", async () => {
    const { keep, replace, run, idOf, without, label } = await setup();
    const id = idOf(replace, "vehicle_replacement");
    const i = computeImpact({ scenario: replace, eventId: id, simulate: run, dateLabel: label })!;
    const keepRun = run(keep);
    const replaceRun = run(replace);
    // the same events in the same order, so the run without the swap is exactly the keep run
    expect(without(replace, id).points.map((p) => p.netEconomicCost)).toEqual(keepRun.points.map((p) => p.netEconomicCost));
    expect(i.costDelta).toBeCloseTo(replaceRun.points[59].netEconomicCost - keepRun.points[59].netEconomicCost, 6);
    expect(i.changesCost).toBe(true);
    expect(i.carChangeMonth).toBe(replace.events.find((e) => e.id === id)!.month);
    expect(i.milesDelta).toBeNull();
    expect(i.fuelDelta).toBeCloseTo(replaceRun.points.reduce((t, p) => t + p.fuelSpend, 0) - keepRun.points.reduce((t, p) => t + p.fuelSpend, 0), 6);
    expect(i.warning).toBeNull();
    const swap = { ...swapEvent, id, dateLabel: label(i.carChangeMonth!) };
    const s = impactSentence(swap, i);
    expect(s).toMatch(/^Switching (adds|saves) \$[\d,]+ over five years and changes your car in [A-Z][a-z]{2} \d{4}\.$/);
  });

  it("is deterministic: the same future gives the same impact", async () => {
    const { keep, run, idOf } = await setup();
    const id = idOf(keep, "mileage_change");
    expect(computeImpact({ scenario: keep, eventId: id, simulate: run })).toEqual(computeImpact({ scenario: keep, eventId: id, simulate: run }));
  });
});
