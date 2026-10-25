import { describe, expect, it, vi } from "vitest";
import type { DriverProfile, LifeEvent, ProjectionPoint, Scenario, SimulationResult, SpecSheet, VehicleConfig } from "@/contracts";
import { buildJourney, type JourneyInput } from "./model";
import type { Journey } from "./types";

// Pure tests: hand-built snapshots, no store, no engine. (journey store tests live in useJourney.test.tsx.)

const CAMRY: VehicleConfig = {
  id: "camry-2022-se", make: "Toyota", model: "Camry", year: 2022, trim: "SE", powertrain: "gas", paint: "white", mpg: 32, seats: 5,
  cargoCuFt: 15, msrp: 28000, modelAsset: "", matchStatus: "representative", specSources: [],
};
const RAV4: VehicleConfig = {
  id: "rav4-2024-hybrid-xle", make: "Toyota", model: "RAV4", year: 2024, trim: "Hybrid XLE", powertrain: "hybrid", paint: "gray", mpg: 40,
  seats: 5, cargoCuFt: 37, msrp: 33000, modelAsset: "", matchStatus: "representative", specSources: [],
};

const PROFILE: DriverProfile = {
  location: "Austin, TX", annualMiles: 12000, householdSize: 3, children: 1, carSeats: 1, cargoNeed: "low", fuelPricePerGal: 3.5,
  financeType: "paid_off", priorities: { cost: 0.2, family: 0.2, longevity: 0.2, fuel: 0.2, comfort: 0.2 },
  provenance: { annualMiles: "user", fuelPricePerGal: "user" },
};

const ev = (id: string, type: LifeEvent["type"], month: number, payload: LifeEvent["payload"], extra: Partial<LifeEvent> = {}): LifeEvent => ({
  id, type, month, payload, source: "user", assumptions: [], certainty: "clear", status: "confirmed", ...extra,
});
const sc = (id: string, parentId: string | null, events: LifeEvent[], forkMonth = 0): Scenario => ({ id, parentId, forkMonth, name: id, events, assumptions: {} });

const point = (month: number, vehicleId: string, netEconomicCost: number): ProjectionPoint => ({
  month, vehicleId, mileage: 48000 + month * 1000, fuelSpend: 100, maintenanceSpend: 0, vehicleValue: 10000, loanBalance: 0, cumulativeCash: 0, netEconomicCost,
  suitability: { passengerFit: "good", cargoFit: "good", tradeoffs: [], constraints: [], notes: [] },
});
/** Months 1 to 60 like the engine's, with a cost function and a car that can change at a month. */
const result = (scenarioId: string, cost: (month: number) => number, swapAt?: number): SimulationResult => ({
  scenarioId,
  points: Array.from({ length: 60 }, (_, i) => i + 1).map((m) => point(m, swapAt !== undefined && m >= swapAt ? RAV4.id : CAMRY.id, cost(m))),
  milestones: [], warnings: [], summary: { totalCash: 0, netCost: cost(60) },
});

const spec = (vehicleId: string, sources: SpecSheet["sources"]): SpecSheet => ({
  vehicleId, seats: 5, cargoCuFt: 15, curbWeightLb: 3300, mpgCity: 28, mpgHwy: 39, mpgCombined: 32, msrp: 28000, maintenance: [],
  depreciation: { retainedByYear: [1], mileageAdjPer10k: 0 }, verified: { carSeatFit: false, packingFit: false }, sources,
});

const MILES = ev("miles", "mileage_change", 0, { annualMiles: 20000 }, { quote: "driving 20,000 miles annually" });
const MOVE = ev("move", "relocation", 12, { location: "Denver" }, { quote: "moving to Denver next year" });
const KID = ev("kid", "family_change", 32, { children: 2 }, { certainty: "inferred", assumptions: ["Summer is assumed because you gave only the season"] });
const swapEvent = (month: number, id = "life/replace/event") => ev(id, "vehicle_replacement", month, { vehicleId: RAV4.id }, { source: "fixture", assumptions: [`Replacement month ${month}`] });

const BASE = sc("base", null, []);
const LIFE = sc("life", "base", [MILES, MOVE, KID], 0);
const replaceAt = (month: number) => sc("life/replace", "life", [MILES, MOVE, KID, swapEvent(month)], month);

/** Keep costs 400.5 a month; switching costs the same until month 12, then a jump and a lower slope. Distinct at every month. */
const KEEP_COST = (m: number) => 400.5 * m;
const SWITCH_COST = (m: number) => (m < 12 ? 400.5 * m : 4806 + 3000 + 350.25 * (m - 12));

