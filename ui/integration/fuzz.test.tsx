import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LifeEvent, Scenario } from "@/contracts";
import { demoVins } from "@/data/registry";
import { makeFrame } from "@/ui/journey/roadGeometry";
import { RECENT_MS } from "@/ui/journey/useJourney";
import { usd } from "@/ui/profile/format";
import { ForkApp } from "@/ui/shell/ForkApp";
import { activeRider } from "@/ui/reveal/RiderDock";
import {
  BASE_ID,
  TERM_KEYS,
  lifeOf,
  resetForkStoreForTests,
  simulationInputs,
  useForkStore,
  vehicleAtMonth,
  vehicleById,
  type DrawerId,
  type ForkState,
} from "@/ui/store/useForkStore";
import { sim } from "@/ui/mocks";

// Random but repeatable sessions: a person doing things in any order. After every action the data has to agree with
// itself and the screen has to agree with the data. A failure prints the seed and the steps, so it can be replayed:
//   FUZZ_SEED=12 FUZZ_SEQS=1 FUZZ_STEPS=40 npx vitest run ui/integration
//
//   FUZZ_SEQS      how many sessions (default 8)          FUZZ_STEPS     actions per session (default 30)
//   FUZZ_SEED      first seed; sessions use SEED, SEED+1, ...
//   FUZZ_COVERAGE  print how often every action and state was reached
//   FUZZ_KNOWN     run the seeds in KNOWN_BUGS too (by default they are skipped, because they fail on a bug in the app)
//
// What a session can do is what a person can do on the Future page: scrub (the slider, its keys, a drag along the road),
// pick an event, pick a future, play and pause, open and close each drawer, compare, resize the window; plus everything
// on the car page and in the command bar. A drawer or the assumptions sheet dims the whole page, so while one is open the
// page behind it is not reachable (only its own controls are).

const SEQS = Number(process.env.FUZZ_SEQS ?? 8);
const STEPS = Number(process.env.FUZZ_STEPS ?? 30);
const SEED0 = Number(process.env.FUZZ_SEED ?? 1);
const RUN_KNOWN = process.env.FUZZ_KNOWN === "1";

/**
 * Seeds that fail because of a bug in the app, not in this harness. They are skipped by default so the suite stays green and
 * replay with FUZZ_KNOWN=1 (e.g. FUZZ_KNOWN=1 FUZZ_SEED=<seed> FUZZ_SEQS=1 FUZZ_STEPS=40 npx vitest run ui/integration). The
 * list is empty: the three bugs this harness first found (a stale selected event, replay reveal showing the car at the end
 * of the future, replay reveal leaving playback on) are fixed, and so is the stage car not following a moved swap. Add a seed
 * here only with the bug it fails on, and delete it when the bug is fixed.
 */
const KNOWN_BUGS: Array<{ bug: string; seeds: number[] }> = [];
const KNOWN_BY_SEED = new Map(KNOWN_BUGS.flatMap(({ bug, seeds }) => seeds.map((seed) => [seed, bug] as const)));

/**
 * For hunting past a known bug: with FUZZ_PAST_KNOWN=1 these problems are dropped, so a session that hits one keeps going and
 * can find what is behind it. Not for the default run.
 */
const KNOWN_SIGNATURES: RegExp[] =
  process.env.FUZZ_PAST_KNOWN === "1"
    ? [
        /^data: selectedEventId .* is not a confirmed event in a future you can see/,
        /^data: playback is on but the Future page is not showing/,
        /^data: .* at month \d+ is in the .*, but the car page shows the/,
      ]
    : [];

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

// ---- what a person can reach ----
const phase = () => state().phase;
const inWork = () => phase() === "workspace";
const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);
const onFuture = () => inWork() && state().ui.view === "future";
/** No Future drawer is up. A drawer traps focus and dims the page, so nothing behind it can be reached. */
const clear = () => state().ui.drawer === null;
/** On the Future page with neither a drawer nor the assumptions sheet dimming it: the road, the scrubber and the header can be pressed. */
const free = () => onFuture() && clear() && !state().ui.detailsOpen;

// ---- the DOM, read plainly ----
const q = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const qa = (id: string) => [...document.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
const slider = () => document.querySelector<HTMLInputElement>('input[type="range"][aria-label="Selected month"]');
/** The first button under `root` whose label or text matches. Looked up by hand: role queries are slow on a page this big. */
const buttonIn = (root: ParentNode | null | undefined, re: RegExp) => [...(root?.querySelectorAll("button") ?? [])].find((b) => re.test(b.getAttribute("aria-label") ?? b.textContent ?? ""));
const COMPARE_LABEL = /^Compare with the|^Compare the two cars/;
const compareButton = () => buttonIn(q("journey-header"), COMPARE_LABEL);
const drawers = () => [...document.querySelectorAll<HTMLElement>('[role="dialog"][data-placement]')];
const openDrawers = () => drawers().filter((d) => d.getAttribute("data-open") === "true");
const press = (el: Element | null | undefined) => {
  if (el) fireEvent.click(el);
  return !!el;
};

// ---- a window the app can be resized in (the road turns to run down the page under 640px) ----
let viewport = 0;
const observers = new Set<() => void>();
class FakeResizeObserver {
  private readonly cb: () => void;
  constructor(cb: () => void) {
    this.cb = cb;
  }
  observe() {
    observers.add(this.cb);
  }
  unobserve() {}
  disconnect() {
    observers.delete(this.cb);
  }
}
// The drawer is a bottom sheet under 640px (a media query), and the road runs down the page (a measured width).
const mediaListeners = new Set<{ query: string; cb: (e: { matches: boolean }) => void }>();
const matches = (query: string): boolean => {
  const m = /(min|max)-width:\s*(\d+)px/.exec(query);
  if (!m || viewport === 0) return false; // no layout yet, as in a bare jsdom
  return m[1] === "min" ? viewport >= Number(m[2]) : viewport <= Number(m[2]);
};
const matchMediaStub = (query: string) => ({
  get matches() {
    return matches(query);
  },
  media: query,
  addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => void mediaListeners.add({ query, cb }),
  removeEventListener: (_: string, cb: (e: { matches: boolean }) => void) => {
    for (const l of [...mediaListeners]) if (l.cb === cb && l.query === query) mediaListeners.delete(l);
  },
});
function resizeTo(width: number) {
  if (viewport === 0) {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      () => ({ x: 0, y: 0, left: 0, top: 0, right: viewport, bottom: makeFrame(viewport, true).height, width: viewport, height: makeFrame(viewport, true).height, toJSON: () => ({}) }) as DOMRect,
    );
  }
  viewport = width;
  for (const l of [...mediaListeners]) l.cb({ matches: matches(l.query) });
  for (const cb of [...observers]) cb();
}

