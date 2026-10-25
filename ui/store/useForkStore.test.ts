import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LifeEvent } from "@/contracts";
import { ai, data, sim } from "@/ui/mocks";
import { BASE_ID, breakEvenParameterFor, resetForkStoreForTests, simulationInputs, useForkStore } from "./useForkStore";

const CAMRY = "camry-2022-se";
const RAV4 = "rav4-2024-hybrid-xle";

const state = () => useForkStore.getState();
const actions = () => useForkStore.getState().actions;

async function enterWorkspace(id = CAMRY) {
  await actions().startFromSample(id);
  actions().onRevealStage("done");
}

const denver: LifeEvent = {
  id: "e-denver",
  type: "relocation",
  month: 12,
  payload: { city: "Denver" },
  source: "ai",
  assumptions: [],
  quote: "moving to Denver next year",
  certainty: "clear",
  status: "proposed",
};
const miles20k: LifeEvent = {
  id: "e-miles",
  type: "mileage_change",
  month: 12,
  payload: { annualMiles: 20000 },
  source: "ai",
  assumptions: [],
  quote: "driving 20,000 miles annually",
  certainty: "clear",
  status: "proposed",
};

function interpretReturning(proposals: LifeEvent[]) {
  return vi.spyOn(ai, "interpret").mockResolvedValue({
    aiAvailable: true,
    intent: "CREATE_SCENARIO",
    proposals,
    profilePatches: [],
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  resetForkStoreForTests();
  useForkStore.setState({ hydrated: true });
});

describe("start", () => {
  it("builds a twin and begins the reveal, with no baseline yet", async () => {
    await actions().startFromSample(CAMRY);
    expect(state().phase).toBe("reveal");
    expect(state().stage.phase).toBe("reveal");
    expect(state().twin?.vehicle.id).toBe(CAMRY);
    expect(state().activeVehicleId).toBe(CAMRY);
    expect(state().explore.scenarios).toEqual([]);
    expect(state().ui.busy).toBe("idle");
  });

  it("creates the baseline scenario and projection when the reveal is done", async () => {
    await enterWorkspace();
    expect(state().phase).toBe("workspace");
    expect(state().stage.phase).toBe("interactive");
    expect(state().explore.scenarios.map((s) => s.id)).toEqual([BASE_ID]);
    const result = state().results[BASE_ID];
    // The real projection is end-of-month, months 1 to 60. Month 0 is "now" and has no point.
    expect(result.points.map((p) => p.month)).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
    expect(result.points[0].mileage).toBeGreaterThan(state().twin!.mileage);
    expect(result.points[59].mileage).toBeGreaterThan(result.points[0].mileage);
  });

  it("ignores late reveal callbacks once the reveal is over", async () => {
    await enterWorkspace();
    const before = state().explore.scenarios;
    actions().onRevealStage("done");
    expect(state().explore.scenarios).toBe(before);
  });

  it("invalid VIN creates no twin and says why", async () => {
    await actions().startFromVin("ABC");
    expect(state().twin).toBeNull();
    expect(state().phase).toBe("landing");
    expect(state().error).toMatch(/17 characters/);

    await actions().startFromVin("1HGCM82633A00435I");
    expect(state().twin).toBeNull();
    await actions().startFromVin("1HGCM82633A00435!");
    expect(state().error).toMatch(/letters and numbers/);
    await actions().startFromVin("1HGCM82633A00435O".padEnd(17, "1"));
    expect(state().error).toMatch(/I, O, or Q/);
  });

  it("a valid but undecodable VIN reports it and still creates no twin", async () => {
    await actions().startFromVin("1HGCM82633A004352");
    expect(state().twin).toBeNull();
    expect(state().error).toBeTruthy();
  });

  it("picker only accepts the two supported cars", async () => {
    await actions().startFromPicker("Honda", "Civic", 2020);
    expect(state().twin).toBeNull();
    expect(state().error).toMatch(/Camry/);

    await actions().startFromPicker("toyota", "rav4", 2024, "Hybrid XLE");
    expect(state().twin?.vehicle.id).toBe(RAV4);
  });

  it("surfaces a twin build failure instead of throwing", async () => {
    vi.spyOn(data, "buildDemoTwin").mockResolvedValue({ ok: false, error: "twin broke" });
    await actions().startFromSample(CAMRY);
    expect(state().twin).toBeNull();
    expect(state().error).toBe("twin broke");
    expect(state().ui.busy).toBe("idle");

    vi.spyOn(data, "buildTwin").mockResolvedValue({ ok: false, error: "ordinary twin broke" });
    await actions().startFromPicker("Toyota", "Camry", 2022, "SE");
    expect(state().twin).toBeNull();
    expect(state().error).toBe("ordinary twin broke");
    expect(state().ui.busy).toBe("idle");
  });

  it("a sample car opens the Alex demo: synthetic profile, pinned date", async () => {
    await actions().startFromSample(CAMRY);
    const { driver } = state().twin!;
    expect(driver).toMatchObject({ householdSize: 3, children: 1, carSeats: 0, cargoNeed: "low", location: "Austin, TX" });
    expect(driver.priorities).toEqual({ cost: 0.2, family: 0.2, longevity: 0.2, fuel: 0.2, comfort: 0.2 });
    expect(driver.provenance.householdSize).toBe("synthetic");
    expect(state().todayISO).toBe(data.demo.todayISO);
  });

  it("the registry's sample VIN opens the same demo, as typed", async () => {
    await actions().startFromVin("4T1G11AK1NU900001");
    expect(state().twin?.vehicle.id).toBe(CAMRY);
    expect(state().twin?.driver.provenance.householdSize).toBe("synthetic");
    expect(state().todayISO).toBe(data.demo.todayISO);
  });

  it("the model picker is ordinary entry: nothing about the driver is assumed to be Alex", async () => {
    await actions().startFromPicker("Toyota", "Camry", 2022, "SE");
    const { driver } = state().twin!;
    expect(driver.householdSize).toBe(1);
    expect(driver.location).toBe("Not provided");
    expect(driver.provenance.householdSize).toBe("estimated");
    expect(state().todayISO).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("a VIN with a bad check digit is refused before any twin is built", async () => {
    await actions().startFromVin("4T1G11AK2NU900001");
    expect(state().twin).toBeNull();
    expect(state().error).toMatch(/check digit/i);
  });
});

describe("time", () => {
  it("clamps the active month to 0..60", async () => {
    await enterWorkspace();
    actions().setActiveMonth(99);
    expect(state().activeMonth).toBe(60);
    actions().setActiveMonth(-4);
    expect(state().activeMonth).toBe(0);
    actions().setActiveMonth(Number.NaN);
    expect(state().activeMonth).toBe(0);
    actions().setActiveMonth(17.6);
    expect(state().activeMonth).toBe(18);
  });
});

describe("dump and confirm", () => {
  it("with no AI it reads the sentence with plain rules and proposes only what was written", async () => {
    await enterWorkspace();
    const before = state().explore.scenarios;
    const outcome = await actions().submitDump("I'm moving to Denver");
    expect(outcome).toMatchObject({ kind: "proposed" });
    expect(state().ui.aiAvailable).toBe(false);
    const drafts = state().explore.draftChanges;
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ type: "relocation", status: "proposed", payload: { location: "Denver" } });
    expect(drafts[0].assumptions[0]).toMatch(/no future timing stated/i); // the shared reader says so itself
    expect(state().explore.scenarios).toBe(before); // a proposal changes nothing
    expect(state().ui.busy).toBe("idle");
  });

  it("with no AI, text with no change in it proposes nothing and says so", async () => {
    await enterWorkspace();
    const outcome = await actions().submitDump("I'm moving");
    expect(outcome.kind).toBe("nothing");
    expect(state().explore.draftChanges).toEqual([]);
  });

  it("a throwing interpret falls back to the plain rules and changes nothing", async () => {
    await enterWorkspace();
    vi.spyOn(ai, "interpret").mockRejectedValue(new Error("gemini down"));
    const before = state().explore.scenarios;
    const outcome = await actions().submitDump("moving to Denver next year");
    expect(outcome).toMatchObject({ kind: "proposed" });
    expect(state().ui.aiAvailable).toBe(false);
    expect(state().error).toBeNull();
    expect(state().explore.scenarios).toBe(before);
  });

  it("unconfirmed proposals change nothing", async () => {
    await enterWorkspace();
    const { scenarios, confirmedProfile } = state().explore;
    const results = state().results;
    const profileBefore = structuredClone(confirmedProfile);

    interpretReturning([denver, miles20k]);
    await actions().submitDump("moving to Denver, 20,000 miles");

    expect(state().explore.draftChanges.map((e) => e.id)).toEqual(["e-denver", "e-miles"]);
    expect(state().explore.scenarios).toBe(scenarios);
    expect(state().results).toBe(results);
    expect(state().explore.confirmedProfile).toEqual(profileBefore);
    expect(state().evaluation).toBeNull();
  });

  it("forces AI proposals to stay proposed even if they arrive confirmed", async () => {
    await enterWorkspace();
    interpretReturning([{ ...denver, status: "confirmed" }]);
    await actions().submitDump("moving");
    expect(state().explore.draftChanges[0].status).toBe("proposed");
  });

  it("confirm forks from the active scenario, simulates, and activates the branch", async () => {
    await enterWorkspace();
    interpretReturning([denver, miles20k]);
    await actions().submitDump("dump");
    const base = state().explore.scenarios[0];
    const baseResult = state().results[BASE_ID];
    const profileBefore = structuredClone(state().explore.confirmedProfile);

    actions().confirmDrafts(["e-denver", "e-miles"]);

    const scenarios = state().explore.scenarios;
    expect(scenarios).toHaveLength(2);
    const child = scenarios[1];
    expect(child.parentId).toBe(BASE_ID);
    expect(child.forkMonth).toBe(12);
    expect(child.name).toBe("Move to Denver + 1 more");
    expect(child.events.every((e) => e.status === "confirmed")).toBe(true);
    expect(state().results[child.id].points).toHaveLength(60);
    expect(state().activeScenarioId).toBe(child.id);
    expect(state().explore.draftChanges).toEqual([]);

    // parent untouched, profile untouched (exploring is not changing)
    expect(state().explore.scenarios[0]).toBe(base);
    expect(state().results[BASE_ID]).toBe(baseResult);
    expect(state().explore.confirmedProfile).toEqual(profileBefore);
  });

  it("a second dump keeps the later events the first one set (nothing is dropped silently)", async () => {
    const kid: LifeEvent = { ...denver, id: "e-kid", type: "family_change", month: 32, payload: { children: 2 }, quote: "second child in 2029" };
    const milesNow: LifeEvent = { ...miles20k, id: "e-miles-now", month: 0 };
    const fuel: LifeEvent = { ...denver, id: "e-fuel", type: "fuel_price_change", month: 24, payload: { fuelPricePerGal: 6 }, quote: "gas hits $6 in two years" };
    const milesSix: LifeEvent = { ...miles20k, id: "e-miles-six", month: 6, payload: { annualMiles: 15000 } };
    await enterWorkspace();
    interpretReturning([denver, kid, milesNow, fuel]);
    await actions().submitDump("first");
    actions().confirmDrafts(["e-denver", "e-kid", "e-miles-now", "e-fuel"]);
    const first = state().explore.scenarios[1];

    interpretReturning([milesSix]);
    await actions().submitDump("second");
    actions().confirmDrafts(["e-miles-six"]);

    const second = state().explore.scenarios[2];
    expect(second.parentId).toBe(first.id);
    expect(second.forkMonth).toBe(6);
    expect(second.events.map((e) => e.id).sort()).toEqual(["e-denver", "e-fuel", "e-kid", "e-miles-now", "e-miles-six"]);

    // Replay: the same events on a plain scenario give the same projection, and losing the later ones does not.
    const inputs = simulationInputs(state())!;
    const flat = { ...second, parentId: null, forkMonth: 0 };
    const withoutLater = { ...flat, events: flat.events.filter((e) => e.month < 6 || e.id === "e-miles-six") };
    const simulate = (sc: typeof flat) => sim.simulate(inputs.twin, sc, inputs.ctx);
    expect(state().results[second.id].summary).toEqual(simulate(flat).summary);
    expect(state().results[second.id].summary.netCost).not.toBe(simulate(withoutLater).summary.netCost);
  });

  it("confirm only takes the ids it is given", async () => {
    await enterWorkspace();
    interpretReturning([denver, miles20k]);
    await actions().submitDump("dump");
    actions().confirmDrafts(["e-denver"]);
    expect(state().explore.draftChanges.map((e) => e.id)).toEqual(["e-miles"]);
    expect(state().explore.scenarios[1].events.map((e) => e.id)).toEqual(["e-denver"]);
  });

  it("confirming nothing does nothing", async () => {
    await enterWorkspace();
    const before = state().explore.scenarios;
    actions().confirmDrafts([]);
    actions().confirmDrafts(["missing"]);
    expect(state().explore.scenarios).toBe(before);
  });

  it("edit keeps a draft a draft, reject removes it", async () => {
    await enterWorkspace();
    interpretReturning([denver]);
    await actions().submitDump("dump");
    actions().editDraft("e-denver", { month: 18, status: "confirmed", id: "hacked" });
    const edited = state().explore.draftChanges[0];
    expect(edited).toMatchObject({ id: "e-denver", month: 18, status: "proposed" });
    actions().rejectDraft("e-denver");
    expect(state().explore.draftChanges).toEqual([]);
    expect(state().explore.scenarios).toHaveLength(1);
  });
});

describe("questions and profile answers", () => {
  it("asks nothing about Alex: every number the comparison needs is already backed", async () => {
    await enterWorkspace();
    interpretReturning([denver]);
    await actions().submitDump("dump");
    actions().confirmDrafts(["e-denver"]);
    await actions().openReplaceComparison();
    expect(state().question).toBeNull();
  });

  it("shows at most one question and never repeats an answered field", async () => {
    // Ordinary entry estimates cargo need, so the comparison asks about it.
    await actions().startFromPicker("Toyota", "Camry", 2022, "SE");
    actions().onRevealStage("done");
    await actions().openReplaceComparison();
    expect(state().question?.field).toBe("cargoNeed");

    actions().answerQuestion("cargoNeed", "unsure");
    expect(state().answeredFields).toContain("cargoNeed");
    expect(state().question).toBeNull();
  });

  it("'I'm not sure' relabels the value as an estimate without changing it", async () => {
    await enterWorkspace();
    const before = state().explore.confirmedProfile.cargoNeed;
    actions().answerQuestion("cargoNeed", "unsure");
    expect(state().explore.confirmedProfile.cargoNeed).toBe(before);
    expect(state().explore.confirmedProfile.provenance.cargoNeed).toBe("estimated");
  });

  it("a real answer is stored as the user's and moves the projection", async () => {
    await enterWorkspace();
    const fuelAt60 = () => state().results[BASE_ID].points.find((p) => p.month === 60)!.fuelSpend;
    const fuelBefore = fuelAt60();
    actions().answerQuestion("annualMiles", 24000);
    expect(state().explore.confirmedProfile.annualMiles).toBe(24000);
    expect(state().explore.confirmedProfile.provenance.annualMiles).toBe("user");
    expect(fuelAt60()).toBeCloseTo(fuelBefore * 2, 5);
  });

  it("rejects unusable answers without changing anything", async () => {
    await enterWorkspace();
    const profile = state().explore.confirmedProfile;
    actions().answerQuestion("annualMiles", -5);
    actions().answerQuestion("householdSize", 0);
    actions().answerQuestion("cargoNeed", "enormous");
    expect(state().explore.confirmedProfile).toBe(profile);
    expect(state().error).toBeTruthy();
  });

  it("mileage and finance answers update the twin and keep their sources", async () => {
    await enterWorkspace();
    actions().answerQuestion("mileage", 61000);
    expect(state().twin!.mileage).toBe(61000);
    expect(state().explore.confirmedProfile.provenance.mileage).toBe("user");
    actions().answerQuestion("financePayment", 380);
    expect(state().twin!.finance.monthlyPayment).toBe(380);
    expect(state().twin!.finance.provenance.monthlyPayment).toBe("user");
    actions().answerQuestion("financeType", "Paid off");
    expect(state().explore.confirmedProfile.financeType).toBe("paid_off");
  });

  it("rider chips set household and children, labeling guessed counts as estimates", async () => {
    await actions().startFromSample(CAMRY);
    actions().answerRiders("partner");
    expect(state().explore.confirmedProfile).toMatchObject({ householdSize: 2, children: 0 });
    expect(state().explore.confirmedProfile.provenance.householdSize).toBe("user");

    actions().answerRiders("kids");
    expect(state().explore.confirmedProfile.children).toBe(1);
    expect(state().explore.confirmedProfile.provenance.children).toBe("estimated");
  });

  it("tradeoff picks produce weights that sum to 1", async () => {
    await enterWorkspace();
    actions().pickTradeoff({ pairId: "cost_vs_cargo", choice: "A" });
    actions().pickTradeoff({ pairId: "longevity_vs_fuel", choice: "B" });
    const w = state().explore.confirmedProfile.priorities;
    expect(Object.values(w).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(w.cost).toBeGreaterThan(w.comfort);
    expect(state().explore.confirmedProfile.provenance.priorities).toBe("user");

    // re-picking the same pair replaces it
    actions().pickTradeoff({ pairId: "cost_vs_cargo", choice: "B" });
    expect(state().tradeoffPicks).toHaveLength(2);
  });
});

describe("replace comparison", () => {
  it("builds keep vs replace, starts the morph, and finishes it on callback", async () => {
    await enterWorkspace();
    await actions().openReplaceComparison();

    expect(state().replacementVehicle?.id).toBe(RAV4);
    const { keepId, replaceId } = state().comparison!;
    expect(keepId).toBe(BASE_ID);
    expect(state().explore.scenarios.map((s) => s.id)).toContain(replaceId);
    const carAt = (m: number) => state().results[replaceId].points.find((p) => p.month === m)!.vehicleId;
    expect(carAt(11)).toBe(CAMRY);
    expect(carAt(12)).toBe(RAV4);
    expect(state().evaluation?.scenarioIds).toEqual([keepId, replaceId]);
    expect(state().activeScenarioId).toBe(replaceId);

    // morph in flight: still showing the Camry, heading to the RAV4
    expect(state().stage.phase).toBe("transition");
    expect(state().stage.transitionTo?.id).toBe(RAV4);
    expect(state().activeVehicleId).toBe(CAMRY);

    actions().onTransitionComplete();
    expect(state().stage.phase).toBe("interactive");
    expect(state().stage.transitionTo).toBeNull();
    expect(state().activeVehicleId).toBe(RAV4);
  });

  it("clicking the keep branch morphs back to the Camry", async () => {
    await enterWorkspace();
    await actions().openReplaceComparison();
    actions().onTransitionComplete();

    actions().setActiveScenario(BASE_ID);
    expect(state().stage.phase).toBe("transition");
    expect(state().stage.transitionTo?.id).toBe(CAMRY);
    actions().onTransitionComplete();
    expect(state().activeVehicleId).toBe(CAMRY);
  });

  it("opening it twice does not duplicate the replace branch", async () => {
    await enterWorkspace();
    await actions().openReplaceComparison();
    actions().onTransitionComplete();
    await actions().openReplaceComparison();
    expect(state().explore.scenarios).toHaveLength(2);
    expect(state().comparison!.keepId).toBe(BASE_ID);
  });

  it("an assumption edit reaches every scenario and re-evaluates", async () => {
    await enterWorkspace();
    await actions().openReplaceComparison();
    actions().runBreakEven("annualMiles");
    expect(state().breakEven).not.toBeNull();

    const evalBefore = state().evaluation;
    actions().setAssumption("fuelPrice", 5);
    expect(state().explore.scenarios.every((s) => s.assumptions.fuelPrice === 5)).toBe(true);
    expect(state().evaluation).not.toBe(evalBefore);
    expect(state().breakEven).toBeNull(); // stale after an edit
  });
});

describe("break-even", () => {
  it("needs a comparison first", async () => {
    await enterWorkspace();
    actions().runBreakEven("annualMiles");
    expect(state().breakEven).toBeNull();
    expect(state().error).toMatch(/comparison/);
  });

  it("stores the result, including a plain not-found", async () => {
    await enterWorkspace();
    await actions().openReplaceComparison();
    actions().runBreakEven("fuelPricePerGal");
    expect(state().breakEven).toMatchObject({ found: false, parameter: "fuelPricePerGal" });
  });
});

describe("events", () => {
  it("moving an event replaces the scenario, never mutates it", async () => {
    await enterWorkspace();
    interpretReturning([denver]);
    await actions().submitDump("dump");
    actions().confirmDrafts(["e-denver"]);
    const child = state().explore.scenarios[1];

    actions().moveEvent(child.id, "e-denver", 30);
    const moved = state().explore.scenarios[1];
    expect(moved).not.toBe(child);
    expect(child.events[0].month).toBe(12);
    expect(moved.events[0].month).toBe(30);
  });
});

describe("stage and ui", () => {
  it("skip, replay and camera reset bump their signals", async () => {
    await enterWorkspace();
    const s0 = state().stage;
    actions().skip();
    actions().resetCamera();
    actions().replayReveal();
    expect(state().stage.skipSignal).toBe(s0.skipSignal + 1);
    expect(state().stage.resetCameraSignal).toBe(s0.resetCameraSignal + 1);
    expect(state().stage.replaySignal).toBe(s0.replaySignal + 1);
    expect(state().phase).toBe("reveal");
    expect(state().stage.phase).toBe("reveal");

    // replaying must not rebuild the baseline
    const base = state().explore.scenarios[0];
    actions().onRevealStage("done");
    expect(state().explore.scenarios[0]).toBe(base);
    expect(state().phase).toBe("workspace");
  });

  it("start over returns to landing but keeps the performance preference", async () => {
    await enterWorkspace();
    actions().setLowPerformance(true);
    actions().setView("future");
    actions().setDetailsOpen(true);
    actions().resetAll();
    expect(state().phase).toBe("landing");
    expect(state().twin).toBeNull();
    expect(state().ui.lowPerformance).toBe(true);
    // the page and the sheet are never carried over: every session starts quiet
    expect(state().ui).toMatchObject({ view: "car", detailsOpen: false });
  });

  it("starts on the car page with the details sheet closed", () => {
    expect(state().ui).toMatchObject({ view: "car", detailsOpen: false });
  });

  it("switching the sample car restarts cleanly from the new car", async () => {
    await enterWorkspace(CAMRY);
    actions().setActiveMonth(30);
    await actions().startFromSample(RAV4);
    expect(state().twin?.vehicle.id).toBe(RAV4);
    expect(state().phase).toBe("reveal");
    expect(state().activeMonth).toBe(0);
    expect(state().explore.scenarios).toEqual([]);
  });
});

describe("pages", () => {
  it("the future page opens on the five year picture when the playhead is at now", async () => {
    await enterWorkspace();
    expect(state().activeMonth).toBe(0);
    actions().setView("future");
    expect(state().ui.view).toBe("future");
    expect(state().activeMonth).toBe(60);
  });

  it("the future page keeps a month you already chose", async () => {
    await enterWorkspace();
    actions().setActiveMonth(18);
    actions().setView("future");
    expect(state().activeMonth).toBe(18);
    actions().setView("car");
    expect(state().ui.view).toBe("car");
    expect(state().activeMonth).toBe(18);
  });

  it("there is no future page before the reveal ends", async () => {
    await actions().startFromSample(CAMRY);
    actions().setView("future");
    expect(state().ui.view).toBe("car");
    expect(state().activeMonth).toBe(0);
  });

  it("switching pages closes the details sheet", async () => {
    await enterWorkspace();
    actions().setDetailsOpen(true);
    actions().setView("future");
    expect(state().ui.detailsOpen).toBe(false);
  });

  it("finishing the reveal always lands on the car page", async () => {
    await enterWorkspace();
    actions().setView("future");
    actions().replayReveal();
    actions().onRevealStage("done");
    expect(state().ui.view).toBe("car");
  });

  it("picking another sample car goes back to the car page", async () => {
    await enterWorkspace();
    actions().setView("future");
    await actions().startFromSample(RAV4);
    expect(state().ui).toMatchObject({ view: "car", detailsOpen: false });
  });
});

describe("future page options", () => {
  it("start off: the road is minimal until you ask for more", () => {
    expect(state().ui).toMatchObject({ futureDetails: false, futureCompare: false });
  });

  it("details and other futures are independent switches", async () => {
    await enterWorkspace();
    actions().setFutureDetails(true);
    expect(state().ui).toMatchObject({ futureDetails: true, futureCompare: false });
    actions().setFutureCompare(true);
    actions().setFutureDetails(false);
    expect(state().ui).toMatchObject({ futureDetails: false, futureCompare: true });
  });

  it("asking to compare with another car turns the other futures on", async () => {
    await enterWorkspace();
    expect(state().ui.futureCompare).toBe(false);
    await actions().openReplaceComparison();
    expect(state().ui.futureCompare).toBe(true);
  });

  it("every new session starts minimal again", async () => {
    await enterWorkspace();
    actions().setFutureDetails(true);
    actions().setFutureCompare(true);
    await actions().startFromSample(RAV4);
    expect(state().ui).toMatchObject({ futureDetails: false, futureCompare: false });
    actions().setFutureDetails(true);
    actions().resetAll();
    expect(state().ui.futureDetails).toBe(false);
  });

  it("gives the road what it needs to re-run a future, as arguments", async () => {
    await enterWorkspace();
    const inputs = simulationInputs(state());
    expect(inputs?.twin.vehicle.id).toBe(CAMRY);
    expect(Object.keys(inputs!.ctx.specs)).toEqual([CAMRY]);
    await actions().openReplaceComparison();
    expect(Object.keys(simulationInputs(state())!.ctx.specs).sort()).toEqual([CAMRY, RAV4].sort());
    // it uses the confirmed profile, not the original twin's
    actions().answerQuestion("annualMiles", 24000);
    expect(simulationInputs(state())!.twin.driver.annualMiles).toBe(24000);
  });

  it("has no inputs before there is a car", () => {
    expect(simulationInputs(state())).toBeNull();
  });
});

describe("demo story A through the store (numbers pinned by sim/DEMO.md)", () => {
  // The events Paarth's extraction gives the demo sentence, confirmed in the UI.
  const storyEvent = (id: string, type: LifeEvent["type"], month: number, payload: LifeEvent["payload"]): LifeEvent => ({
    id,
    type,
    month,
    payload,
    source: "ai",
    assumptions: [],
    certainty: "clear",
    status: "proposed",
  });
  const storyA = [
    storyEvent("a-move", "relocation", 12, { location: "Denver" }),
    storyEvent("a-miles", "mileage_change", 0, { annualMiles: 20000 }),
    storyEvent("a-kid", "family_change", 32, { children: 2 }),
  ];

  async function toComparison() {
    await enterWorkspace();
    interpretReturning(storyA);
    await actions().submitDump("demo");
    actions().confirmDrafts(storyA.map((e) => e.id));
    await actions().openReplaceComparison();
  }

  it("uses Alex as given: no trade-off picks, equal priorities, low cargo, no car seats", async () => {
    await toComparison();
    const profile = state().explore.confirmedProfile;
    expect(state().tradeoffPicks).toEqual([]);
    expect(profile.priorities).toEqual({ cost: 0.2, family: 0.2, longevity: 0.2, fuel: 0.2, comfort: 0.2 });
    expect(profile).toMatchObject({ cargoNeed: "low", carSeats: 0, householdSize: 3, children: 1 });
  });

  it("step 4: a close call, with keeping the cheaper of the two", async () => {
    await toComparison();
    const { evaluation, comparison, results } = state();
    expect(evaluation?.preferredScenarioId).toBe("inconclusive");
    expect(evaluation?.rationale[0]).toMatch(/^Inconclusive: /);
    expect(results[comparison!.keepId].summary.netCost).toBeLessThan(results[comparison!.replaceId].summary.netCost);
  });

  it("step 5: keeping wins below about 14,434 mi/yr, and the flip reproduces on both sides", async () => {
    await toComparison();
    expect(state().breakEven).toBeNull(); // nothing is computed until it is asked for
    actions().runBreakEven("annualMiles");
    const { breakEven, breakEvenCheck, comparison } = state();
    expect(breakEven).toMatchObject({ found: true, parameter: "annualMiles", direction: "below", currentValue: 20000 });
    if (!breakEven?.found) throw new Error("expected a threshold");
    expect(breakEven.threshold).toBeCloseTo(14434, 0);
    expect(breakEvenCheck?.below.preferredScenarioId).toBe(comparison!.keepId);
    expect(breakEvenCheck?.above.preferredScenarioId).not.toBe(comparison!.keepId);
    expect(breakEvenCheck!.below.value).toBeLessThan(breakEven.threshold);
    expect(breakEvenCheck!.above.value).toBeGreaterThan(breakEven.threshold);
  });

  it("step 6: the next step names the threshold, and the robustness count is a count", async () => {
    await toComparison();
    actions().runBreakEven("annualMiles");
    const { evaluation, nextActionFactors } = state();
    expect(evaluation?.nextAction.label).toBe("Reevaluate if your driving drops below 14,434 mi/yr");
    expect(nextActionFactors).toEqual(["break_even", "annualMiles"]);
    expect(evaluation?.rationale).toContain("Held in 9 of 9 tested cases");
    expect(JSON.stringify(evaluation)).not.toMatch(/\d\s?%|probab|confiden/i);
  });

  it("changing an input clears the old threshold instead of showing a stale one", async () => {
    await toComparison();
    actions().runBreakEven("annualMiles");
    expect(state().breakEven?.found).toBe(true);
    actions().answerQuestion("annualMiles", 16000);
    expect(state().breakEven).toBeNull();
    expect(state().breakEvenCheck).toBeNull();
    expect(state().evaluation?.nextAction.label).not.toMatch(/14,434/);
  });

  it("the road, the profile and the other futures stay as confirmed (exploring is not changing)", async () => {
    await enterWorkspace();
    const profileBefore = structuredClone(state().explore.confirmedProfile);
    interpretReturning(storyA);
    await actions().submitDump("demo");
    actions().confirmDrafts(storyA.map((e) => e.id));
    await actions().openReplaceComparison();
    actions().runBreakEven("annualMiles");
    expect(state().explore.confirmedProfile).toEqual(profileBefore);
    expect(state().explore.scenarios.find((s) => s.id === BASE_ID)?.events).toEqual([]);
  });
});

describe("questions typed in the command bar (no AI: plain rules route them)", () => {
  it("'would a RAV4 make more sense?' opens keep vs replace on the future page and changes nothing", async () => {
    await enterWorkspace();
    const profileBefore = structuredClone(state().explore.confirmedProfile);
    const outcome = await actions().submitDump("Would switching to a RAV4 Hybrid make more sense?");
    expect(outcome).toMatchObject({ kind: "compared" });
    expect(state().comparison).not.toBeNull();
    expect(state().evaluation).not.toBeNull();
    expect(state().ui.view).toBe("future");
    expect(state().explore.draftChanges).toEqual([]); // a question proposes no change
    expect(state().explore.confirmedProfile).toEqual(profileBefore);
  });

  it("'what would have to change…' runs the break-even, opening the comparison first if there is none", async () => {
    await enterWorkspace();
    expect(state().comparison).toBeNull();
    const outcome = await actions().submitDump("What would have to change for keeping the Camry to be the better option?");
    expect(outcome).toMatchObject({ kind: "break_even" });
    expect(state().comparison).not.toBeNull();
    expect(state().breakEven).toMatchObject({ parameter: "annualMiles" });
    expect(state().ui.view).toBe("future");
  });

  it("asking about fuel price tests fuel price, not miles", async () => {
    expect(breakEvenParameterFor("What fuel price would make keeping my Camry better?")).toBe("fuelPricePerGal");
    expect(breakEvenParameterFor("what if gas goes up, what would have to change?")).toBe("fuelPricePerGal");
    expect(breakEvenParameterFor("What would have to change for keeping the Camry?")).toBe("annualMiles");
    await enterWorkspace();
    await actions().submitDump("What would have to change about the fuel price for keeping the Camry to be the better option?");
    expect(state().breakEven?.parameter).toBe("fuelPricePerGal");
  });

  it("a question about some other car is not answered with the RAV4", async () => {
    await enterWorkspace();
    const outcome = await actions().submitDump("Would a Corolla make more sense?");
    expect(outcome.kind).toBe("nothing");
    expect(outcome).toMatchObject({ message: expect.stringMatching(/RAV4/) });
    expect(state().comparison).toBeNull();
    expect(state().ui.view).toBe("car");
  });

  it("asking again does not open a second comparison", async () => {
    await enterWorkspace();
    await actions().submitDump("Would a RAV4 make more sense?");
    const count = state().explore.scenarios.length;
    await actions().submitDump("Should I replace my Camry?");
    expect(state().explore.scenarios).toHaveLength(count);
  });
});

describe("the explanation", () => {
  const words = { text: "Keeping and replacing are close. Nothing here is a quote.", usedFallback: true };

  it("is asked for once there is an evaluation, and shown with how it was written", async () => {
    const explain = vi.spyOn(ai, "explain").mockResolvedValue(words);
    await enterWorkspace();
    expect(state().explanation).toBeNull();
    await actions().openReplaceComparison();
    await vi.waitFor(() => expect(state().explanation).toEqual(words));
    // it was given the engine's evaluation and both projections, nothing else
    const [evaluation, results] = explain.mock.calls[0];
    expect(evaluation).toBe(state().evaluation);
    expect(results.map((r) => r.scenarioId)).toEqual(evaluation.scenarioIds);
  });

  it("is cleared the moment the numbers change, so it never describes old ones", async () => {
    vi.spyOn(ai, "explain").mockResolvedValue(words);
    await enterWorkspace();
    await actions().openReplaceComparison();
    await vi.waitFor(() => expect(state().explanation).not.toBeNull());
    vi.spyOn(ai, "explain").mockReturnValue(new Promise(() => {})); // never answers
    actions().setAssumption("insurancePerMonth", 250);
    expect(state().explanation).toBeNull();
  });

  it("drops a late answer about an older comparison", async () => {
    let answerFirst!: (v: typeof words) => void;
    vi.spyOn(ai, "explain")
      .mockImplementationOnce(() => new Promise((resolve) => (answerFirst = resolve)))
      .mockResolvedValue({ text: "about the new numbers", usedFallback: true });
    await enterWorkspace();
    await actions().openReplaceComparison();
    actions().setAssumption("insurancePerMonth", 250); // new numbers, new request
    await vi.waitFor(() => expect(state().explanation?.text).toBe("about the new numbers"));
    answerFirst({ text: "about the old numbers", usedFallback: false });
    await Promise.resolve();
    await Promise.resolve();
    expect(state().explanation?.text).toBe("about the new numbers");
  });

  it("failing to get words changes nothing else: no error, the verdict stays", async () => {
    vi.spyOn(ai, "explain").mockRejectedValue(new Error("offline"));
    await enterWorkspace();
    await actions().openReplaceComparison();
    await Promise.resolve();
    await Promise.resolve();
    expect(state().explanation).toBeNull();
    expect(state().error).toBeNull();
    expect(state().evaluation).not.toBeNull();
  });
});

describe("a car the stage cannot show never leaves the app waiting", () => {
  const broken = (vehicleId: string) => ({ vehicleId, ready: false, error: "No model asset is configured." });

  it("a model that fails during the reveal skips the reveal and opens the workspace", async () => {
    await actions().startFromSample(CAMRY);
    expect(state().phase).toBe("reveal");
    actions().onModelStatus(broken(CAMRY));
    expect(state().phase).toBe("workspace");
    expect(state().stage.phase).toBe("interactive");
    expect(state().results[BASE_ID]).toBeDefined(); // the numbers do not need the 3D model
    expect(state().modelStatus[CAMRY]).toEqual({ ready: false, error: "No model asset is configured." });
  });

  it("a target model that fails finishes the morph, so the app moves on to the new car", async () => {
    await enterWorkspace();
    await actions().openReplaceComparison();
    expect(state().stage.phase).toBe("transition");
    actions().onModelStatus(broken(RAV4));
    expect(state().stage.phase).toBe("interactive");
    expect(state().activeVehicleId).toBe(RAV4);
  });

  it("loading and ready reports, and errors about some other car, change nothing", async () => {
    await actions().startFromSample(CAMRY);
    actions().onModelStatus({ vehicleId: CAMRY, ready: false });
    actions().onModelStatus({ vehicleId: CAMRY, ready: true });
    actions().onModelStatus(broken(RAV4));
    expect(state().phase).toBe("reveal");
    expect(state().stage.phase).toBe("reveal");
  });

  it("an error with nothing running does nothing", async () => {
    actions().onModelStatus(broken(CAMRY));
    expect(state().phase).toBe("landing");
    expect(state().twin).toBeNull();
  });
});

describe("an answer that arrives too late is dropped (stale guards)", () => {
  /** An interpret call that stays pending until the test lets it answer. */
  function pendingInterpret() {
    let answer!: (r: Awaited<ReturnType<typeof ai.interpret>>) => void;
    const spy = vi.spyOn(ai, "interpret").mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    return { spy, answer: (r: Awaited<ReturnType<typeof ai.interpret>>) => answer(r) };
  }
  const aiAnswer = (proposals: LifeEvent[]) => ({ aiAvailable: true as const, intent: "CREATE_SCENARIO" as const, proposals, profilePatches: [] });

  it("a reset while it was thinking: nothing is added to the new session", async () => {
    await enterWorkspace();
    const pending = pendingInterpret();
    const asked = actions().submitDump("moving to Denver next year");
    actions().resetAll();
    pending.answer(aiAnswer([denver]));
    expect(await asked).toEqual({ kind: "stale" });
    expect(state().explore.draftChanges).toEqual([]);
    expect(state().twin).toBeNull();
    expect(state().ui.busy).toBe("idle");
  });

  it("a different car while it was thinking: the old answer does not land on the new car", async () => {
    await enterWorkspace(CAMRY);
    const pending = pendingInterpret();
    const asked = actions().submitDump("moving to Denver next year");
    await actions().startFromSample(RAV4);
    actions().onRevealStage("done");
    pending.answer(aiAnswer([denver]));
    expect(await asked).toEqual({ kind: "stale" });
    expect(state().explore.draftChanges).toEqual([]);
    expect(state().twin?.vehicle.id).toBe(RAV4);
  });

  it("a different future while it was thinking: the answer was about the old one, so it is dropped", async () => {
    await enterWorkspace();
    interpretReturning([denver]);
    await actions().submitDump("first");
    actions().confirmDrafts(["e-denver"]); // now there is a second future, and it is the active one
    const [base] = state().explore.scenarios;
    const pending = pendingInterpret();
    const asked = actions().submitDump("something else");
    actions().setActiveScenario(base.id);
    pending.answer(aiAnswer([miles20k]));
    expect(await asked).toEqual({ kind: "stale" });
    expect(state().explore.draftChanges).toEqual([]);
    expect(state().ui.busy).toBe("idle"); // nothing newer owns the busy flag, so it is released
  });

  it("a newer submission wins: the older answer is dropped, the newer one is kept", async () => {
    await enterWorkspace();
    const answers: Array<(r: Awaited<ReturnType<typeof ai.interpret>>) => void> = [];
    vi.spyOn(ai, "interpret").mockImplementation(() => new Promise((resolve) => answers.push(resolve)));
    const first = actions().submitDump("first sentence");
    const second = actions().submitDump("second sentence");
    answers[1](aiAnswer([miles20k]));
    expect(await second).toMatchObject({ kind: "proposed" });
    answers[0](aiAnswer([denver]));
    expect(await first).toEqual({ kind: "stale" });
    expect(state().explore.draftChanges.map((d) => d.id)).toEqual(["e-miles"]);
  });

  it("an answer in the same session, car and future is used as normal", async () => {
    await enterWorkspace();
    const pending = pendingInterpret();
    const asked = actions().submitDump("moving to Denver next year");
    pending.answer(aiAnswer([denver]));
    expect(await asked).toMatchObject({ kind: "proposed" });
    expect(state().explore.draftChanges.map((d) => d.id)).toEqual(["e-denver"]);
  });

  it("a late explanation never replaces the explanation of the numbers now on screen, even after a reset", async () => {
    let late!: (v: { text: string; usedFallback: boolean }) => void;
    vi.spyOn(ai, "explain").mockImplementation(() => new Promise((resolve) => (late = resolve)));
    await enterWorkspace();
    await actions().openReplaceComparison();
    actions().resetAll();
    late({ text: "about numbers that are gone", usedFallback: false });
    await Promise.resolve();
    await Promise.resolve();
    expect(state().explanation).toBeNull();
    expect(state().evaluation).toBeNull();
  });
});

describe("when the AI is not available, the sentence is kept and can be retried or entered by hand", () => {
  const unavailable = () => vi.spyOn(ai, "interpret").mockResolvedValue({ aiAvailable: false });

  it("remembers the sentence, what the plain rules staged, and their note", async () => {
    unavailable();
    await enterWorkspace();
    const outcome = await actions().submitDump("moving to Denver next year");
    expect(outcome).toMatchObject({ kind: "proposed", offline: true });
    const last = state().lastDump!;
    expect(last.text).toBe("moving to Denver next year");
    expect(last.draftIds).toEqual(state().explore.draftChanges.map((d) => d.id));
    expect(state().ui.aiAvailable).toBe(false);
  });

  it("keeps the reader's note when it found nothing, so the person knows why", async () => {
    unavailable();
    await enterWorkspace();
    const outcome = await actions().submitDump("I'm not pregnant.");
    expect(outcome).toMatchObject({ kind: "nothing", offline: true });
    expect(state().explore.draftChanges).toEqual([]);
    expect(state().lastDump).toMatchObject({ text: "I'm not pregnant.", note: expect.stringMatching(/negatives|confirm/i), draftIds: [] });
  });

  it("a retry asks the AI again, replaces the offline drafts, and never stacks a second copy", async () => {
    const spy = unavailable();
    await enterWorkspace();
    await actions().submitDump("moving to Denver next year");
    expect(state().explore.draftChanges).toHaveLength(1);

    spy.mockResolvedValue({ aiAvailable: true, intent: "CREATE_SCENARIO", proposals: [denver], profilePatches: [] });
    const outcome = await actions().retryDump();
    expect(outcome).toMatchObject({ kind: "proposed" });
    expect(outcome).not.toHaveProperty("offline");
    expect(spy).toHaveBeenCalledTimes(2);
    expect(state().explore.draftChanges.map((d) => d.id)).toEqual(["e-denver"]); // the offline draft is gone, not duplicated
    expect(state().lastDump).toBeNull();
    expect(state().ui.aiAvailable).toBe(true);
  });

  it("a retry that is still unavailable asks once, not in a loop", async () => {
    const spy = unavailable();
    await enterWorkspace();
    await actions().submitDump("moving to Denver next year");
    await actions().retryDump();
    await actions().retryDump();
    expect(spy).toHaveBeenCalledTimes(3); // one call per request from the person, never automatic
    expect(state().explore.draftChanges).toHaveLength(1); // still just one draft
  });

  it("with nothing to retry, retry does nothing", async () => {
    const spy = vi.spyOn(ai, "interpret");
    await enterWorkspace();
    expect(await actions().retryDump()).toEqual({ kind: "nothing" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("the notice goes once the drafts it staged are confirmed, and goes when discarded too", async () => {
    unavailable();
    await enterWorkspace();
    await actions().submitDump("moving to Denver next year");
    actions().confirmDrafts(state().explore.draftChanges.map((d) => d.id));
    expect(state().lastDump).toBeNull();

    await actions().submitDump("moving to Boise in 2 years");
    state().explore.draftChanges.forEach((d) => actions().rejectDraft(d.id));
    expect(state().lastDump).toBeNull();
  });

  it("a note with no drafts stays until dismissed", async () => {
    unavailable();
    await enterWorkspace();
    await actions().submitDump("hi");
    expect(state().lastDump).not.toBeNull();
    actions().dismissDumpNotice();
    expect(state().lastDump).toBeNull();
  });

  it("when the AI is available, nothing offline is recorded", async () => {
    interpretReturning([denver]);
    await enterWorkspace();
    await actions().submitDump("moving to Denver next year");
    expect(state().lastDump).toBeNull();
    expect(state().ui.aiAvailable).toBe(true);
  });

  it("questions are answered by the plain rules, and the typed text is not kept for them", async () => {
    unavailable();
    await enterWorkspace();
    const outcome = await actions().submitDump("Would switching to a RAV4 Hybrid make more sense?");
    expect(outcome).toMatchObject({ kind: "compared", offline: true });
    expect(state().comparison).not.toBeNull();
  });
});

describe("purchase and insurance terms: applied only when confirmed, to every future, nothing edited in place", () => {
  async function toComparison() {
    await enterWorkspace();
    interpretReturning([denver]);
    await actions().submitDump("dump");
    actions().confirmDrafts(["e-denver"]);
    await actions().openReplaceComparison();
    return state().comparison!;
  }
  const netAt60 = (id: string) => state().results[id].points.find((p) => p.month === 60)!.netEconomicCost;

  it("applies the terms to every future and recomputes the numbers", async () => {
    const { keepId, replaceId } = await toComparison();
    const before = { keep: netAt60(keepId), replace: netAt60(replaceId) };
    actions().applyScenarioTerms({ insurancePerMonth: 400, replacementPrice: 45000 });
    for (const sc of state().explore.scenarios) expect(sc.assumptions).toMatchObject({ insurancePerMonth: 400, replacementPrice: 45000 });
    expect(netAt60(keepId)).toBeGreaterThan(before.keep); // more insurance costs more
    expect(netAt60(replaceId)).toBeGreaterThan(before.replace); // more insurance and a dearer car
  });

  it("never edits a future in place, never touches the profile or the events, and keeps the history of what was said", async () => {
    await toComparison();
    const old = state().explore.scenarios;
    const profile = structuredClone(state().explore.confirmedProfile);
    const events = old.map((sc) => structuredClone(sc.events));
    actions().applyScenarioTerms({ insurancePerMonth: 400 });
    const next = state().explore.scenarios;
    next.forEach((sc, i) => {
      expect(sc).not.toBe(old[i]); // a new future, not the old one edited
      expect(old[i].assumptions).not.toHaveProperty("insurancePerMonth"); // the old one is exactly as it was
      expect(sc.events).toEqual(events[i]);
    });
    expect(state().explore.confirmedProfile).toEqual(profile);
  });

  it("clears the old verdict inputs: a stale break-even is gone after the terms change", async () => {
    await toComparison();
    actions().runBreakEven("annualMiles");
    expect(state().breakEven).not.toBeNull();
    actions().applyScenarioTerms({ insurancePerMonth: 400 });
    expect(state().breakEven).toBeNull();
    expect(state().evaluation).not.toBeNull(); // re-evaluated on the new numbers
  });

  it("refuses a key that is not a term, or a number that is not usable, and changes nothing", async () => {
    await toComparison();
    const before = state().explore.scenarios;
    actions().applyScenarioTerms({ annualMilesOverride: 9000 });
    expect(state().explore.scenarios).toBe(before);
    expect(state().error).toMatch(/nothing was changed/i);
    actions().clearError();
    actions().applyScenarioTerms({ insurancePerMonth: Number.NaN });
    expect(state().explore.scenarios).toBe(before);
    actions().applyScenarioTerms({});
    expect(state().explore.scenarios).toBe(before);
  });

  it("back to estimates removes only the terms, and leaves every other assumption alone", async () => {
    const { keepId } = await toComparison();
    const original = netAt60(keepId);
    actions().setAssumption("startYear", 2027);
    const withYear = netAt60(keepId);
    actions().applyScenarioTerms({ insurancePerMonth: 400, newLoanApr: 0.09 });
    actions().resetScenarioTerms();
    for (const sc of state().explore.scenarios) {
      expect(sc.assumptions).not.toHaveProperty("insurancePerMonth");
      expect(sc.assumptions).not.toHaveProperty("newLoanApr");
      expect(sc.assumptions).toMatchObject({ startYear: 2027 });
    }
    expect(netAt60(keepId)).toBeCloseTo(withYear, 6);
    expect(withYear).not.toBeCloseTo(original, 6); // sanity: the year did something, so it is a real check
  });

  it("the terms are saved with the session and survive a reload", async () => {
    await toComparison();
    actions().applyScenarioTerms({ insurancePerMonth: 400 });
    const saved = state().explore.scenarios.map((sc) => sc.assumptions.insurancePerMonth);
    expect(saved.every((v) => v === 400)).toBe(true);
  });
});