function input(over: Partial<JourneyInput> = {}): JourneyInput {
  const replace = replaceAt(12);
  return {
    twin: { vehicle: CAMRY },
    replacementVehicle: RAV4,
    other: RAV4,
    scenarios: [BASE, LIFE, replace],
    results: { base: result("base", KEEP_COST), life: result("life", KEEP_COST), [replace.id]: result(replace.id, SWITCH_COST, 12) },
    comparison: { keepId: "life", replaceId: replace.id },
    evaluation: { preferredScenarioId: "life" },
    activeScenarioId: "life",
    activeMonth: 0,
    selectedEventId: null,
    todayISO: "2026-10-24",
    revision: 3,
    busy: "idle",
    lastChange: null,
    confirmedProfile: PROFILE,
    defaultSwapMonth: () => 12,
    ...over,
  };
}

const REPLACE_ID = "life/replace";

/** The same inputs with the compare off, as before anyone asks. */
const offerInput = (over: Partial<JourneyInput> = {}) => input({ scenarios: [BASE, LIFE], comparison: null, evaluation: null, replacementVehicle: null, ...over });

const deepFreeze = <T,>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
};

/** Every number and string anywhere in a journey, to look for NaN. */
function scan(value: unknown, found: unknown[] = []): unknown[] {
  if (typeof value === "number" || typeof value === "string") found.push(value);
  else if (value && typeof value === "object") for (const v of Object.values(value)) scan(v, found);
  return found;
}
const clean = (j: Journey) => {
  for (const v of scan(j)) {
    if (typeof v === "number") expect(Number.isNaN(v) || !Number.isFinite(v)).toBe(false);
    else expect(v).not.toMatch(/NaN|undefined|Infinity/);
  }
};

describe("which scenarios it is about", () => {
  it("uses the comparison's keep and switch, whatever is active", () => {
    for (const active of ["life", REPLACE_ID, "base", "nope"]) {
      const j = buildJourney(input({ activeScenarioId: active }));
      expect(j.keep.scenarioId).toBe("life");
      expect(j.switch?.scenarioId).toBe(REPLACE_ID);
    }
  });

  it("with no comparison keeps the life of the active scenario: its nearest ancestor with no swap", () => {
    const all = [BASE, LIFE, replaceAt(12)];
    expect(buildJourney(offerInput({ scenarios: all, activeScenarioId: "life" })).keep.scenarioId).toBe("life");
    expect(buildJourney(offerInput({ scenarios: all, activeScenarioId: REPLACE_ID })).keep.scenarioId).toBe("life");
    expect(buildJourney(offerInput({ activeScenarioId: "base" })).keep.scenarioId).toBe("base");
    // a chain of swaps climbs past all of them
    const twice = sc("again", REPLACE_ID, [swapEvent(20, "again/event")]);
    expect(buildJourney(offerInput({ scenarios: [...all, twice], activeScenarioId: "again" })).keep.scenarioId).toBe("life");
  });

  it("falls back to the baseline when the active scenario is unknown", () => {
    expect(buildJourney(offerInput({ activeScenarioId: "gone" })).keep.scenarioId).toBe("base");
  });

  it("treats a comparison whose scenarios are missing as no comparison", () => {
    const j = buildJourney(input({ scenarios: [BASE, LIFE], activeScenarioId: "life" }));
    expect(j.switch?.priced).toBe(false);
    expect(j.switch?.scenarioId).toBeNull();
    expect(j.events.some((e) => e.kind === "swap")).toBe(false);
  });

  it("selects the switch future only when the comparison exists and the switch is active", () => {
    expect(buildJourney(input({ activeScenarioId: REPLACE_ID })).selectedFuture).toBe("switch");
    expect(buildJourney(input({ activeScenarioId: "life" })).selectedFuture).toBe("keep");
    expect(buildJourney(input({ activeScenarioId: "base" })).selectedFuture).toBe("keep");
    // looking at a swap with no comparison open is still the keep side: there is nothing to switch to yet
    expect(buildJourney(offerInput({ scenarios: [BASE, LIFE, replaceAt(12)], activeScenarioId: REPLACE_ID })).selectedFuture).toBe("keep");
  });

  it("marks exactly the selected branch", () => {
    const sw = buildJourney(input({ activeScenarioId: REPLACE_ID }));
    expect([sw.keep.selected, sw.switch?.selected]).toEqual([false, true]);
    const kp = buildJourney(input());
    expect([kp.keep.selected, kp.switch?.selected]).toEqual([true, false]);
    expect(buildJourney(offerInput()).switch?.selected).toBe(false);
  });
});