// ---- problems an action reports about itself (what it was supposed to do) ----
let actProblems: string[] = [];
const complain = (msg: string) => actProblems.push(msg);

interface Act {
  name: string;
  weight: number | (() => number);
  when(): boolean;
  /**
   * True when, however it goes, this only moves around what has already been worked out (the month, the selection, the
   * future you look at, playback, a drawer): the results, the verdict and the five year costs must not change at all.
   */
  looks?: () => boolean;
  run(r: Rnd): Promise<string | void> | string | void;
}

/** Time passed with playback on: the month only moves forward, and playback only stops by itself at the end. */
function checkPlayback(before: ForkState, after: ForkState) {
  if (!before.ui.playing || before.twin !== after.twin || before.ui.view !== "future" || after.ui.view !== "future" || before.phase !== "workspace" || after.phase !== "workspace") return;
  if (after.ui.drawer !== null || before.ui.drawer !== null) return;
  if (after.ui.playing && after.activeMonth < before.activeMonth) complain(`playback went backwards from month ${before.activeMonth} to ${after.activeMonth}`);
  if (!after.ui.playing && after.activeMonth !== 60) complain(`playback stopped by itself at month ${after.activeMonth}, before the end`);
  if (after.ui.playing && after.activeMonth >= 60) complain("playback went on at the end");
}

const weigh = (a: Act) => (typeof a.weight === "function" ? a.weight() : a.weight);

// What is on the road right now, from the store: the keep future's life, the swap, and which events show.
function roadFor(s: ForkState) {
  const find = (id: string | undefined) => (id ? s.explore.scenarios.find((x) => x.id === id) : undefined);
  const cmpKeep = find(s.comparison?.keepId);
  const cmpReplace = find(s.comparison?.replaceId);
  const compared = s.comparison !== null && !!cmpKeep && !!cmpReplace;
  const active = find(s.activeScenarioId);
  const keep = compared ? cmpKeep : active ? lifeOf(s, active) : undefined;
  const replace = compared ? cmpReplace : undefined;
  const onRoad = (e: LifeEvent) => e.status === "confirmed" && Number.isFinite(e.month) && e.month >= 0 && e.month <= 60;
  const life = (keep?.events ?? []).filter((e) => e.type !== "vehicle_replacement" && onRoad(e));
  const swaps = (replace?.events ?? []).filter((e) => e.type === "vehicle_replacement" && onRoad(e)).sort((a, b) => a.month - b.month);
  return { compared, keep, replace, life, swaps, events: [...life, ...swaps] };
}
const cost60 = (s: ForkState, id: string | undefined) => (id ? s.results[id]?.points.find((p) => p.month === 60)?.netEconomicCost : undefined);
const costAt = (s: ForkState, id: string | undefined, month: number) => (id ? s.results[id]?.points.find((p) => p.month === month)?.netEconomicCost : undefined);
const fullName = (v: { year: number; model: string; trim: string }) => [v.year, v.model, v.trim].filter((p) => p !== "" && p !== undefined).join(" ");

/** Every confirmed event in a future you can see (the one you are in, and the two being compared). */
function eventsInView(s: ForkState): LifeEvent[] {
  const ids = [s.activeScenarioId, s.comparison?.keepId, s.comparison?.replaceId];
  return ids.flatMap((id) => s.explore.scenarios.find((x) => x.id === id)?.events ?? []).filter((e) => e.status === "confirmed");
}

