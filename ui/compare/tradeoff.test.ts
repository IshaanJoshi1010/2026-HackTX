import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DecisionEvaluation, LifeEvent } from "@/contracts";
import type { ScenarioScore } from "@/decision";
import { ai, data } from "@/ui/mocks";
import { resetForkStoreForTests, useForkStore } from "@/ui/store/useForkStore";
import { buildTradeoff, type FactorKey, type TradeoffInput } from "./tradeoff";

type Weighted = Record<FactorKey, number>;
const PRIORITIES = { cost: 0.2, family: 0.2, longevity: 0.2, fuel: 0.2, comfort: 0.2 };

function score(scenarioId: string, name: string, contributions: Weighted): ScenarioScore {
  return {
    scenarioId,
    name,
    metrics: { netCost: 0, fuel: 0, longevity: 0, family: 0, comfort: 0 },
    normalized: { cost: 0, family: 0, longevity: 0, fuel: 0, comfort: 0 },
    contributions,
    total: contributions.cost + contributions.fuel + contributions.longevity + contributions.family + contributions.comfort,
    violations: [],
    eligible: true,
  };
}

function evaluation(preferredScenarioId: string, hardConstraints: string[] = []): DecisionEvaluation {
  return {
    scenarioIds: ["keep", "swap"],
    hardConstraints,
    preferredScenarioId,
    rationale: [],
    sensitivity: [],
    nextAction: { label: "Keep your car", detail: "Nothing to do yet." },
  };
}

function input(keep: Weighted, swap: Weighted, preferred: string, hardConstraints: string[] = []): TradeoffInput {
  return {
    scores: [score("keep", "Keep the Camry", keep), score("swap", "Replace with RAV4", swap)],
    evaluation: evaluation(preferred, hardConstraints),
    keepId: "keep",
    replaceId: "swap",
    keepName: "the Camry",
    switchName: "the RAV4",
    priorities: PRIORITIES,
  };
}

/** The model name RAV4 has a digit in it; everything else in a sentence must be free of figures and build-time words. */
const FIGURES = /[\d$%\u2014\u2013]|\bdemo\b|\bdata\b/i;
const withoutModelName = (sentence: string) => sentence.replaceAll("RAV4", "RAV");

const w = (cost: number, fuel: number, longevity: number, family: number, comfort: number): Weighted => ({ cost, fuel, longevity, family, comfort });

// Hand-computed. Keep: 0.20 + 0.05 + 0.05 + 0.15 + 0.05 = 0.50. Swap: 0.12 + 0.12 + 0.12 + 0.06 + 0.05 = 0.47.
// Gaps (keep minus swap): cost +0.08, fuel -0.07, longevity -0.07, family +0.09, comfort 0.00. The totals are 0.03 apart,
// inside the 0.05 margin, so the engine would call it a close call.
const CLOSE_KEEP = w(0.2, 0.05, 0.05, 0.15, 0.05);
const CLOSE_SWAP = w(0.12, 0.12, 0.12, 0.06, 0.05);

describe("rows", () => {
  it("lists all five priorities in order with plain labels, and says who leads each one", () => {
    const t = buildTradeoff(input(CLOSE_KEEP, CLOSE_SWAP, "inconclusive"))!;
    expect(t.rows).toEqual([
      { key: "cost", label: "Cost", leader: "keep" },
      { key: "fuel", label: "Fuel use", leader: "switch" },
      { key: "longevity", label: "Life left", leader: "switch" },
      { key: "family", label: "Family fit", leader: "keep" },
      { key: "comfort", label: "Comfort", leader: "level" },
    ]);
  });

  it("calls a weighted gap under 0.005 level, in either direction, and a bigger one a lead", () => {
    const t = buildTradeoff(input(w(0.304, 0.3, 0.3, 0.3, 0.3), w(0.3, 0.304, 0.294, 0.306, 0.3), "inconclusive"))!;
    expect(t.rows.map((r) => r.leader)).toEqual([
      "level", // +0.004
      "level", // -0.004
      "keep", //  +0.006
      "switch", // -0.006
      "level", //  0
    ]);
  });

  it("reads contributions, so a priority you gave no weight is level whatever the cars do", () => {
    const t = buildTradeoff(input(w(0.3, 0, 0.1, 0.1, 0.1), w(0.1, 0, 0.1, 0.1, 0.1), "keep"))!;
    expect(t.rows.find((r) => r.key === "fuel")!.leader).toBe("level");
    expect(t.rows.find((r) => r.key === "cost")!.leader).toBe("keep");
  });
});