describe("the engine's call", () => {
  it.each([
    ["inconclusive", "close"],
    ["life", "keep"],
    [REPLACE_ID, "switch"],
    ["something else", null],
  ] as const)("reads %s as %s", (preferred, call) => {
    expect(buildJourney(input({ evaluation: { preferredScenarioId: preferred } })).call).toBe(call);
  });

  it("is null with no evaluation", () => {
    const j = buildJourney(input({ evaluation: null }));
    expect(j.call).toBeNull();
    expect(j.keep.verdict).toBeNull();
    expect(j.switch?.verdict).toBeNull();
  });

  it("gives each branch its verdict", () => {
    const keepWins = buildJourney(input({ evaluation: { preferredScenarioId: "life" } }));
    expect([keepWins.keep.verdict, keepWins.switch?.verdict]).toEqual(["recommended", "alternative"]);
    const switchWins = buildJourney(input({ evaluation: { preferredScenarioId: REPLACE_ID } }));
    expect([switchWins.keep.verdict, switchWins.switch?.verdict]).toEqual(["alternative", "recommended"]);
    const close = buildJourney(input({ evaluation: { preferredScenarioId: "inconclusive" } }));
    expect([close.keep.verdict, close.switch?.verdict]).toEqual(["close", "close"]);
  });

  it("does not depend on which branch is selected: a close call stays close, and so does everything else", () => {
    // Strip the only things selecting a branch is allowed to move.
    const sameButSelection = (j: Journey) => ({ ...j, selectedFuture: "x", vehicleNow: "x", keep: { ...j.keep, selected: false }, switch: j.switch && { ...j.switch, selected: false } });
    for (const preferred of ["inconclusive", "life", REPLACE_ID]) {
      for (const month of [0, 12, 40]) {
        const evaluation = { preferredScenarioId: preferred };
        const onKeep = buildJourney(input({ evaluation, activeMonth: month, activeScenarioId: "life" }));
        const onSwitch = buildJourney(input({ evaluation, activeMonth: month, activeScenarioId: REPLACE_ID }));
        expect(onSwitch.call).toBe(onKeep.call);
        expect(onSwitch.keep.verdict).toBe(onKeep.keep.verdict);
        expect(onSwitch.switch?.verdict).toBe(onKeep.switch?.verdict);
        expect(sameButSelection(onSwitch)).toEqual(sameButSelection(onKeep));
      }
    }
    expect(buildJourney(input({ evaluation: { preferredScenarioId: "inconclusive" }, activeScenarioId: REPLACE_ID })).call).toBe("close");
  });
});

