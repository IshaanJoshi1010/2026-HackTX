import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LifeEvent } from "@/contracts";
import { ai, data } from "@/ui/mocks";
import { BASE_ID, resetForkStoreForTests, simulationInputs, useForkStore } from "./useForkStore";

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
    expect(result.points).toHaveLength(61);
    expect(result.points[0].mileage).toBe(state().twin!.mileage);
    expect(result.points[60].mileage).toBeGreaterThan(result.points[0].mileage);
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
    vi.spyOn(data, "buildTwin").mockResolvedValue({ ok: false, error: "twin broke" });
    await actions().startFromSample(CAMRY);
    expect(state().twin).toBeNull();
    expect(state().error).toBe("twin broke");
    expect(state().ui.busy).toBe("idle");
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
  it("with the mock AI (unavailable) it switches to manual forms and proposes nothing", async () => {
    await enterWorkspace();
    await actions().submitDump("I'm moving to Denver");
    expect(state().ui.aiAvailable).toBe(false);
    expect(state().explore.draftChanges).toEqual([]);
    expect(state().ui.busy).toBe("idle");
  });

  it("a throwing interpret falls back to manual forms and changes nothing", async () => {
    await enterWorkspace();
    vi.spyOn(ai, "interpret").mockRejectedValue(new Error("gemini down"));
    const before = state().explore.scenarios;
    await actions().submitDump("anything");
    expect(state().ui.aiAvailable).toBe(false);
    expect(state().error).toBe("gemini down");
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
    expect(state().results[child.id].points).toHaveLength(61);
    expect(state().activeScenarioId).toBe(child.id);
    expect(state().explore.draftChanges).toEqual([]);

    // parent untouched, profile untouched (exploring is not changing)
    expect(state().explore.scenarios[0]).toBe(base);
    expect(state().results[BASE_ID]).toBe(baseResult);
    expect(state().explore.confirmedProfile).toEqual(profileBefore);
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
  it("shows at most one question and never repeats an answered field", async () => {
    await enterWorkspace();
    interpretReturning([denver]);
    await actions().submitDump("dump");
    actions().confirmDrafts(["e-denver"]);
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
    const fuelBefore = state().results[BASE_ID].points[60].fuelSpend;
    actions().answerQuestion("annualMiles", 24000);
    expect(state().explore.confirmedProfile.annualMiles).toBe(24000);
    expect(state().explore.confirmedProfile.provenance.annualMiles).toBe("user");
    expect(state().results[BASE_ID].points[60].fuelSpend).toBeCloseTo(fuelBefore * 2, 5);
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
    expect(state().results[replaceId].points[11].vehicleId).toBe(CAMRY);
    expect(state().results[replaceId].points[12].vehicleId).toBe(RAV4);
    expect(state().evaluation?.preferredScenarioId).toBe("inconclusive");
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