const ACTS: Act[] = [
  // ---- starting, the car page, the command bar (as before) ----
  { name: "startFromVin", weight: 3, when: clear, run: async (r) => { const vin = pick(r, [demoVins.camry.primary, demoVins.rav4.primary, demoVins.camry.backup, "ABC", "4T1G11AK2NU900001"]); await actions().startFromVin(vin); return vin; } },
  { name: "startFromSample", weight: 1.5, when: clear, run: async (r) => { const id = pick(r, ["camry-2022-se", "rav4-2024-hybrid-xle", "nope"]); await actions().startFromSample(id); return id; } },
  { name: "startFromPicker", weight: 1, when: clear, run: async (r) => { const c = pick(r, [["Toyota", "Camry", 2022, "SE"], ["Toyota", "RAV4", 2024, "Hybrid XLE"], ["Honda", "Civic", 2020, undefined]] as const); await actions().startFromPicker(c[0], c[1], c[2], c[3]); } },
  { name: "answerRiders", weight: 6, when: () => state().twin !== null, run: (r) => { const c = pick(r, ["solo", "partner", "kids", "mixed"] as const); actions().answerRiders(c); return c; } },
  { name: "skip", weight: 3, when: () => phase() === "reveal", run: () => actions().skip() },
  { name: "replayReveal", weight: 2, when: () => inWork() && !state().ui.drawer, run: () => actions().replayReveal() },
  { name: "tick", weight: 8, when: () => true, run: async (r) => { const ms = pick(r, [0, 16, 250, 500, 1000, 1900, 2100, 4100, 9000, 15000]); const before = state(); await advance(ms); checkPlayback(before, state()); return `${ms}ms`; } },
  { name: "watch it play", weight: () => (onFuture() && state().ui.playing ? 30 : 0), when: () => onFuture() && state().ui.playing,
    run: async (r) => { const ms = pick(r, [200, 900, 2500, 6000, 12000]); const before = state(); await advance(ms); checkPlayback(before, state()); return `${ms}ms`; } },
  { name: "submitDump", weight: 8, when: inWork, run: async (r) => { const t = pick(r, SENTENCES); await actions().submitDump(t); return t.slice(0, 40); } },
  { name: "submitDump twice", weight: 2, when: inWork, run: async (r) => { const t = pick(r, SENTENCES); await actions().submitDump(t); await actions().submitDump(t); return t.slice(0, 40); } },
  { name: "confirmDrafts", weight: 8, when: () => inWork() && state().explore.draftChanges.length > 0, run: (r) => { const ids = state().explore.draftChanges.map((d) => d.id).filter(() => r() < 0.75); actions().confirmDrafts(ids.length ? ids : [state().explore.draftChanges[0].id]); return `${ids.length}`; } },
  { name: "addDraft", weight: 7, when: inWork, run: (r) => { const e = pick(r, EVENTS); actions().addDraft({ ...e, month: r() < 0.3 ? Math.floor(r() * 61) : e.month }); return e.type; } },
  { name: "rejectDraft", weight: 2, when: () => state().explore.draftChanges.length > 0, run: (r) => actions().rejectDraft(pick(r, state().explore.draftChanges).id) },
  { name: "editDraft", weight: 2, when: () => state().explore.draftChanges.length > 0, run: (r) => actions().editDraft(pick(r, state().explore.draftChanges).id, { month: Math.floor(r() * 61) }) },
  { name: "answerQuestion", weight: 3, when: () => state().question !== null, run: (r) => { const q = state().question!; const v = pick(r, ["unsure", 3, 25000, "high", -5] as const); actions().answerQuestion(q.field, v as never); return `${q.field}=${v}`; } },
  { name: "answerFinance", weight: 3, when: inWork, run: (r) => { const v = pick(r, ["paid_off", "loan", "lease", "unknown"] as const); actions().answerQuestion("financeType", v as never); return v; } },
  { name: "pickTradeoff", weight: 2, when: inWork, run: (r) => actions().pickTradeoff({ pairId: pick(r, ["cost_vs_cargo", "longevity_vs_fuel", "comfort_vs_cost"] as const), choice: pick(r, ["A", "B"] as const) }) },
  { name: "compare", weight: () => (onFuture() ? 6 : 4), when: inWork, run: async () => { await actions().openReplaceComparison(); } },
  { name: "compare (header button)", weight: 5, when: () => free() && !state().comparison && !!compareButton(), run: () => { press(compareButton()); } },
  { name: "compare (the other road)", weight: 5, when: () => free() && !state().comparison && qa("destination").some((d) => d.getAttribute("data-future") === "switch"), run: () => { press(qa("destination").find((d) => d.getAttribute("data-future") === "switch")); } },
  { name: "applyTerms", weight: 2, when: () => inWork() && state().comparison !== null && !state().ui.drawer, run: (r) => actions().applyScenarioTerms({ [pick(r, TERM_KEYS)]: pick(r, [0.01, 5, 1000, 40000]) }) },
  { name: "resetTerms", weight: 1, when: () => inWork() && !state().ui.drawer, run: () => actions().resetScenarioTerms() },
  { name: "runBreakEven", weight: 2, when: () => inWork() && state().comparison !== null, run: (r) => actions().runBreakEven(pick(r, ["annualMiles", "fuelPricePerGal"] as const)) },
  { name: "moveEvent", weight: 4, when: () => inWork() && !state().ui.drawer && state().explore.scenarios.some((s) => s.events.length > 0), run: (r) => { const sc = pick(r, state().explore.scenarios.filter((s) => s.events.length > 0)); const ev = pick(r, sc.events); actions().moveEvent(sc.id, ev.id, Math.floor(r() * 61)); return `${ev.type}`; } },
  { name: "setView", weight: () => (state().ui.playing ? 14 : 6), when: () => inWork() && clear(), run: (r) => { const v = r() < (state().ui.view === "car" ? 0.7 : 0.35) ? "future" : "car"; actions().setView(v); return v; } },
  { name: "setDetailsOpen", weight: 2, when: () => inWork() && !state().ui.drawer, run: (r) => { const on = r() < 0.6; actions().setDetailsOpen(on); return String(on); } },
  { name: "transitionDone", weight: 2, when: () => state().stage.phase === "transition", run: () => actions().onTransitionComplete() },
  { name: "resetAll", weight: 1, when: () => state().twin !== null && !state().ui.drawer, run: () => actions().resetAll() },

  // ---- the Future page: the one clock ----
  { name: "scrub (store)", weight: () => (onFuture() ? 6 : 0), when: () => onFuture() && (clear() || state().ui.drawer === "costs"), looks: () => true,
    run: (r) => { const m = r() < 0.85 ? Math.floor(r() * 61) : pick(r, [-10, 80, 12.6, 59.5, Number.NaN]); actions().setActiveMonth(m); return String(m); } },
  { name: "scrub (slider)", weight: () => (onFuture() ? 6 : 0), when: () => free() && !!slider(), looks: () => true,
    run: (r) => { const m = Math.floor(r() * 61); fireEvent.change(slider() as HTMLInputElement, { target: { value: String(m) } }); if (state().activeMonth !== m) complain(`the slider was moved to ${m} but the month is ${state().activeMonth}`); return String(m); } },
  { name: "scrub (keys)", weight: () => (onFuture() ? 3 : 0), when: () => free() && !!slider(), looks: () => true,
    run: (r) => {
      const key = pick(r, ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"] as const);
      const was = state().activeMonth;
      fireEvent.keyDown(slider() as HTMLInputElement, { key });
      const now = state().activeMonth;
      const want = { ArrowRight: Math.min(60, was + 1), ArrowUp: Math.min(60, was + 1), ArrowLeft: Math.max(0, was - 1), ArrowDown: Math.max(0, was - 1), Home: 0, End: 60, PageUp: Math.min(60, was + 12), PageDown: Math.max(0, was - 12) }[key];
      if (now !== want) complain(`${key} at month ${was} gave month ${now}, expected ${want}`);
      return `${key} ${was}>${now}`;
    } },
  { name: "scrub (along the road)", weight: () => (onFuture() ? 4 : 0), when: () => free() && !!q("road-hit"), looks: () => true,
    run: (r) => {
      const hit = q("road-hit") as unknown as Element;
      const point = (pos: number) => ({ clientX: pos, clientY: pos });
      const a = Math.floor(r() * 1200);
      const type = pick(r, ["mouse", "touch"] as const);
      fireEvent.pointerDown(hit, { ...point(a), pointerId: 1, button: 0, pointerType: type });
      if (r() < 0.6) fireEvent.pointerMove(hit, { ...point(Math.floor(r() * 1200)), pointerId: 1, pointerType: type });
      fireEvent.pointerUp(hit, { ...point(a), pointerId: 1, pointerType: type });
      return `${a}`;
    } },
  { name: "advanceMonth (the player)", weight: () => (onFuture() ? 2 : 0), when: () => onFuture() && clear(), looks: () => true,
    run: (r) => { const m = Math.floor(r() * 61); const was = state().ui.playing; actions().advanceMonth(m); if (state().activeMonth !== m) complain(`advanceMonth(${m}) gave month ${state().activeMonth}`); if (was && m >= 60 && state().ui.playing) complain("playback went on at the end"); return String(m); } },
  { name: "selectEvent (store)", weight: () => (onFuture() ? 5 : 0), when: () => onFuture() && clear(), looks: () => true,
    run: (r) => {
      const known = eventsInView(state());
      const roll = r();
      const before = state();
      if (roll < 0.1 || known.length === 0) {
        const id = pick(r, ["nope", "", "event-that-never-was"]);
        actions().selectEvent(id);
        const now = state();
        if (now.selectedEventId !== before.selectedEventId || now.activeMonth !== before.activeMonth) complain(`selecting "${id}" (not an event) changed the selection or the month`);
        return `bogus "${id}"`;
      }
      if (roll < 0.15) {
        actions().selectEvent(null);
        if (state().selectedEventId !== null) complain("selectEvent(null) did not clear the selection");
        return "null";
      }
      const ev = pick(r, known);
      actions().selectEvent(ev.id);
      const now = state();
      if (now.selectedEventId !== ev.id) complain(`selected ${ev.id} but the store has ${now.selectedEventId}`);
      if (now.activeMonth !== ev.month) complain(`selected an event in month ${ev.month} but the month is ${now.activeMonth}`);
      if (now.ui.playing) complain("selecting an event left playback on");
      return `${ev.type}@${ev.month}`;
    } },
  { name: "selectEvent (click its marker)", weight: () => (onFuture() ? 6 : 0), when: () => free() && qa("event-marker").length > 0, looks: () => true,
    run: (r) => {
      const m = pick(r, qa("event-marker"));
      const id = m.getAttribute("data-event-id");
      const month = Number(m.getAttribute("data-month"));
      fireEvent.click(m);
      if (state().selectedEventId !== id) complain(`clicked the marker of ${id} but ${state().selectedEventId} is selected`);
      if (state().activeMonth !== month) complain(`clicked a marker in month ${month} but the month is ${state().activeMonth}`);
      return `${id}@${month}`;
    } },
  { name: "selectEvent (its label)", weight: () => (onFuture() ? 2 : 0), when: () => free() && qa("event-label").length > 0, looks: () => true,
    run: (r) => { const l = pick(r, qa("event-label")); fireEvent.click(l); if (state().selectedEventId !== l.getAttribute("data-event-id")) complain("clicking a label did not select its event"); return String(l.getAttribute("data-event-id")); } },
  { name: "selectFuture (click a destination)", weight: () => (onFuture() ? 5 : 0), when: () => free() && state().comparison !== null && qa("destination").length === 2, looks: () => state().comparison !== null,
    run: (r) => {
      const want = pick(r, ["keep", "switch"] as const);
      const cmp = state().comparison!;
      const before = state();
      press(qa("destination").find((d) => d.getAttribute("data-future") === want));
      const now = state();
      const id = want === "switch" ? cmp.replaceId : cmp.keepId;
      if (now.activeScenarioId !== id) complain(`picked the ${want} future (${id}) but ${now.activeScenarioId} is selected`);
      if (now.activeMonth !== before.activeMonth) complain(`picking the ${want} future moved the month from ${before.activeMonth} to ${now.activeMonth}`);
      return want;
    } },
  { name: "setActiveScenario (keep or switch)", weight: () => (onFuture() ? 4 : 0), when: () => onFuture() && clear() && state().comparison !== null, looks: () => true,
    run: (r) => {
      const cmp = state().comparison!;
      const id = pick(r, [cmp.keepId, cmp.replaceId]);
      const was = state().activeMonth;
      actions().setActiveScenario(id);
      if (state().activeScenarioId !== id) complain(`setActiveScenario(${id}) left ${state().activeScenarioId} selected`);
      if (state().activeMonth !== was) complain("setActiveScenario moved the month");
      return id;
    } },
  { name: "selectFuture (store: another life)", weight: () => (onFuture() ? 3 : 0), when: () => onFuture() && clear(), run: (r) => { const lives = state().explore.scenarios.filter((s) => !s.events.some((e) => e.type === "vehicle_replacement")); actions().selectFuture(pick(r, lives).id); } },
  { name: "selectFuture (the selector)", weight: () => (onFuture() ? 6 : 0), when: () => free() && !!q("future-selector"), run: (r) => { const sel = q("future-selector") as unknown as HTMLSelectElement; const opts = [...sel.options].map((o) => o.value); const v = pick(r, opts); fireEvent.change(sel, { target: { value: v } }); return v; } },
  { name: "play", weight: () => (onFuture() ? 4 : 0), when: () => onFuture() && (clear() || state().ui.drawer === "costs"), looks: () => true,
    run: async (r) => {
      const was = state().activeMonth;
      if (free() && r() < 0.6) press(buttonIn(document.body, /^Play$/));
      else actions().play();
      const now = state();
      if (!now.ui.playing) complain("play did not start playback");
      if (now.ui.drawer !== null) complain(`playing left the ${now.ui.drawer} drawer open`);
      if (was >= 60 && now.activeMonth !== 0) complain(`play at the end started from month ${now.activeMonth}, not the beginning`);
      const before = state();
      await advance(pick(r, [20, 300, 2500, 13000]));
      checkPlayback(before, state());
    } },
  { name: "pause", weight: () => (onFuture() ? 25 : 0), when: () => onFuture() && clear() && state().ui.playing, looks: () => true,
    run: (r) => { if (free() && r() < 0.6) press(buttonIn(document.body, /^Pause$/)); else actions().pause(); if (state().ui.playing) complain("pause did not stop playback"); } },

  // ---- drawers ----
  { name: "openDrawer (store)", weight: () => (onFuture() ? (state().ui.playing ? 14 : 4) : 0), when: () => onFuture(), looks: () => true,
    run: (r) => { const id = pick(r, ["explain", "costs", "recommendation"] as const); actions().openDrawer(id); if (state().ui.drawer !== id) complain(`openDrawer(${id}) left ${state().ui.drawer}`); if (state().ui.playing) complain("opening a drawer left playback on"); return id; } },
  { name: "open a drawer (its button)", weight: () => (onFuture() ? (state().ui.playing ? 14 : 5) : 0), when: () => free(), looks: () => true,
    run: async (r) => {
      const opts: Array<[DrawerId, () => HTMLElement | null]> = [
        ["costs", () => buttonIn(q("journey-header"), /^Compare costs$/) ?? null],
        ["recommendation", () => q("journey-heading")],
        ["recommendation", () => q("journey-next")],
        ["explain", () => buttonIn(q("event-card"), /^Explain this$/) ?? null],
      ];
      const found = opts.filter(([, find]) => find());
      if (found.length === 0) return "none on screen";
      const [id, find] = pick(r, found);
      press(find());
      if (state().ui.drawer !== id) complain(`pressed the button for the ${id} drawer but ${state().ui.drawer} is open`);
      if (state().ui.playing) complain("opening a drawer left playback on");
      return id;
    } },
  { name: "closeDrawer (store)", weight: () => (onFuture() ? 3 : 0), when: () => state().ui.drawer !== null, looks: () => true, run: () => { actions().closeDrawer(); if (state().ui.drawer !== null) complain("closeDrawer left a drawer open"); } },
  { name: "close a drawer (its button, the dim layer or Escape)", weight: () => (onFuture() ? 5 : 0), when: () => state().ui.drawer !== null && openDrawers().length > 0, looks: () => true,
    run: (r) => {
      const how = pick(r, ["button", "dim", "escape"] as const);
      const dialog = openDrawers()[0];
      if (how === "button") press(dialog.querySelector('button[aria-label="Close"]'));
      else if (how === "dim") press(q("drawer-dim"));
      else fireEvent.keyDown(document.body, { key: "Escape" });
      if (state().ui.drawer !== null) complain(`closing the drawer with ${how} left ${state().ui.drawer} open`);
      return how;
    } },
  { name: "drawer: its own month slider", weight: () => (state().ui.drawer === "costs" ? 3 : 0), when: () => state().ui.drawer === "costs" && openDrawers().some((d) => d.querySelector('input[type="range"]')), looks: () => true,
    run: (r) => { const input = openDrawers()[0].querySelector('input[type="range"]') as HTMLInputElement; const m = Math.floor(r() * 61); fireEvent.change(input, { target: { value: String(m) } }); return String(m); } },
  { name: "drawer: compare from inside it", weight: () => (state().ui.drawer ? 2 : 0), when: () => state().ui.drawer !== null && !state().comparison && openDrawers().some((d) => !!buttonIn(d, COMPARE_LABEL)),
    run: () => { press(buttonIn(openDrawers()[0], COMPARE_LABEL)); } },
  { name: "drawer: what would change it", weight: () => (state().ui.drawer === "recommendation" ? 2 : 0), when: () => state().ui.drawer === "recommendation" && openDrawers().some((d) => !!buttonIn(d, /^Show what would change it$/)),
    run: () => { press(buttonIn(openDrawers()[0], /^Show what would change it$/)); } },

  // ---- the window ----
  { name: "resize the window", weight: () => (onFuture() ? 3 : 1), when: () => state().twin !== null, run: (r) => { const w = pick(r, [360, 420, 639, 640, 760, 1120, 1440]); resizeTo(w); return `${w}px`; } },
];

// ---- what must always be true of the data ----
function dataProblems(before: ForkState): string[] {
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
    const upTo = (x: Scenario) => x.events.filter((e) => e.month < sc.forkMonth && e.type !== "vehicle_replacement").map(key).sort();
    if (JSON.stringify(upTo(sc)) !== JSON.stringify(upTo(parent))) out.push(`${sc.id} does not hold its parent's life before month ${sc.forkMonth}: it was not updated when ${parent.id} changed`);
  }
  const draftKeys = s.explore.draftChanges.map((d) => JSON.stringify([d.type, d.month, d.payload]));
  if (new Set(draftKeys).size !== draftKeys.length) out.push("the same change is waiting twice to be confirmed");
  const draftIds = s.explore.draftChanges.map((d) => d.id);
  if (new Set(draftIds).size !== draftIds.length) out.push(`duplicate draft ids: ${draftIds.join(", ")}`);
  if (s.explore.draftChanges.some((d) => d.status !== "proposed")) out.push("a draft that is not proposed");

  // ---- the one clock ----
  if (!Number.isInteger(s.activeMonth) || s.activeMonth < 0 || s.activeMonth > 60) out.push(`activeMonth ${s.activeMonth} is not a whole month from 0 to 60`);
  if (s.selectedEventId !== null) {
    const found = eventsInView(s).some((e) => e.id === s.selectedEventId);
    if (!found) out.push(`selectedEventId ${s.selectedEventId} is not a confirmed event in a future you can see (looking at ${s.activeScenarioId}${s.comparison ? `, comparing ${s.comparison.keepId} and ${s.comparison.replaceId}` : ""})`);
  }
  const showingFuture = s.phase === "workspace" && s.ui.view === "future";
  if (s.ui.drawer !== null && !["explain", "costs", "recommendation"].includes(s.ui.drawer)) out.push(`ui.drawer is ${String(s.ui.drawer)}`);
  if (!showingFuture && s.ui.drawer !== null) out.push(`the ${s.ui.drawer} drawer is open but the Future page is not showing (phase ${s.phase}, view ${s.ui.view})`);
  if (!showingFuture && s.ui.playing) out.push(`playback is on but the Future page is not showing (phase ${s.phase}, view ${s.ui.view})`);
  if (s.ui.drawer !== null && s.ui.playing) out.push(`playing while the ${s.ui.drawer} drawer is open`);
  if (s.ui.playing && s.activeMonth >= 60) out.push("playing at month 60: playback should have stopped at the end");
  // revision counts recalculations: it never goes back inside one visit, and it only goes up when there are new results
  if (before.twin === s.twin) {
    if (s.revision < before.revision) out.push(`revision went back from ${before.revision} to ${s.revision}`);
    if (s.revision > before.revision && s.results === before.results) out.push(`revision went up (${before.revision} to ${s.revision}) with no new results`);
    if (s.revision === before.revision && s.results !== before.results) out.push(`there are new results but revision is still ${s.revision}`);
  }

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
  // The car on the car page is the car in the future you are looking at, at the month you are looking at. (The stage is
  // hidden on the Future page and catches up when you come back to the car, so it is the car page that must agree.)
  if (s.phase === "workspace" && s.twin && s.ui.view === "car" && s.stage.phase === "interactive") {
    const sc = s.explore.scenarios.find((x) => x.id === s.activeScenarioId);
    if (sc) {
      const want = vehicleAtMonth(sc, s.twin, s.activeMonth);
      if (s.activeVehicleId !== want) out.push(`${sc.id} at month ${s.activeMonth} is in the ${want}, but the car page shows the ${s.activeVehicleId}`);
    }
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
      const lifeOfScenario = (x: Scenario) => JSON.stringify(x.events.filter((e) => e.type !== "vehicle_replacement").map((e) => [e.id, e.month, e.payload]).sort());
      if (keep && rep && lifeOfScenario(keep) !== lifeOfScenario(rep)) out.push(`the two cars are compared over different lives: keep ${keepId} and replace ${replaceId} do not hold the same events`);
    }
  } else if (s.evaluation && s.phase === "workspace") out.push("a verdict with no comparison");
  if (s.ui.busy !== "idle") out.push(`still busy: ${s.ui.busy}`);
  return out;
}