describe("events", () => {
  it("lists what you told Fork once, in both futures, plus the swap in the switch only", () => {
    const j = buildJourney(input());
    expect(j.events.map((e) => [e.id, e.kind, e.futures])).toEqual([
      ["miles", "life", ["keep", "switch"]],
      ["move", "life", ["keep", "switch"]],
      ["life/replace/event", "swap", ["switch"]],
      ["kid", "life", ["keep", "switch"]],
    ]);
  });

  it("is chronological, and events in the same month keep the order they were made in", () => {
    const early = ev("early", "budget_change", 5, { monthlyBudget: 500 });
    const tiedFirst = ev("tied-a", "cargo_change", 20, { cargoNeed: "high" });
    const tiedSecond = ev("tied-b", "fuel_price_change", 20, { fuelPricePerGal: 4.5 });
    const life = sc("life", "base", [tiedFirst, KID, tiedSecond, early, MILES]);
    const j = buildJourney(input({ scenarios: [BASE, life, sc(REPLACE_ID, "life", [swapEvent(20)])], comparison: { keepId: "life", replaceId: REPLACE_ID } }));
    expect(j.events.map((e) => e.id)).toEqual(["miles", "early", "tied-a", "tied-b", "life/replace/event", "kid"]);
    expect(j.events.map((e) => e.month)).toEqual([0, 5, 20, 20, 20, 32]);
  });

  it("gives a shared event the same month in both futures", () => {
    const replace = replaceAt(12);
    const j = buildJourney(input());
    for (const e of j.events.filter((x) => x.kind === "life")) {
      expect(e.futures).toEqual(["keep", "switch"]);
      expect(LIFE.events.find((x) => x.id === e.id)?.month).toBe(e.month);
      expect(replace.events.find((x) => x.id === e.id)?.month).toBe(e.month);
    }
    // and with no comparison the offer shows the same life at the same months
    const offer = buildJourney(offerInput());
    expect(offer.events.map((e) => [e.id, e.month])).toEqual([["miles", 0], ["move", 12], ["kid", 32]]);
  });

  it("titles and dates them from the event and the scenario's start date", () => {
    const byId = Object.fromEntries(buildJourney(input()).events.map((e) => [e.id, e]));
    expect(byId.miles).toMatchObject({ title: "20,000 miles a year", dateLabel: "Oct 2026", whenLabel: "Now" });
    expect(byId.move).toMatchObject({ title: "Move to Denver", dateLabel: "Oct 2027", whenLabel: "In 1 yr" });
    expect(byId.kid).toMatchObject({ title: "Second child", dateLabel: "Jun 2029", whenLabel: "In 2 yr 8 mo" });
    expect(byId["life/replace/event"]).toMatchObject({ title: "Switch to the RAV4", dateLabel: "Oct 2027", whenLabel: "In 1 yr", type: "vehicle_replacement" });
  });

  it("passes the quote, certainty, assumptions and payload through unchanged", () => {
    const j = buildJourney(input());
    const byId = Object.fromEntries(j.events.map((e) => [e.id, e]));
    expect(byId.move.quote).toBe("moving to Denver next year");
    expect(byId.move.certainty).toBe("clear");
    expect(byId.move.payload).toBe(MOVE.payload);
    expect(byId.kid.certainty).toBe("inferred");
    expect(byId.kid.assumptions).toBe(KID.assumptions);
    expect("quote" in byId.kid).toBe(false);
    expect(byId["life/replace/event"].assumptions).toEqual(["Replacement month 12"]);
    expect(byId["life/replace/event"].payload).toEqual({ vehicleId: RAV4.id });
  });

  it("leaves out what is not confirmed, and what is not on the road", () => {
    const life = sc("life", "base", [
      MOVE,
      ev("proposed", "cargo_change", 3, { cargoNeed: "high" }, { status: "proposed" }),
      ev("invalid", "cargo_change", 4, { cargoNeed: "high" }, { status: "invalid" }),
      ev("late", "budget_change", 61, { monthlyBudget: 100 }),
      ev("early", "budget_change", -1, { monthlyBudget: 100 }),
      ev("nan", "budget_change", Number.NaN, { monthlyBudget: 100 }),
    ]);
    const j = buildJourney(offerInput({ scenarios: [BASE, life] }));
    expect(j.events.map((e) => e.id)).toEqual(["move"]);
    clean(j);
  });

  it("flags the events the last change touched while it is recent, and only then", () => {
    const flagged = (lastChange: JourneyInput["lastChange"]) => buildJourney(input({ lastChange })).events.filter((e) => e.changed).map((e) => e.id);
    expect(flagged({ eventIds: ["move"], recent: true })).toEqual(["move"]);
    expect(flagged({ eventIds: ["kid", "life/replace/event"], recent: true })).toEqual(["life/replace/event", "kid"]);
    expect(flagged({ eventIds: ["move"], recent: false })).toEqual([]);
    expect(flagged({ eventIds: [], recent: true })).toEqual([]);
    expect(flagged({ eventIds: ["not an event"], recent: true })).toEqual([]);
    expect(flagged(null)).toEqual([]);
  });

  it("has no swap event until there is a comparison, and the offer is not an event", () => {
    const j = buildJourney(offerInput());
    expect(j.events.some((e) => e.kind === "swap" || e.type === "vehicle_replacement")).toBe(false);
  });

  it("keeps a selected event only while it is on the road", () => {
    expect(buildJourney(input({ selectedEventId: "kid" })).selectedEventId).toBe("kid");
    expect(buildJourney(input({ selectedEventId: "life/replace/event" })).selectedEventId).toBe("life/replace/event");
    expect(buildJourney(input({ selectedEventId: "gone" })).selectedEventId).toBeNull();
    expect(buildJourney(offerInput({ selectedEventId: "life/replace/event" })).selectedEventId).toBeNull();
  });
});