describe("the sentence", () => {
  it("close call: each car's lead, then why that balances out", () => {
    const t = buildTradeoff(input(CLOSE_KEEP, CLOSE_SWAP, "inconclusive"))!;
    expect(t.closeCall).toBe(true);
    expect(t.sentence).toBe(
      "Keeping the Camry is ahead on cost and family fit. The RAV4 is ahead on fuel use and life left. " +
        "Weighted by what you said matters, they balance out within Fork's margin, so neither car clearly leads.",
    );
  });

  it("decided for the other car: says it comes out ahead by more than the margin", () => {
    // Hand-computed: keep 0.25 + 0.05 + 0.05 + 0.10 + 0.05 = 0.50, swap 0.05 + 0.20 + 0.20 + 0.10 + 0.05 = 0.60.
    const t = buildTradeoff(input(w(0.25, 0.05, 0.05, 0.1, 0.05), w(0.05, 0.2, 0.2, 0.1, 0.05), "swap"))!;
    expect(t.closeCall).toBe(false);
    expect(t.rows.map((r) => r.leader)).toEqual(["keep", "switch", "switch", "level", "level"]);
    expect(t.sentence).toBe(
      "Keeping the Camry is ahead on cost. The RAV4 is ahead on fuel use and life left. " +
        "Weighted by what you said matters, those gaps don't cancel out, so the RAV4 comes out ahead by more than Fork's margin.",
    );
  });

  it("decided for keeping: names keeping, not the other car", () => {
    const t = buildTradeoff(input(w(0.4, 0.05, 0.05, 0.1, 0.05), w(0.05, 0.1, 0.1, 0.1, 0.05), "keep"))!;
    expect(t.closeCall).toBe(false);
    expect(t.sentence).toBe(
      "Keeping the Camry is ahead on cost. The RAV4 is ahead on fuel use and life left. " +
        "Weighted by what you said matters, those gaps don't cancel out, so keeping the Camry comes out ahead by more than Fork's margin.",
    );
  });

  it("one side empty: the other car is said to be ahead on nothing, and the leader comes first", () => {
    const keepOnly = buildTradeoff(input(w(0.3, 0.1, 0.1, 0.2, 0.1), w(0.1, 0.1, 0.05, 0.1, 0.1), "keep"))!;
    expect(keepOnly.rows.map((r) => r.leader)).toEqual(["keep", "level", "keep", "keep", "level"]);
    expect(keepOnly.sentence).toBe(
      "Keeping the Camry is ahead on cost, life left and family fit. The RAV4 isn't ahead on anything. " +
        "Weighted by what you said matters, that lead adds up, so keeping the Camry comes out ahead by more than Fork's margin.",
    );

    const swapOnly = buildTradeoff(input(w(0.1, 0.1, 0.1, 0.1, 0.1), w(0.1, 0.14, 0.1, 0.1, 0.1), "inconclusive"))!;
    expect(swapOnly.sentence).toBe(
      "The RAV4 is ahead on fuel use. Keeping the Camry isn't ahead on anything. " +
        "Weighted by what you said matters, that lead is too small to count within Fork's margin, so neither car clearly leads.",
    );
  });

  it("all level: says so, and does not invent a lead", () => {
    const same = w(0.1, 0.1, 0.1, 0.1, 0.1);
    const t = buildTradeoff(input(same, { ...same, cost: 0.103 }, "inconclusive"))!;
    expect(t.rows.every((r) => r.leader === "level")).toBe(true);
    expect(t.sentence).toBe("The two cars are level on every priority, so neither car clearly leads.");
  });

  it("uses the names it is given", () => {
    const t = buildTradeoff({ ...input(CLOSE_KEEP, CLOSE_SWAP, "inconclusive"), keepName: "your Corolla", switchName: "a Prius" })!;
    expect(t.sentence).toMatch(/^Keeping your Corolla is ahead on cost and family fit\. A Prius is ahead on fuel use and life left\./);
  });

  it("an engine pick that is neither compared future is not given a name it does not have", () => {
    const t = buildTradeoff(input(CLOSE_KEEP, CLOSE_SWAP, "some-other-future"))!;
    expect(t.closeCall).toBe(false);
    expect(t.sentence).toMatch(/so one of the futures comes out ahead by more than Fork's margin\.$/);
  });
});

describe("hard limits", () => {
  const seatsKeep = ["Keep the Camry: seats_below_household from month 12"];
  const seatsSwap = ["Replace with RAV4: seats_below_household from month 12"];

  it("a hard limit on keeping says so in plain words and leaves the other car", () => {
    const t = buildTradeoff(input(CLOSE_KEEP, CLOSE_SWAP, "swap", seatsKeep))!;
    expect(t.closeCall).toBe(false);
    expect(t.sentence).toBe(
      "A hard limit rules out keeping the Camry: it doesn't have enough seats for your household. " +
        "That leaves the RAV4 as the only option that fits.",
    );
  });

  it("a hard limit on the other car leaves keeping", () => {
    const t = buildTradeoff(input(CLOSE_KEEP, CLOSE_SWAP, "keep", ["Replace with RAV4: monthly cost $1,234 over the $900 budget at month 14"]))!;
    expect(t.sentence).toBe(
      "A hard limit rules out the RAV4: it goes over your monthly budget. That leaves keeping the Camry as the only option that fits.",
    );
  });

  it("both ruled out for the same reason, and for different reasons", () => {
    const same = buildTradeoff(input(CLOSE_KEEP, CLOSE_SWAP, "inconclusive", [...seatsKeep, ...seatsSwap]))!;
    expect(same.closeCall).toBe(true);
    expect(same.sentence).toBe("A hard limit rules out both cars: each one doesn't have enough seats for your household. So neither car clearly leads.");

    const different = buildTradeoff(
      input(CLOSE_KEEP, CLOSE_SWAP, "inconclusive", [
        "Keep the Camry: car_seats_exceed_rear_positions from month 6",
        "Replace with RAV4: monthly cost $2,000 over the $1,500 budget at month 3",
      ]),
    )!;
    expect(different.sentence).toBe(
      "A hard limit rules out both cars. The Camry doesn't have room for the car seats you listed, and the RAV4 goes over your monthly budget. So neither car clearly leads.",
    );
  });

  it("repeats no dollar figure or month from the engine's text, and says something for a limit it has no words for", () => {
    const t = buildTradeoff(input(CLOSE_KEEP, CLOSE_SWAP, "swap", ["Keep the Camry: something_new from month 9"]))!;
    expect(t.sentence).toBe("A hard limit rules out keeping the Camry: it breaks a limit you set. That leaves the RAV4 as the only option that fits.");
    expect(withoutModelName(t.sentence)).not.toMatch(FIGURES);
  });

  it("a limit named for a future that is not one of these two still gets an honest line", () => {
    const t = buildTradeoff(input(CLOSE_KEEP, CLOSE_SWAP, "swap", ["Some other future: seats_below_household from month 2"]))!;
    expect(t.sentence).toBe("A hard limit rules out one of the options, so the weighing of your priorities does not settle it.");
  });
});

describe("nothing to explain", () => {
  it("is null when either future has no score", () => {
    const base = input(CLOSE_KEEP, CLOSE_SWAP, "inconclusive");
    expect(buildTradeoff({ ...base, scores: [] })).toBeNull();
    expect(buildTradeoff({ ...base, scores: [base.scores[0]] })).toBeNull();
    expect(buildTradeoff({ ...base, scores: [base.scores[1]] })).toBeNull();
    expect(buildTradeoff({ ...base, keepId: "elsewhere" })).toBeNull();
    expect(buildTradeoff({ ...base, replaceId: "elsewhere" })).toBeNull();
  });

  it("is pure: the same input gives the same words, and the input is not changed", () => {
    const base = input(CLOSE_KEEP, CLOSE_SWAP, "inconclusive");
    const before = structuredClone(base);
    expect(buildTradeoff(base)).toEqual(buildTradeoff(base));
    expect(base).toEqual(before);
  });
});

describe("words only", () => {
  it("never carries a number, a dollar sign, a percent, an em dash, or a build-time word, in any combination", () => {
    const leaders = [-1, 0, 1];
    const hardSets: string[][] = [
      [],
      ["Keep the Camry: seats_below_household from month 12"],
      ["Replace with RAV4: monthly cost $1,200 over the $900 budget at month 14"],
      ["Keep the Camry: seats_below_household from month 12", "Replace with RAV4: car_seats_exceed_rear_positions from month 3"],
    ];
    let checked = 0;
    for (const a of leaders) for (const b of leaders) for (const c of leaders) for (const d of leaders) for (const e of leaders) {
      const gap = [a, b, c, d, e];
      const keep = w(0.2 + 0.05 * gap[0], 0.2 + 0.05 * gap[1], 0.2 + 0.05 * gap[2], 0.2 + 0.05 * gap[3], 0.2 + 0.05 * gap[4]);
      const swap = w(0.2, 0.2, 0.2, 0.2, 0.2);
      for (const preferred of ["keep", "swap", "inconclusive"]) {
        for (const hard of hardSets) {
          const t = buildTradeoff(input(keep, swap, preferred, hard))!;
          expect(withoutModelName(t.sentence), JSON.stringify({ gap, preferred, hard })).not.toMatch(FIGURES);
          checked += 1;
        }
      }
    }
    expect(checked).toBe(243 * 3 * 4);
  });
});

// ---- through the real engine ------------------------------------------------------------------------------------------

const state = () => useForkStore.getState();
const actions = () => useForkStore.getState().actions;

type Draft = Omit<LifeEvent, "id" | "status">;
const draft = (type: LifeEvent["type"], month: number, payload: LifeEvent["payload"], quote?: string): Draft => ({
  type,
  month,
  payload,
  source: "user",
  assumptions: [],
  quote,
  certainty: "clear",
});

async function startWorkspace() {
  await actions().startFromSample("camry-2022-se");
  actions().onRevealStage("done");
}

function confirm(...drafts: Draft[]) {
  act(() => {
    const ids = drafts.map((d) => {
      actions().addDraft(d);
      const all = state().explore.draftChanges;
      return all[all.length - 1].id;
    });
    actions().confirmDrafts(ids);
  });
}

/** The Alex story end to end with no AI: the sentence, the offline rules, the confirm, the comparison. */
async function alexToComparison() {
  vi.spyOn(ai, "interpret").mockResolvedValue({ aiAvailable: false });
  await startWorkspace();
  expect(await actions().submitDump(data.demo.brainDump)).toMatchObject({ kind: "proposed" });
  actions().confirmDrafts(state().explore.draftChanges.map((d) => d.id));
  await actions().openReplaceComparison();
}

/** The same tradeoff, worked out here from the engine's scores, independent of buildTradeoff. */
function oracle() {
  const { scores, comparison } = state();
  const keep = scores.find((s) => s.scenarioId === comparison!.keepId)!;
  const swap = scores.find((s) => s.scenarioId === comparison!.replaceId)!;
  return (["cost", "fuel", "longevity", "family", "comfort"] as const).map((k) => {
    const gap = keep.contributions[k] - swap.contributions[k];
    return Math.abs(gap) < 0.005 ? "level" : gap > 0 ? "keep" : "switch";
  });
}

function tradeoffFromStore() {
  const s = state();
  return buildTradeoff({
    scores: s.scores,
    evaluation: s.evaluation!,
    keepId: s.comparison!.keepId,
    replaceId: s.comparison!.replaceId,
    keepName: `the ${s.twin!.vehicle.model}`,
    switchName: `the ${s.replacementVehicle!.model}`,
    priorities: s.explore.confirmedProfile.priorities,
  })!;
}

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  resetForkStoreForTests();
  useForkStore.setState({ hydrated: true });
  vi.spyOn(ai, "explain").mockRejectedValue(new Error("no words in this test"));
});