/** After an action that only moves around what is already worked out: nothing that was worked out may change. */
function lookingProblems(before: ForkState): string[] {
  const s = state();
  const out: string[] = [];
  if (s.twin !== before.twin) return out; // a new car is a new session
  if (s.results !== before.results) out.push("looking around recalculated: the results are new");
  if (s.revision !== before.revision) out.push(`looking around changed the revision (${before.revision} to ${s.revision})`);
  if (s.evaluation !== before.evaluation) out.push("looking around changed the verdict");
  if (s.comparison !== before.comparison) out.push("looking around changed the comparison");
  if (s.explore.scenarios !== before.explore.scenarios) out.push("looking around changed the futures");
  if (s.explore.confirmedProfile !== before.explore.confirmedProfile) out.push("looking around changed the confirmed profile");
  for (const id of [s.comparison?.keepId, s.comparison?.replaceId, s.activeScenarioId]) {
    const a = cost60(before, id);
    const b = cost60(s, id);
    if (a !== b) out.push(`the five year cost of ${id} changed from ${a} to ${b} just by looking`);
  }
  return out;
}

const rectOf = (el: HTMLElement) => {
  const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(el.style.transform);
  return { x: m ? Number(m[1]) : Number.parseFloat(el.style.left), y: m ? Number(m[2]) : Number.parseFloat(el.style.top), w: Number.parseFloat(el.style.width), h: Number.parseFloat(el.style.height) };
};
const meet = (a: ReturnType<typeof rectOf>, b: ReturnType<typeof rectOf>) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