describe("branches", () => {
  it("keeps the owned car to the end, and never leaves", () => {
    const { keep } = buildJourney(input());
    expect(keep).toMatchObject({ kind: "keep", scenarioId: "life", title: "Keep your Camry", splitMonth: null, priced: true });
    expect(keep.segments).toEqual([{ vehicleId: CAMRY.id, name: "2022 Camry SE", model: "Camry", fromMonth: 0, toMonth: 60 }]);
    expect(keep.endVehicle).toEqual(keep.segments[0]);
  });

  it("switches at the modeled swap month, in the owned car before and the replacement from then on", () => {
    const j = buildJourney(input());
    expect(j.switch).toMatchObject({ kind: "switch", scenarioId: REPLACE_ID, title: "Switch to the RAV4", splitMonth: 12, priced: true });
    expect(j.switch?.segments).toEqual([
      { vehicleId: CAMRY.id, name: "2022 Camry SE", model: "Camry", fromMonth: 0, toMonth: 12 },
      { vehicleId: RAV4.id, name: "2024 RAV4 Hybrid XLE", model: "RAV4", fromMonth: 12, toMonth: 60 },
    ]);
    expect(j.switch?.endVehicle).toEqual(j.switch?.segments[1]);
  });

  it.each([0, 1, 6, 11, 12, 13, 37, 59, 60])("splits at exactly month %i when the swap is in month %i", (m) => {
    const replace = replaceAt(m);
    const j = buildJourney(input({ scenarios: [BASE, LIFE, replace], results: { life: result("life", KEEP_COST), [REPLACE_ID]: result(REPLACE_ID, SWITCH_COST, m) } }));
    expect(j.switch?.splitMonth).toBe(m);
    expect(j.events.find((e) => e.kind === "swap")?.month).toBe(m);
    expect(j.stops).toContain(m);
    const segs = j.switch!.segments;
    expect(segs[segs.length - 1]).toMatchObject({ vehicleId: RAV4.id, fromMonth: m, toMonth: 60 });
    if (m > 0) expect(segs[0]).toMatchObject({ vehicleId: CAMRY.id, fromMonth: 0, toMonth: m });
    else expect(segs).toHaveLength(1); // a swap now leaves no months in the old car
  });

  it("is not the scenario's fork month that sets the split but the swap event's month", () => {
    const replace = { ...replaceAt(12), forkMonth: 3 };
    expect(buildJourney(input({ scenarios: [BASE, LIFE, replace] })).switch?.splitMonth).toBe(12);
  });

  it("ignores a swap that is not confirmed", () => {
    const replace = sc(REPLACE_ID, "life", [MILES, MOVE, KID, { ...swapEvent(12), status: "proposed" }]);
    const j = buildJourney(input({ scenarios: [BASE, LIFE, replace] }));
    expect(j.switch?.splitMonth).toBeNull();
    expect(j.switch?.segments).toHaveLength(1);
    expect(j.events.some((e) => e.kind === "swap")).toBe(false);
  });

  it("works from the replacement vehicle the swap names, even if the app only knows it by id", () => {
    const j = buildJourney(input({ replacementVehicle: null, other: null }));
    expect(j.switch?.endVehicle?.vehicleId).toBe(RAV4.id);
    expect(j.switch?.title).toBe("Switch to the other car");
    expect(j.switch?.endVehicle?.name).toBe("Another car");
    clean(j);
  });

  describe("the offer, before anything is compared", () => {
    it("is an unpriced branch at the default swap month, with no invented cost", () => {
      const defaultSwapMonth = vi.fn((keep: Scenario): number | null => (keep ? 14 : null));
      const j = buildJourney(offerInput({ defaultSwapMonth }));
      expect(defaultSwapMonth).toHaveBeenCalledTimes(1);
      expect(defaultSwapMonth.mock.calls[0][0]).toBe(LIFE);
      expect(j.switch).toMatchObject({ scenarioId: null, title: "Switch to the RAV4", priced: false, splitMonth: 14, fiveYearCost: null, costThroughMonth: null, selected: false, verdict: null });
      expect(j.switch?.costSource).toBeUndefined();
      expect(j.switch?.segments.map((s) => [s.model, s.fromMonth, s.toMonth])).toEqual([["Camry", 0, 14], ["RAV4", 14, 60]]);
      expect(j.difference).toBeNull();
      expect(j.call).toBeNull();
      expect(j.stops).toContain(14);
    });

    it("has no price even when the switch car happens to have results lying around", () => {
      const j = buildJourney(offerInput({ results: { base: result("base", KEEP_COST), life: result("life", KEEP_COST), [REPLACE_ID]: result(REPLACE_ID, SWITCH_COST, 12) } }));
      expect(j.switch?.priced).toBe(false);
      expect(j.switch?.fiveYearCost).toBeNull();
    });

    it("has no split when the default month is unknown, and draws nothing for it", () => {
      for (const defaultSwapMonth of [() => null, () => { throw new Error("no engine"); }, () => 99, () => -2, () => Number.NaN]) {
        const j = buildJourney(offerInput({ defaultSwapMonth }));
        expect(j.switch).toMatchObject({ priced: false, splitMonth: null, segments: [], endVehicle: null });
        clean(j);
      }
    });

    it("is not offered when there is no other car", () => {
      expect(buildJourney(offerInput({ other: null })).switch).toBeNull();
    });
  });
});

