import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LifeEvent, Scenario } from "@/contracts";
import { demoVins } from "@/data/registry";
import { ForkApp } from "@/ui/shell/ForkApp";
import { activeRider } from "@/ui/reveal/RiderDock";
import { BASE_ID, TERM_KEYS, resetForkStoreForTests, simulationInputs, useForkStore } from "@/ui/store/useForkStore";
import { sim } from "@/ui/mocks";

// Random but repeatable sessions: a person doing things in any order. After every action the data has to agree with
// itself and the screen has to agree with the data. A failure prints the seed and the steps, so it can be replayed:
//   FUZZ_SEED=12 FUZZ_SEQS=1 FUZZ_STEPS=40 npx vitest run ui/integration

const SEQS = Number(process.env.FUZZ_SEQS ?? 6);
const STEPS = Number(process.env.FUZZ_STEPS ?? 22);
const SEED0 = Number(process.env.FUZZ_SEED ?? 1);

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const state = () => useForkStore.getState();
const actions = () => useForkStore.getState().actions;
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const SENTENCES = [
  "I'm moving to Denver next year, driving 20,000 miles annually, and expecting my second child in 2029.",
  "Moving to Seattle in 6 months",
  "gas is going to hit $5 a gallon",
  "My budget is $600 a month for the car",
  "I'll drive 30,000 miles a year starting now",
  "We are expecting twins in 2028",
  "Would switching to a RAV4 Hybrid make more sense?",
  "What would have to change for keeping the Camry to be the better option?",
  "I need more cargo room next year",
  "I'm not pregnant",
  "hi",
  "asdf qwer 12 34",
  "I drive 15k a year and our household is four.",
  "Move to Austin in 6 months. I commute 25 miles each way 4 days a week.",
  "What if gas hits $8?",
];

const EVENTS: Array<Omit<LifeEvent, "id" | "status">> = [
  { type: "relocation", month: 12, payload: { location: "Denver" }, source: "user", assumptions: [], certainty: "clear" },
  { type: "mileage_change", month: 0, payload: { annualMiles: 20000 }, source: "user", assumptions: [], certainty: "clear" },
  { type: "mileage_change", month: 30, payload: { annualMiles: 0 }, source: "user", assumptions: [], certainty: "clear" },
  { type: "mileage_change", month: 6, payload: { annualMiles: 90000 }, source: "user", assumptions: ["Assumes every day"], certainty: "inferred" },
  { type: "family_change", month: 32, payload: { children: 2 }, source: "user", assumptions: [], certainty: "inferred" },
  { type: "family_change", month: 20, payload: { childrenDelta: 2 }, source: "user", assumptions: [], certainty: "clear" },
  { type: "cargo_change", month: 18, payload: { cargoNeed: "high" }, source: "user", assumptions: [], certainty: "clear" },
  { type: "budget_change", month: 3, payload: { monthlyBudget: 400 }, source: "user", assumptions: [], certainty: "clear" },
  { type: "fuel_price_change", month: 0, payload: { fuelPricePerGal: 6.5 }, source: "user", assumptions: [], certainty: "clear" },
  { type: "relocation", month: 60, payload: { location: "Reno" }, source: "user", assumptions: [], certainty: "vague" },
  { type: "maintenance_decision", month: 24, payload: {}, source: "user", assumptions: [], certainty: "clear" },
  { type: "mileage_change", month: 9, payload: { commuteMilesOneWay: 30, commuteDaysPerWeek: 5 }, source: "user", assumptions: [], certainty: "clear" },
];

type Rnd = () => number;
const pick = <T,>(r: Rnd, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];

interface Act {
  name: string;
  weight: number;
  when(): boolean;
  run(r: Rnd): Promise<string | void> | string | void;
}

const phase = () => state().phase;
const inWork = () => phase() === "workspace";
const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);