describe("through the real engine", () => {
  it("the Alex close call: rows match the engine's contributions and the sentence says it balances out", async () => {
    await alexToComparison();
    expect(state().evaluation?.preferredScenarioId).toBe("inconclusive");
    expect(state().scores).toHaveLength(2);
    const t = tradeoffFromStore();
    expect(t.closeCall).toBe(true);
    expect(t.rows.map((r) => r.leader)).toEqual(oracle());
    // keeping is cheaper; the RAV4 uses less fuel and has more life left; family fit and comfort are level
    expect(t.rows.map((r) => r.leader)).toEqual(["keep", "switch", "switch", "level", "level"]);
    expect(t.sentence).toBe(
      "Keeping the Camry is ahead on cost. The RAV4 is ahead on fuel use and life left. " +
        "Weighted by what you said matters, they balance out within Fork's margin, so neither car clearly leads.",
    );
  });

  it("heavy miles: the engine picks the RAV4 and the sentence says it is ahead by more than the margin", async () => {
    await startWorkspace();
    confirm(draft("mileage_change", 0, { annualMiles: 30000 }, "30,000 miles a year"));
    await actions().openReplaceComparison();
    const { evaluation, comparison } = state();
    expect(evaluation?.preferredScenarioId).toBe(comparison!.replaceId);
    const t = tradeoffFromStore();
    expect(t.closeCall).toBe(false);
    expect(t.rows.map((r) => r.leader)).toEqual(oracle());
    expect(t.sentence).toMatch(/ so the RAV4 comes out ahead by more than Fork's margin\.$/);
    expect(t.sentence).toMatch(/The RAV4 is ahead on fuel use and life left\./);
  });

  it("light miles: the engine keeps the car and the sentence says keeping comes out ahead", async () => {
    await startWorkspace();
    confirm(draft("mileage_change", 0, { annualMiles: 8000 }, "8,000 miles a year"));
    await actions().openReplaceComparison();
    const { evaluation, comparison } = state();
    expect(evaluation?.preferredScenarioId).toBe(comparison!.keepId);
    const t = tradeoffFromStore();
    expect(t.closeCall).toBe(false);
    expect(t.rows.map((r) => r.leader)).toEqual(oracle());
    expect(t.sentence).toMatch(/ so keeping the Camry comes out ahead by more than Fork's margin\.$/);
  });

  it("changing what you said matters re-weighs the same two futures and the words follow", async () => {
    await alexToComparison();
    expect(tradeoffFromStore().closeCall).toBe(true);

    act(() => actions().pickTradeoff({ pairId: "cost_vs_cargo", choice: "B" })); // family over cost
    const { evaluation, comparison } = state();
    expect(evaluation?.preferredScenarioId).toBe(comparison!.replaceId);
    const swapped = tradeoffFromStore();
    expect(swapped.closeCall).toBe(false);
    expect(swapped.rows.map((r) => r.leader)).toEqual(oracle());
    expect(swapped.sentence).toMatch(/so the RAV4 comes out ahead/);

    act(() => actions().pickTradeoff({ pairId: "cost_vs_cargo", choice: "A" })); // cost over family
    expect(state().evaluation?.preferredScenarioId).toBe(state().comparison!.keepId);
    expect(tradeoffFromStore().sentence).toMatch(/so keeping the Camry comes out ahead/);
  });

  it("a household too big for either car is a hard limit, said in plain words with no figures", async () => {
    await startWorkspace();
    confirm(draft("family_change", 12, { householdSize: 6 }, "six of us"));
    await actions().openReplaceComparison();
    expect(state().evaluation?.hardConstraints.length).toBeGreaterThan(0);
    const t = tradeoffFromStore();
    expect(t.closeCall).toBe(true);
    expect(t.sentence).toBe("A hard limit rules out both cars: each one doesn't have enough seats for your household. So neither car clearly leads.");
    expect(withoutModelName(t.sentence)).not.toMatch(FIGURES);
  });

  it("every sentence the engine leads to is words only", async () => {
    await alexToComparison();
    for (const choice of ["A", "B"] as const) {
      for (const pairId of ["cost_vs_cargo", "longevity_vs_fuel", "comfort_vs_cost"] as const) {
        act(() => actions().pickTradeoff({ pairId, choice }));
        expect(withoutModelName(tradeoffFromStore().sentence)).not.toMatch(FIGURES);
      }
    }
  });
});