describe("costs", () => {
  it("reports the simulation's month 60 figure as the five year cost, raw", () => {
    const j = buildJourney(input());
    expect(j.keep.fiveYearCost).toBe(KEEP_COST(60));
    expect(j.switch?.fiveYearCost).toBe(SWITCH_COST(60));
  });

  it("does not change at any month while scrubbing 0 to 60", () => {
    const base = buildJourney(input());
    for (let m = 0; m <= 60; m++) {
      for (const active of ["life", REPLACE_ID]) {
        const j = buildJourney(input({ activeMonth: m, activeScenarioId: active }));
        expect(j.keep.fiveYearCost).toBe(base.keep.fiveYearCost);
        expect(j.switch?.fiveYearCost).toBe(base.switch?.fiveYearCost);
        expect(j.difference).toEqual(base.difference);
        expect(j.keep.costSource).toBe(base.keep.costSource);
      }
    }
  });

  it("reports cost through the selected month from the same series, and 0 at month 0", () => {
    expect(buildJourney(input({ activeMonth: 0 })).keep.costThroughMonth).toBe(0);
    expect(buildJourney(input({ activeMonth: 0 })).switch?.costThroughMonth).toBe(0);
    for (const m of [1, 11, 12, 13, 32, 59, 60]) {
      const j = buildJourney(input({ activeMonth: m }));
      expect(j.keep.costThroughMonth).toBe(KEEP_COST(m));
      expect(j.switch?.costThroughMonth).toBe(SWITCH_COST(m));
    }
    expect(buildJourney(input({ activeMonth: 60 })).keep.costThroughMonth).toBe(buildJourney(input()).keep.fiveYearCost);
  });

  it("is unpriced, with no numbers, when the simulation has no result for it yet", () => {
    const j = buildJourney(input({ results: { life: result("life", KEEP_COST) } }));
    expect(j.keep.priced).toBe(true);
    expect(j.switch).toMatchObject({ scenarioId: REPLACE_ID, priced: false, fiveYearCost: null, costThroughMonth: null });
    expect(j.switch?.costSource).toBeUndefined();
    expect(j.difference).toBeNull();
    clean(j);
  });

  it("does not price a future from a result with a broken figure", () => {
    const broken = result(REPLACE_ID, () => Number.NaN, 12);
    const j = buildJourney(input({ results: { life: result("life", KEEP_COST), [REPLACE_ID]: broken } }));
    expect(j.switch?.priced).toBe(false);
    clean(j);
  });

  it("labels each cost with the weakest source of what went into it, using the car it ends in", () => {
    const sources = (msrp: SpecSheet["sources"][string]): SpecSheet["sources"] => ({ mpgCombined: "sourced", maintenance: "sourced", msrp, depreciation: "sourced" });
    const specsFor = (id: string) => (id === CAMRY.id ? spec(id, sources("listing")) : id === RAV4.id ? spec(id, sources("estimated")) : null);
    const j = buildJourney(input({ specsFor }));
    expect(j.keep.costSource).toBe("sourced");
    expect(j.switch?.costSource).toBe("estimated");
    expect(j.difference?.source).toBe("estimated");
    // a different profile source changes the label
    const weaker = buildJourney(input({ specsFor, confirmedProfile: { ...PROFILE, provenance: { annualMiles: "synthetic", fuelPricePerGal: "user" } } }));
    expect(weaker.keep.costSource).toBe("synthetic");
  });

  it("shows a missing source as missing, never as a guess", () => {
    expect(buildJourney(input()).keep.costSource).toBeUndefined(); // no spec sheet handed in
    expect(buildJourney(input({ specsFor: () => { throw new Error("no sheet"); } })).keep.costSource).toBeUndefined();
  });
});