// ---- what must always be true of the screen, given the data ----
function screenProblems(): string[] {
  const s = state();
  const out: string[] = [];
  const text = document.body.textContent ?? "";
  for (const bad of [/NaN/, /undefined/, /Infinity/, /\[object/, /\$-/, /\bnull\b/]) if (bad.test(text)) out.push(`the screen says ${bad}: ...${(text.match(new RegExp(`.{0,30}${bad.source}.{0,30}`)) ?? [""])[0]}...`);
  if (document.querySelector('[data-source="none"]')) out.push("a number on screen with no source label");
  const readable = [text, ...[...document.querySelectorAll("[title], [aria-label], [placeholder], [alt], [aria-valuetext]")].flatMap((el) => ["title", "aria-label", "placeholder", "alt", "aria-valuetext"].map((a) => el.getAttribute(a) ?? ""))].join("\n");
  if (/demo|data/i.test(readable)) out.push(`the screen says demo or data: ...${(readable.match(/.{0,30}(demo|data).{0,30}/i) ?? [""])[0]}...`);

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

  if (s.phase === "workspace" && s.ui.view === "future") out.push(...futureProblems(s));
  else {
    // off the Future page, none of it is on screen
    if (q("journey-timeline")) out.push("the road is on screen off the Future page");
    if (openDrawers().length > 0) out.push("a Future drawer is open off the Future page");
  }
  return out;
}

/** The Future page against the store: every figure, month, heading and drawer has to say what the engine and the clock say. */
function futureProblems(s: ForkState): string[] {
  const out: string[] = [];
  const timeline = q("journey-timeline");
  if (!timeline) return ["future page with no road"];
  const road = roadFor(s);
  const month = s.activeMonth;
  if (!road.keep) return ["future page with no future to show"];

  // ---- the clock: the same month everywhere ----
  if (timeline.getAttribute("data-month") !== String(month)) out.push(`the road says month ${timeline.getAttribute("data-month")} but the clock is at ${month}`);
  const marker = q("time-marker");
  if (!marker) out.push("no time marker on the road");
  else if (marker.getAttribute("data-month") !== String(month)) out.push(`the time marker is at month ${marker.getAttribute("data-month")} but the clock is at ${month}`);
  const range = slider();
  if (!range) out.push("no month slider");
  else if (range.value !== String(month)) out.push(`the slider reads ${range.value} but the clock is at ${month}`);

  // ---- the five year costs: beside each destination, from the engine's month 60, whatever month is selected ----
  const destinations = qa("destination");
  const dest = (kind: string) => destinations.find((d) => d.getAttribute("data-future") === kind);
  const keepId = road.keep.id;
  const keepCost = cost60(s, keepId);
  const keepEl = dest("keep");
  if (!keepEl) out.push("no keep destination");
  else if (keepCost !== undefined && !(keepEl.textContent ?? "").includes(usd(keepCost))) out.push(`the keep destination says "${keepEl.textContent}" but the engine says ${usd(keepCost)} for ${keepId}`);
  const switchEl = dest("switch");
  const replaceCost = road.compared ? cost60(s, road.replace?.id) : undefined;
  if (road.compared) {
    if (!switchEl) out.push("compared, but no switch destination");
    else if (replaceCost !== undefined && !(switchEl.textContent ?? "").includes(usd(replaceCost))) out.push(`the switch destination says "${switchEl.textContent}" but the engine says ${usd(replaceCost)} for ${road.replace?.id}`);
    if (destinations.length !== 2) out.push(`compared, with ${destinations.length} destinations`);
  } else if (switchEl && /\$/.test(switchEl.textContent ?? "")) out.push(`a cost on the switch destination before comparing: "${switchEl.textContent}"`);

  // ---- the heading is the engine's call ----
  const heading = q("journey-heading");
  const h1 = document.querySelector("h1")?.textContent ?? "";
  if (road.compared && s.evaluation) {
    const pref = s.evaluation.preferredScenarioId;
    const text = heading?.textContent ?? "";
    if (pref === "inconclusive") { if (text !== "Close call") out.push(`a close call whose heading is "${text}"`); }
    else if (pref === road.keep.id) { if (!/^Keep your/.test(text)) out.push(`the engine picked keeping but the heading is "${text}"`); }
    else if (pref === road.replace?.id) { if (!/^Switch to/.test(text)) out.push(`the engine picked switching but the heading is "${text}"`); }
  } else {
    if (heading) out.push(`a recommendation heading ("${heading.textContent}") with no comparison`);
    if (!/Your next five years/.test(h1)) out.push(`before comparing the heading is "${h1}"`);
    if (q("journey-next")) out.push("a next step on screen with no comparison");
  }

  // ---- the difference line is the two rounded costs ----
  const diff = q("journey-difference")?.textContent ?? "";
  if (road.compared && keepCost !== undefined && replaceCost !== undefined) {
    const gap = Math.round(replaceCost) - Math.round(keepCost);
    if (gap > 0 && !diff.includes(`Switching adds ${usd(gap)}`)) out.push(`switching costs ${usd(gap)} more but the line says "${diff}"`);
    if (gap < 0 && !diff.includes(`Switching saves ${usd(-gap)}`)) out.push(`switching costs ${usd(-gap)} less but the line says "${diff}"`);
    if (gap === 0 && /Switching (adds|saves)/.test(diff)) out.push(`the two costs are the same but the line says "${diff}"`);
  } else if (/Switching (adds|saves)/.test(diff)) out.push(`a difference ("${diff}") with nothing to compare`);

  // ---- the road: the split is the swap, events are where they happened ----
  const pathSwitch = q("road-path-switch");
  const swapMonth = road.swaps.length > 0 ? road.swaps[0].month : null;
  if (road.compared) {
    if (!pathSwitch) out.push("compared, but no switch path on the road");
    else {
      const split = pathSwitch.getAttribute("data-split-month");
      if (swapMonth !== null && split !== String(swapMonth)) out.push(`the swap is in month ${swapMonth} but the switch path leaves in month ${split}`);
      if (pathSwitch.getAttribute("data-dashed") !== "false") out.push("a priced switch path drawn dashed");
    }
  } else if (pathSwitch && pathSwitch.getAttribute("data-dashed") !== "true") out.push("an unpriced switch drawn as a real path");
  const wantSelected = road.compared && s.activeScenarioId === s.comparison?.replaceId ? "switch" : "keep";
  if (q("road-path-keep")?.getAttribute("data-selected") !== String(wantSelected === "keep")) out.push(`the ${wantSelected} future is selected but the keep path says data-selected=${q("road-path-keep")?.getAttribute("data-selected")}`);

  const markers = qa("event-marker");
  const markerIds = markers.map((m) => m.getAttribute("data-event-id"));
  if (new Set(markerIds).size !== markerIds.length) out.push("an event is on the road twice");
  const wantIds = road.events.map((e) => e.id).sort();
  if (JSON.stringify([...markerIds].sort()) !== JSON.stringify(wantIds)) out.push(`the road shows events [${[...markerIds].sort().join(", ")}] but the futures hold [${wantIds.join(", ")}]`);
  for (const m of markers) {
    const id = m.getAttribute("data-event-id");
    const ev = road.events.find((e) => e.id === id);
    if (!ev) continue;
    if (m.getAttribute("data-month") !== String(ev.month)) out.push(`the marker of ${id} is at month ${m.getAttribute("data-month")} but the event is in month ${ev.month}`);
    // a life event is the same month in both futures
    if (ev.type !== "vehicle_replacement" && road.replace) {
      const twin = road.replace.events.find((e) => e.id === ev.id);
      if (!twin) out.push(`the life event ${ev.id} (${ev.type}) is in the keep future but not in the switch future`);
      else if (twin.month !== ev.month) out.push(`the life event ${ev.id} is in month ${ev.month} when you keep and month ${twin.month} when you switch`);
    }
  }
  if (road.swaps.length > 0 && !markers.some((m) => m.getAttribute("data-event-id") === road.swaps[0].id)) out.push("the swap has no marker");

  // ---- the selected event ----
  const pressed = markers.filter((m) => m.getAttribute("aria-pressed") === "true");
  const card = q("event-card");
  const selected = s.selectedEventId !== null ? road.events.find((e) => e.id === s.selectedEventId) : undefined;
  if (selected) {
    if (pressed.length !== 1 || pressed[0].getAttribute("data-event-id") !== selected.id) out.push(`${selected.id} is selected but the road marks ${pressed.map((m) => m.getAttribute("data-event-id")).join(", ") || "nothing"}`);
    const title = q("event-card-title")?.textContent;
    const label = pressed[0]?.getAttribute("aria-label") ?? "";
    if (!title) out.push(`${selected.id} is selected but the card shows no event`);
    else if (!label.startsWith(title + ", ")) out.push(`the card says "${title}" but the selected marker is "${label}"`);
    if (card?.getAttribute("data-state") !== "event") out.push("an event is selected but the card is not showing it");
  } else {
    if (pressed.length > 0) out.push("a marker is pressed with no event selected");
    if (card?.getAttribute("data-state") !== "moment") out.push("no event is selected but the card is not showing the moment");
    if (q("event-card-title")) out.push("an event title on the card with no event selected");
  }

  // ---- the scrubber: the car and the cost through this month ----
  const sc = s.explore.scenarios.find((x) => x.id === s.activeScenarioId);
  const readout = document.querySelector('[data-slot="vehicle"]')?.textContent ?? "";
  if (s.twin && sc) {
    const car = vehicleById(s, vehicleAtMonth(sc, s.twin, month));
    if (car && readout !== fullName(car)) out.push(`at month ${month} in ${sc.id} the car is the ${fullName(car)} but the scrubber says "${readout}"`);
  }
  const branchId = wantSelected === "switch" ? road.replace?.id : road.keep.id;
  const through = document.querySelector('[data-slot="through"]')?.textContent ?? "";
  const throughCost = month === 0 ? 0 : costAt(s, branchId, month);
  if (throughCost !== undefined && through !== "" && !through.includes(usd(throughCost))) out.push(`through month ${month} the engine says ${usd(throughCost)} for ${branchId} but the scrubber says "${through}"`);
  if (document.querySelector('[data-testid="journey-updating"]')?.textContent) out.push("the page says Updating when nothing is being worked out");

  // ---- the highlight on what just changed does not outstay RECENT_MS ----
  if (s.lastChange && Date.now() - s.lastChange.at >= RECENT_MS + 1 && markers.some((m) => m.getAttribute("data-changed") === "true")) out.push(`an event is still highlighted ${Date.now() - s.lastChange.at}ms after the change`);

  // ---- drawers: one at most, the right one, and none when none is asked for ----
  const open = openDrawers();
  if (s.ui.drawer === null) {
    if (open.length > 0) out.push(`a drawer is open ("${open[0].getAttribute("aria-label")}") but ui.drawer is null`);
  } else if (open.length !== 1) out.push(`ui.drawer is ${s.ui.drawer} but ${open.length} drawers are open`);
  else {
    const title = open[0].getAttribute("aria-label") ?? "";
    if (s.ui.drawer === "costs" && title !== "Compare costs") out.push(`the costs drawer is called "${title}"`);
    if (s.ui.drawer === "explain") {
      const want = selected ? q("event-card-title")?.textContent : "This moment";
      if (title !== want) out.push(`the explain drawer is called "${title}" but the selection says "${want}"`);
    }
    if (s.ui.drawer === "recommendation") {
      if (heading) { if (title !== heading.textContent) out.push(`the recommendation drawer is called "${title}" but the heading says "${heading.textContent}"`); }
      else if (!["Keep or switch?", "No clear answer yet"].includes(title)) out.push(`the recommendation drawer, with nothing recommended, is called "${title}"`);
    }
    if ((q("drawer-body")?.textContent ?? "").trim() === "") out.push(`the ${s.ui.drawer} drawer is open and empty`);
  }

  // ---- the future selector shows the future you are in ----
  const selector = q("future-selector") as unknown as HTMLSelectElement | null;
  if (selector && sc && selector.value !== lifeOf(s, sc).id) out.push(`the selector shows ${selector.value} but you are in ${lifeOf(s, sc).id}`);

  // ---- nothing overlaps: labels with labels, labels with the destinations ----
  const labels = qa("event-label").map((el) => ({ id: el.getAttribute("data-event-id"), rect: rectOf(el) }));
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) if (meet(labels[i].rect, labels[j].rect)) out.push(`the labels of ${labels[i].id} and ${labels[j].id} overlap`);
    for (const d of destinations) if (meet(labels[i].rect, rectOf(d))) out.push(`the label of ${labels[i].id} overlaps the ${d.getAttribute("data-future")} destination`);
  }
  return out;
}