const ACTS: Act[] = [
  { name: "startFromVin", weight: 6, when: () => true, run: async (r) => { const vin = pick(r, [demoVins.camry.primary, demoVins.rav4.primary, demoVins.camry.backup, "ABC", "4T1G11AK2NU900001"]); await actions().startFromVin(vin); return vin; } },
  { name: "startFromSample", weight: 2, when: () => true, run: async (r) => { const id = pick(r, ["camry-2022-se", "rav4-2024-hybrid-xle", "nope"]); await actions().startFromSample(id); return id; } },
  { name: "startFromPicker", weight: 1, when: () => true, run: async (r) => { const c = pick(r, [["Toyota", "Camry", 2022, "SE"], ["Toyota", "RAV4", 2024, "Hybrid XLE"], ["Honda", "Civic", 2020, undefined]] as const); await actions().startFromPicker(c[0], c[1], c[2], c[3]); } },
  { name: "answerRiders", weight: 6, when: () => state().twin !== null, run: (r) => { const c = pick(r, ["solo", "partner", "kids", "mixed"] as const); actions().answerRiders(c); return c; } },
  { name: "skip", weight: 3, when: () => phase() === "reveal", run: () => actions().skip() },
  { name: "replayReveal", weight: 2, when: inWork, run: () => actions().replayReveal() },
  { name: "tick", weight: 8, when: () => true, run: async (r) => { const ms = pick(r, [0, 500, 2000, 4100, 1900]); await advance(ms); return `${ms}ms`; } },
  { name: "submitDump", weight: 8, when: inWork, run: async (r) => { const t = pick(r, SENTENCES); await actions().submitDump(t); return t.slice(0, 40); } },
  { name: "submitDump twice", weight: 2, when: inWork, run: async (r) => { const t = pick(r, SENTENCES); await actions().submitDump(t); await actions().submitDump(t); return t.slice(0, 40); } },
  { name: "confirmDrafts", weight: 8, when: () => inWork() && state().explore.draftChanges.length > 0, run: (r) => { const ids = state().explore.draftChanges.map((d) => d.id).filter(() => r() < 0.75); actions().confirmDrafts(ids.length ? ids : [state().explore.draftChanges[0].id]); return `${ids.length}`; } },
  { name: "addDraft", weight: 7, when: inWork, run: (r) => { const e = pick(r, EVENTS); actions().addDraft({ ...e, month: r() < 0.3 ? Math.floor(r() * 61) : e.month }); return e.type; } },
  { name: "rejectDraft", weight: 2, when: () => state().explore.draftChanges.length > 0, run: (r) => actions().rejectDraft(pick(r, state().explore.draftChanges).id) },
  { name: "editDraft", weight: 2, when: () => state().explore.draftChanges.length > 0, run: (r) => actions().editDraft(pick(r, state().explore.draftChanges).id, { month: Math.floor(r() * 61) }) },
  { name: "answerQuestion", weight: 3, when: () => state().question !== null, run: (r) => { const q = state().question!; const v = pick(r, ["unsure", 3, 25000, "high", -5] as const); actions().answerQuestion(q.field, v as never); return `${q.field}=${v}`; } },
  { name: "answerFinance", weight: 3, when: inWork, run: (r) => { const v = pick(r, ["paid_off", "loan", "lease", "unknown"] as const); actions().answerQuestion("financeType", v as never); return v; } },
  { name: "pickTradeoff", weight: 2, when: inWork, run: (r) => actions().pickTradeoff({ pairId: pick(r, ["cost_vs_cargo", "longevity_vs_fuel", "comfort_vs_cost"] as const), choice: pick(r, ["A", "B"] as const) }) },
  { name: "compare", weight: 6, when: inWork, run: async () => { await actions().openReplaceComparison(); } },
  { name: "applyTerms", weight: 2, when: () => inWork() && state().comparison !== null, run: (r) => actions().applyScenarioTerms({ [pick(r, TERM_KEYS)]: pick(r, [0.01, 5, 1000, 40000]) }) },
  { name: "resetTerms", weight: 1, when: inWork, run: () => actions().resetScenarioTerms() },
  { name: "runBreakEven", weight: 2, when: () => inWork() && state().comparison !== null, run: (r) => actions().runBreakEven(pick(r, ["annualMiles", "fuelPricePerGal"] as const)) },
  { name: "moveEvent", weight: 4, when: () => inWork() && state().explore.scenarios.some((s) => s.events.length > 0), run: (r) => { const sc = pick(r, state().explore.scenarios.filter((s) => s.events.length > 0)); const ev = pick(r, sc.events); actions().moveEvent(sc.id, ev.id, Math.floor(r() * 61)); return `${ev.type}`; } },
  { name: "setActiveScenario", weight: 5, when: inWork, run: (r) => actions().setActiveScenario(pick(r, state().explore.scenarios).id) },
  { name: "setActiveMonth", weight: 3, when: inWork, run: (r) => actions().setActiveMonth(Math.floor(r() * 80) - 10) },
  { name: "setView", weight: 6, when: inWork, run: (r) => actions().setView(pick(r, ["car", "future"] as const)) },
  { name: "flags", weight: 4, when: inWork, run: (r) => { const a = actions(); const on = r() < 0.6; pick(r, [() => a.setFutureDetails(on), () => a.setFutureCompare(on), () => a.setFutureExpanded(on), () => a.setFutureWhy(on), () => a.setFutureTerms(on), () => a.setFutureBreakEven(on), () => a.setDetailsOpen(on)])(); } },
  { name: "selectStep", weight: 4, when: () => inWork() && state().ui.view === "future", run: (r) => { const steps = screen.queryAllByTestId("step"); if (steps.length) fireEvent.click(pick(r, steps)); } },
  { name: "transitionDone", weight: 2, when: () => state().stage.phase === "transition", run: () => actions().onTransitionComplete() },
  { name: "resetAll", weight: 1, when: () => state().twin !== null, run: () => actions().resetAll() },
];