describe("the difference", () => {
  const withCosts = (keep: number, switching: number) =>
    buildJourney(input({ results: { life: result("life", () => keep), [REPLACE_ID]: result(REPLACE_ID, () => switching, 12) } })).difference;

  it("says what switching adds or saves, from the two rounded figures", () => {
    expect(withCosts(31287, 35639)).toMatchObject({ amount: 4352, phrase: "Switching adds $4,352" });
    expect(withCosts(35639, 31287)).toMatchObject({ amount: -4352, phrase: "Switching saves $4,352" });
    expect(withCosts(1000, 1000)).toMatchObject({ amount: 0, phrase: "No difference between the two" });
  });

  it("is built from the rounded figures, so the sentence always agrees with the numbers shown", () => {
    expect(withCosts(1000.4, 1000.6)).toMatchObject({ amount: 1, phrase: "Switching adds $1" }); // $1,000 and $1,001
    expect(withCosts(1000.4, 999.6)).toMatchObject({ amount: 0, phrase: "No difference between the two" }); // both $1,000
    expect(Object.is(withCosts(1000.4, 999.6)!.amount, 0)).toBe(true); // 0, never -0
  });

  it("is switch minus keep, and takes the switch's source", () => {
    const specsFor = (id: string) => spec(id, { mpgCombined: "user", maintenance: "user", msrp: id === RAV4.id ? "illustrative" : "user", depreciation: "user" });
    const d = buildJourney(input({ specsFor })).difference!;
    expect(d.amount).toBe(Math.round(SWITCH_COST(60)) - Math.round(KEEP_COST(60)));
    expect(d.source).toBe("illustrative");
  });

  it("is null until both futures are priced", () => {
    expect(buildJourney(offerInput()).difference).toBeNull();
    expect(buildJourney(input({ results: { life: result("life", KEEP_COST) } })).difference).toBeNull();
    expect(buildJourney(input({ results: {} })).difference).toBeNull();
  });
});

describe("the car shown", () => {
  const at = (m: number, active: string, over: Partial<JourneyInput> = {}) => buildJourney(input({ activeMonth: m, activeScenarioId: active, ...over })).vehicleNow;

  it("is the owned car at every month in the keep future", () => {
    for (const m of [0, 11, 12, 13, 60]) expect(at(m, "life").vehicleId).toBe(CAMRY.id);
  });

  it("flips at exactly the swap month in the switch future: month 11 the old car, month 12 the new one", () => {
    expect(at(11, REPLACE_ID).vehicleId).toBe(CAMRY.id);
    expect(at(12, REPLACE_ID).vehicleId).toBe(RAV4.id);
    expect(at(0, REPLACE_ID).vehicleId).toBe(CAMRY.id);
    expect(at(60, REPLACE_ID).vehicleId).toBe(RAV4.id);
    expect(at(12, REPLACE_ID)).toMatchObject({ name: "2024 RAV4 Hybrid XLE", fromMonth: 12, toMonth: 60 });
  });

  it("flips at the swap month wherever it is", () => {
    for (const m of [1, 5, 23, 59, 60]) {
      const replace = replaceAt(m);
      const over = { scenarios: [BASE, LIFE, replace] };
      expect(at(m - 1, REPLACE_ID, over).vehicleId).toBe(CAMRY.id);
      expect(at(m, REPLACE_ID, over).vehicleId).toBe(RAV4.id);
    }
  });

  it("agrees with the simulation's own car in every month", () => {
    const replace = replaceAt(12);
    const results = { life: result("life", KEEP_COST), [REPLACE_ID]: result(REPLACE_ID, SWITCH_COST, 12) };
    for (const p of results[REPLACE_ID].points) expect(at(p.month, REPLACE_ID, { results, scenarios: [BASE, LIFE, replace] }).vehicleId).toBe(p.vehicleId);
    for (const p of results.life.points) expect(at(p.month, "life", { results }).vehicleId).toBe(p.vehicleId);
  });

  it("follows the month and the future, nothing else", () => {
    // selecting the other branch at a month before the swap shows the same car
    expect(at(5, REPLACE_ID).vehicleId).toBe(at(5, "life").vehicleId);
  });

  it("never touches the owned vehicle: not its data, not its id, whatever is hypothetically selected", () => {
    const owned = { ...CAMRY, vin: "4T1G11AK1NU900001" };
    const frozen = deepFreeze(input({ twin: { vehicle: owned } }));
    const before = JSON.stringify(frozen.twin);
    for (const active of ["life", REPLACE_ID]) {
      for (const m of [0, 12, 60]) {
        const j = buildJourney({ ...frozen, activeScenarioId: active, activeMonth: m });
        expect(j.keep.segments).toHaveLength(1);
        expect(j.keep.segments[0].vehicleId).toBe(owned.id);
        expect(j.switch?.segments[0].vehicleId).toBe(owned.id);
        expect(j.keep.endVehicle?.vehicleId).toBe(owned.id);
      }
    }
    expect(JSON.stringify(frozen.twin)).toBe(before);
    expect(frozen.twin.vehicle).toBe(owned);
  });
});