// What the sessions actually did, so a quiet run can be told from an empty one.
const coverage: Record<string, number> = {};
const seen = (k: string) => (coverage[k] = (coverage[k] ?? 0) + 1);

function noteStates(before: ForkState, actName: string) {
  const st = state();
  const future = st.phase === "workspace" && st.ui.view === "future";
  if (future) seen("state: on the future page");
  if (st.comparison) seen("state: compared");
  if (st.comparison && future) seen("state: compared, on the future page");
  if (st.explore.scenarios.length > 2) seen("state: three or more futures");
  if (st.explore.scenarios.some((x) => x.parentId && x.parentId !== BASE_ID && !x.id.includes("replace"))) seen("state: a future branched from a future");
  if (st.phase === "reveal" && Object.keys(st.results).length > 0) seen("state: replayed reveal with results kept");
  if (!future) return;
  const road = roadFor(st);
  if (st.activeMonth > 0) seen("state: scrubbed away from month 0");
  if (st.activeMonth === 60) seen("state: at month 60");
  if (st.selectedEventId !== null) seen("state: an event is selected");
  if (st.selectedEventId !== null && road.swaps.some((e) => e.id === st.selectedEventId)) seen("state: the swap is selected");
  if (road.compared && st.activeScenarioId === st.comparison?.replaceId) seen("state: the switch future is selected");
  if (road.compared && st.activeScenarioId === st.comparison?.keepId) seen("state: the keep future is selected");
  if (road.compared && st.twin && st.activeMonth >= (road.swaps[0]?.month ?? 99) && st.activeScenarioId === st.comparison?.replaceId) seen("state: switch future, at or after the swap (the other car)");
  if (road.compared && road.swaps.length > 0 && st.activeMonth < road.swaps[0].month && st.activeScenarioId === st.comparison?.replaceId) seen("state: switch future, before the swap (your car)");
  if (road.events.length >= 3) seen("state: three or more events on the road");
  if (new Set(road.events.map((e) => e.month)).size < road.events.length) seen("state: two events share a month");
  if (st.ui.playing) seen("state: playing");
  if (before.ui.playing && !st.ui.playing && st.activeMonth === 60 && /tick|play/.test(actName)) seen("state: playback ran to the end and stopped");
  if (before.ui.playing && !st.ui.playing && /scrub|selectEvent|selectFuture|setActiveScenario|open|closeDrawer|pause/.test(actName)) seen("state: playback stopped by a manual move");
  if (st.ui.drawer) seen(`state: drawer open: ${st.ui.drawer}`);
  if (before.ui.drawer && st.ui.drawer && before.ui.drawer !== st.ui.drawer) seen("state: drawer swapped for another");
  if (before.ui.drawer && !st.ui.drawer) seen("state: drawer closed");
  if (qa("event-marker").some((m) => m.getAttribute("data-changed") === "true")) seen("state: a change is highlighted on the road");
  if (before.lastChange && before.lastChange === st.lastChange && Date.now() - st.lastChange.at >= RECENT_MS && Date.now() - before.lastChange.at - 1 < RECENT_MS + 20_000 && /tick/.test(actName)) seen("state: a highlight ran out");
  if (openDrawers().some((d) => d.getAttribute("data-placement") === "bottom")) seen("state: a drawer is a bottom sheet");
  if (openDrawers().some((d) => d.getAttribute("data-placement") === "right")) seen("state: a drawer is a side panel");
  const orientation = q("journey-timeline")?.getAttribute("data-orientation");
  if (orientation) seen(`state: the road is ${orientation}`);
  if (st.breakEven) seen("state: what would change it is worked out");
  if (!road.compared && qa("destination").length === 2) seen("state: the offer (switch not priced yet)");
}