// ---- what must always be true of the data ----
function dataProblems(): string[] {
  const s = state();
  const out: string[] = [];
  const ids = s.explore.scenarios.map((x) => x.id);
  if (new Set(ids).size !== ids.length) out.push(`duplicate scenario ids: ${ids.join(", ")}`);
  for (const sc of s.explore.scenarios) {
    const eids = sc.events.map((e) => e.id);
    if (new Set(eids).size !== eids.length) out.push(`scenario ${sc.id} has duplicate event ids`);
    const keys = sc.events.map((e) => JSON.stringify([e.type, e.month, e.payload]));
    if (new Set(keys).size !== keys.length) out.push(`scenario ${sc.id} holds the same change twice`);
    if (sc.events.some((e) => e.status !== "confirmed")) out.push(`scenario ${sc.id} holds an event that is not confirmed`);
    if (sc.events.some((e) => !Number.isFinite(e.month) || e.month < 0 || e.month > 60)) out.push(`scenario ${sc.id} has an event outside 0 to 60`);
  }
  // a branch is its parent's life up to where it forks, so a change made to the parent must reach it
  for (const sc of s.explore.scenarios) {
    const parent = sc.parentId ? s.explore.scenarios.find((x) => x.id === sc.parentId) : undefined;
    if (sc.parentId && !parent) { out.push(`scenario ${sc.id} came from ${sc.parentId}, which is gone`); continue; }
    if (!parent) continue;
    const key = (e: LifeEvent) => JSON.stringify([e.id, e.month, e.payload]);
    const before = (x: Scenario) => x.events.filter((e) => e.month < sc.forkMonth && e.type !== "vehicle_replacement").map(key).sort();
    if (JSON.stringify(before(sc)) !== JSON.stringify(before(parent))) out.push(`${sc.id} does not hold its parent's life before month ${sc.forkMonth}: it was not updated when ${parent.id} changed`);
  }
  const draftKeys = s.explore.draftChanges.map((d) => JSON.stringify([d.type, d.month, d.payload]));
  if (new Set(draftKeys).size !== draftKeys.length) out.push("the same change is waiting twice to be confirmed");
  const draftIds = s.explore.draftChanges.map((d) => d.id);
  if (new Set(draftIds).size !== draftIds.length) out.push(`duplicate draft ids: ${draftIds.join(", ")}`);
  if (s.explore.draftChanges.some((d) => d.status !== "proposed")) out.push("a draft that is not proposed");
  if (s.activeMonth < 0 || s.activeMonth > 60 || !Number.isFinite(s.activeMonth)) out.push(`activeMonth ${s.activeMonth}`);

  const p = s.explore.confirmedProfile;
  if (s.twin && (p.householdSize < 1 || !Number.isFinite(p.annualMiles) || p.annualMiles < 0)) out.push(`odd profile ${p.householdSize} ${p.annualMiles}`);
  if (s.twin && Math.abs(Object.values(p.priorities).reduce((a, b) => a + b, 0) - 1) > 0.02) out.push(`priorities do not sum to 1: ${JSON.stringify(p.priorities)}`);

  if (s.phase === "workspace") {
    if (!ids.includes(BASE_ID)) out.push("no baseline in the workspace");
    if (!ids.includes(s.activeScenarioId)) out.push(`active scenario ${s.activeScenarioId} does not exist`);
    for (const id of ids) if (!s.results[id]) out.push(`scenario ${id} has no result`);
    for (const id of Object.keys(s.results)) if (!ids.includes(id)) out.push(`result for a scenario that is gone: ${id}`);
    // nothing on screen may rest on an old input: every stored result must equal a fresh run
    const inputs = simulationInputs(s);
    if (inputs) {
      for (const sc of s.explore.scenarios) {
        const fresh = sim.simulate(inputs.twin, sc, inputs.ctx);
        if (s.results[sc.id] && JSON.stringify(fresh) !== JSON.stringify(s.results[sc.id])) out.push(`STALE result for ${sc.id}: it was not recomputed after an input changed`);
      }
    }
    for (const [id, r] of Object.entries(s.results)) {
      const bad = r.points.some((pt) => [pt.netEconomicCost, pt.cumulativeCash, pt.fuelSpend, pt.vehicleValue, pt.mileage].some((v) => !Number.isFinite(v)));
      if (bad || !Number.isFinite(r.summary.netCost)) out.push(`non-finite number in the result for ${id}`);
    }
  }
  if (s.twin) {
    const f = s.twin.finance;
    if (s.twin.driver.financeType === "paid_off" && (f.balance !== 0 || f.monthlyPayment !== 0)) out.push(`finance says paid off but the twin still has a balance of ${f.balance} and a payment of ${f.monthlyPayment}`);
    if (s.explore.confirmedProfile.financeType !== f.financeType) out.push(`the profile says ${s.explore.confirmedProfile.financeType} but the finance record says ${f.financeType}`);
  }
  if (s.phase === "workspace" && s.twin && s.stage.phase !== "transition") {
    const sc = s.explore.scenarios.find((x) => x.id === s.activeScenarioId);
    const swaps = sc?.events.filter((e) => e.type === "vehicle_replacement") ?? [];
    const want = swaps.length > 0 && s.replacementVehicle ? s.replacementVehicle.id : s.twin.vehicle.id;
    if (sc && s.activeVehicleId !== want) out.push(`you are looking at ${sc.id}, which ends in the ${want}, but the car on stage is the ${s.activeVehicleId}`);
  }
  if (s.comparison) {
    const { keepId, replaceId } = s.comparison;
    if (!ids.includes(keepId) || !ids.includes(replaceId)) out.push(`comparison points at a scenario that is gone (${keepId}, ${replaceId})`);
    else {
      if (!s.evaluation) out.push("a comparison with no evaluation");
      else if (JSON.stringify([...s.evaluation.scenarioIds].sort()) !== JSON.stringify([keepId, replaceId].sort())) out.push(`the verdict is about ${s.evaluation.scenarioIds.join(" vs ")} but the comparison is ${keepId} vs ${replaceId}`);
      // the replace future must be the keep future plus the swap: same life, so the comparison is fair
      const keep = s.explore.scenarios.find((x) => x.id === keepId) as Scenario;
      const rep = s.explore.scenarios.find((x) => x.id === replaceId) as Scenario;
      const lifeOf = (x: Scenario) => JSON.stringify(x.events.filter((e) => e.type !== "vehicle_replacement").map((e) => [e.id, e.month, e.payload]).sort());
      if (keep && rep && lifeOf(keep) !== lifeOf(rep)) out.push(`the two cars are compared over different lives: keep ${keepId} and replace ${replaceId} do not hold the same events`);
    }
  } else if (s.evaluation && s.phase === "workspace") out.push("a verdict with no comparison");
  if (s.ui.busy !== "idle") out.push(`still busy: ${s.ui.busy}`);
  return out;
}