describe("stops, and the rest of the frame", () => {
  it("stops at each event and at the split: unique, sorted, within the road", () => {
    expect(buildJourney(input()).stops).toEqual([0, 12, 32]);
    const pile = sc("life", "base", [ev("a", "budget_change", 40, {}), ev("b", "budget_change", 40, {}), ev("c", "budget_change", 3, {}), ev("d", "budget_change", 90, {})]);
    const j = buildJourney(input({ scenarios: [BASE, pile, sc(REPLACE_ID, "life", [swapEvent(20)])] }));
    expect(j.stops).toEqual([3, 20, 40]);
    expect(buildJourney(offerInput({ scenarios: [BASE, sc("life", "base", [])], defaultSwapMonth: () => 9 })).stops).toEqual([9]);
    expect(buildJourney(offerInput({ scenarios: [BASE, sc("life", "base", [])], defaultSwapMonth: () => null })).stops).toEqual([]);
  });

  it("is updating whenever the store is busy", () => {
    expect(buildJourney(input({ busy: "idle" })).updating).toBe(false);
    expect(buildJourney(input({ busy: "simulating" })).updating).toBe(true);
    expect(buildJourney(input({ busy: "interpreting" })).updating).toBe(true);
  });

  it("passes the revision through, and reports the road and the selected month", () => {
    const j = buildJourney(input({ revision: 41, activeMonth: 12 }));
    expect(j.revision).toBe(41);
    expect(j.horizon).toBe(60);
    expect(j.month).toBe(12);
    expect(j.monthLabel).toBe("Oct 2027");
  });

  it("keeps the month on the road", () => {
    expect(buildJourney(input({ activeMonth: -5 })).month).toBe(0);
    expect(buildJourney(input({ activeMonth: 99 })).month).toBe(60);
    expect(buildJourney(input({ activeMonth: Number.NaN })).month).toBe(0);
    expect(buildJourney(input({ activeMonth: 60 })).monthLabel).toBe("Oct 2031");
  });

  it("is a pure function: same snapshot, same answer, and the snapshot is left exactly as it was", () => {
    const snapshot = deepFreeze(input({ activeScenarioId: REPLACE_ID, activeMonth: 20, lastChange: { eventIds: ["kid"], recent: true }, selectedEventId: "kid" }));
    const first = buildJourney(snapshot);
    expect(buildJourney(snapshot)).toEqual(first);
    expect(JSON.stringify(snapshot)).toBe(JSON.stringify(input({ activeScenarioId: REPLACE_ID, activeMonth: 20, lastChange: { eventIds: ["kid"], recent: true }, selectedEventId: "kid" })));
  });
});

describe("bad input", () => {
  it("never produces NaN or undefined text", () => {
    for (let m = 0; m <= 60; m++) {
      clean(buildJourney(input({ activeMonth: m, activeScenarioId: m % 2 ? REPLACE_ID : "life" })));
      clean(buildJourney(offerInput({ activeMonth: m })));
    }
    clean(buildJourney(input({ todayISO: "garbage", activeMonth: 30 })));
    clean(buildJourney(input({ todayISO: "" })));
  });

  it("leaves dates empty when the start date is unreadable", () => {
    const j = buildJourney(input({ todayISO: "garbage", activeMonth: 12 }));
    expect(j.monthLabel).toBe("");
    expect(j.events.every((e) => e.dateLabel === "")).toBe(true);
    expect(j.events.map((e) => e.whenLabel)).toEqual(["Now", "In 1 yr", "In 1 yr", "In 2 yr 8 mo"]);
  });

  it("copes with no scenarios at all", () => {
    const j = buildJourney(input({ scenarios: [], results: {}, comparison: null, evaluation: null, activeScenarioId: "base" }));
    expect(j.keep).toMatchObject({ scenarioId: null, priced: false, fiveYearCost: null });
    expect(j.events).toEqual([]);
    expect(j.vehicleNow.vehicleId).toBe(CAMRY.id);
    clean(j);
  });
});