const origError = console.error;
let errors: string[];

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.stubGlobal("matchMedia", matchMediaStub);
  viewport = 0;
  observers.clear();
  mediaListeners.clear();
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
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("random sessions: the screen always agrees with the data", () => {
  for (let k = 0; k < SEQS; k++) {
    const seed = SEED0 + k;
    const known = KNOWN_BY_SEED.get(seed);
    const title = known ? `seed ${seed} (known bug in the app: ${known})` : `seed ${seed}`;
    it.skipIf(known !== undefined && !RUN_KNOWN)(title, async () => {
      const r = mulberry32(seed);
      render(<ForkApp />);
      await act(async () => { await advance(0); });
      const log: string[] = [];
      const problems: string[] = [];
      // every session starts by opening a car, like a person would
      await act(async () => { await actions().startFromVin(demoVins.camry.primary); await advance(4100); });
      log.push("open camry");
      for (let i = 0; i < STEPS && problems.length === 0; i++) {
        const usable = ACTS.filter((a) => a.when() && weigh(a) > 0);
        const total = usable.reduce((n, a) => n + weigh(a), 0);
        let roll = r() * total;
        const a = usable.find((x) => (roll -= weigh(x)) < 0) ?? usable[0];
        let note: string | void = "";
        const before = state();
        const onlyLooking = a.looks?.() ?? false;
        actProblems = [];
        try {
          await act(async () => { note = await a.run(r); });
        } catch (e) {
          problems.push(`${a.name} threw: ${e instanceof Error ? e.message : String(e)}`);
        }
        log.push(`${a.name}${note ? ` (${note})` : ""}`);
        seen(`action: ${a.name}`);
        noteStates(before, a.name);
        if (problems.length === 0) {
          const found = [
            ...actProblems.map((p) => `action: ${p}`),
            ...dataProblems(before).map((p) => `data: ${p}`),
            ...(onlyLooking ? lookingProblems(before).map((p) => `data: ${p}`) : []),
            ...screenProblems().map((p) => `screen: ${p}`),
            ...errors.splice(0).map((e) => `console error: ${e}`),
          ];
          problems.push(...found.filter((p) => !KNOWN_SIGNATURES.some((re) => re.test(p))));
        }
      }
      expect(problems, `seed ${seed}\nsteps: ${log.join(" > ")}`).toEqual([]);
    }, 120_000);
  }
});

if (process.env.FUZZ_COVERAGE) {
  describe("coverage", () => {
    it("prints what the sessions did", () => {
      process.stderr.write(`\n${Object.entries(coverage).sort().map(([k, v]) => `${v}\t${k}`).join("\n")}\n`);
    });
  });
}