// ---- what must always be true of the screen, given the data ----
function screenProblems(): string[] {
  const s = state();
  const out: string[] = [];
  const text = document.body.textContent ?? "";
  for (const bad of [/NaN/, /undefined/, /Infinity/, /\[object/, /\$-/, /\bnull\b/]) if (bad.test(text)) out.push(`the screen says ${bad}: ...${(text.match(new RegExp(`.{0,30}${bad.source}.{0,30}`)) ?? [""])[0]}...`);
  if (document.querySelector('[data-source="none"]')) out.push("a number on screen with no source label");
  if (/\bdemo\b|\bdata\b/i.test(text)) out.push(`the screen says demo or data: ...${(text.match(/.{0,30}\b(demo|data)\b.{0,30}/i) ?? [""])[0]}...`);

  if (s.phase === "landing") {
    if (!screen.queryByPlaceholderText("Enter your VIN")) out.push("landing without the VIN field");
    return out;
  }
  const dock = screen.queryByTestId("rider-dock");
  if (s.twin && !dock) out.push("no rider chips");
  if (dock) {
    const lit = [...dock.querySelectorAll("button[aria-pressed='true']")].map((b) => b.textContent);
    const want = activeRider(s.explore.confirmedProfile.householdSize, s.explore.confirmedProfile.children);
    const label = want ? { solo: "Just me", partner: "Partner", kids: "Kids", mixed: "Mixed" }[want] : null;
    if (JSON.stringify(lit) !== JSON.stringify(label ? [label] : [])) out.push(`rider chip shows ${JSON.stringify(lit)} but the profile (${s.explore.confirmedProfile.householdSize} people, ${s.explore.confirmedProfile.children} children) says ${label}`);
    if (dock.getAttribute("data-mode") !== (s.phase === "reveal" ? "row" : "panel")) out.push(`rider chips are in the wrong place for phase ${s.phase}`);
  }
  if (s.phase === "workspace" && s.ui.view === "car") {
    const h1 = screen.queryByRole("heading", { level: 1 })?.textContent ?? "";
    const v = s.replacementVehicle && s.activeVehicleId === s.replacementVehicle.id ? s.replacementVehicle : s.twin?.vehicle;
    if (v && !h1.includes(v.model)) out.push(`the car page says "${h1}" but the car in view is the ${v.model}`);
  }
  const stub = screen.queryByTestId("car-stage-stub");
  if (stub && s.twin && s.stage.phase !== "transition") {
    const want = s.activeVehicleId;
    if (want && stub.getAttribute("data-vehicle-id") !== want) out.push(`the 3D car is ${stub.getAttribute("data-vehicle-id")} but the app says ${want}`);
  }

  if (s.phase === "workspace" && s.ui.view === "future") {
    const timeline = screen.queryByTestId("winding-timeline");
    if (!timeline) { out.push("future page with no timeline"); return out; }
    const active = s.explore.scenarios.find((x) => x.id === s.activeScenarioId)!;
    const keep = s.comparison ? s.explore.scenarios.find((x) => x.id === s.comparison!.keepId) : undefined;
    const shown = s.comparison && keep && (s.activeScenarioId === s.comparison.keepId || s.activeScenarioId === s.comparison.replaceId) ? keep : active;
    const decisions = shown.events.filter((e) => e.status === "confirmed");
    const want = decisions.length + (decisions.length === 0 || Math.min(...decisions.map((d) => d.month)) > 0 ? 1 : 0) + 1;
    const steps = screen.queryAllByTestId("step");
    if (steps.length !== want) out.push(`the path has ${steps.length} steps but ${shown.id} has ${decisions.length} decisions (expected ${want})`);

    const cost = (id: string) => s.results[id]?.points.find((p) => p.month === 60)?.netEconomicCost;
    const card = screen.queryByTestId("step-detail");
    const stats = [...(card?.querySelectorAll('[data-slot="stat"]') ?? [])].map((n) => n.textContent ?? "");
    const open = steps.find((b) => b.getAttribute("aria-current") === "step");
    const kind = open?.getAttribute("data-step-key");
    const expectCosts: number[] = [];
    if (kind === "fork" && s.comparison) expectCosts.push(cost(s.comparison.keepId)!, cost(s.comparison.replaceId)!);
    else if (kind === "fork") expectCosts.push(cost(shown.id)!);
    else if (kind === "start") expectCosts.push(cost(BASE_ID)!);
    else expectCosts.push(cost(shown.id)!);
    if (stats.length !== expectCosts.length) out.push(`the card shows ${stats.length} costs, expected ${expectCosts.length} (open step ${kind})`);
    else expectCosts.forEach((c, i) => { if (!stats[i].includes(usd.format(c))) out.push(`the card says "${stats[i]}" but the engine says ${usd.format(c)} for step ${kind}`); });

    const ends = screen.queryAllByTestId("fork-end");
    if (s.comparison && ends.length !== 2) out.push(`after comparing there are ${ends.length} ways at the fork, expected 2`);
    if (s.comparison && s.evaluation && !s.ui.futureExpanded) {
      const pref = s.evaluation.preferredScenarioId;
      const tags = ends.map((e) => e.textContent ?? "");
      const recommended = tags.filter((t) => t.includes("Recommended")).length;
      if (pref === "inconclusive" && (recommended !== 0 || tags.filter((t) => t.includes("Close call")).length !== 2)) out.push("a close call is not shown as one at the fork");
      if (pref !== "inconclusive" && recommended !== 1) out.push(`${recommended} ways recommended at the fork, expected 1`);
      if (pref !== "inconclusive") {
        const headline = screen.queryByTestId("verdict-headline")?.textContent ?? "";
        const picksKeep = pref === s.comparison.keepId;
        if (picksKeep && !/^Keep your/.test(headline)) out.push(`the verdict says "${headline}" but the engine picked keeping`);
        if (!picksKeep && !/^Switch to/.test(headline)) out.push(`the verdict says "${headline}" but the engine picked the other car`);
      } else if (screen.queryByTestId("verdict-headline")?.textContent !== "Close call") out.push("a close call whose headline is not Close call");
    }
    if (!s.comparison && screen.queryByTestId("verdict")) out.push("a verdict on screen with no comparison");
  }
  return out;
}

// What the sessions actually did, so a quiet run can be told from an empty one.
const coverage: Record<string, number> = {};
const seen = (k: string) => (coverage[k] = (coverage[k] ?? 0) + 1);

const origError = console.error;
let errors: string[];

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  errors = [];
  console.error = (...args: unknown[]) => {
    const m = args.map(String).join(" ");
    if (!/not wrapped in act|Not implemented|not configured to support act/i.test(m)) errors.push(m.slice(0, 300));
  };
  localStorage.clear();
  resetForkStoreForTests();
});

afterEach(() => {
  console.error = origError;
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("random sessions: the screen always agrees with the data", () => {
  for (let k = 0; k < SEQS; k++) {
    const seed = SEED0 + k;
    it(`seed ${seed}`, async () => {
      const r = mulberry32(seed);
      render(<ForkApp />);
      await act(async () => { await advance(0); });
      const log: string[] = [];
      const problems: string[] = [];
      // every session starts by opening a car, like a person would
      await act(async () => { await actions().startFromVin(demoVins.camry.primary); await advance(4100); });
      log.push("open camry");
      for (let i = 0; i < STEPS && problems.length === 0; i++) {
        const usable = ACTS.filter((a) => a.when());
        const total = usable.reduce((n, a) => n + a.weight, 0);
        let roll = r() * total;
        const a = usable.find((x) => (roll -= x.weight) < 0) ?? usable[0];
        let note: string | void = "";
        try {
          await act(async () => { note = await a.run(r); });
        } catch (e) {
          problems.push(`${a.name} threw: ${e instanceof Error ? e.message : String(e)}`);
        }
        log.push(`${a.name}${note ? ` (${note})` : ""}`);
        seen(`action: ${a.name}`);
        const st = state();
        if (st.phase === "workspace" && st.ui.view === "future") seen("state: on the future page");
        if (st.comparison) seen("state: compared");
        if (st.comparison && st.ui.view === "future") seen("state: compared, on the future page");
        if (st.explore.scenarios.length > 2) seen("state: three or more futures");
        if (st.explore.scenarios.some((x) => x.parentId && x.parentId !== BASE_ID && !x.id.includes("replace"))) seen("state: a future branched from a future");
        if (st.phase === "reveal" && Object.keys(st.results).length > 0) seen("state: replayed reveal with results kept");
        if (st.ui.futureExpanded) seen("state: expanded");
        if (problems.length === 0) {
          problems.push(...dataProblems().map((p) => `data: ${p}`));
          problems.push(...screenProblems().map((p) => `screen: ${p}`));
          if (errors.length) problems.push(...errors.splice(0).map((e) => `console error: ${e}`));
        }
      }
      expect(problems, `seed ${seed}\nsteps: ${log.join(" > ")}`).toEqual([]);
    }, 60_000);
  }
});


if (process.env.FUZZ_COVERAGE) {
  describe("coverage", () => {
    it("prints what the sessions did", () => {
      console.log(Object.entries(coverage).sort().map(([k, v]) => `${v}\t${k}`).join("\n"));
    });
  });
}
