import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InterpretResult, LifeEvent, VehicleConfig } from "@/contracts";
import { ai, data, decision, sim } from "@/ui/mocks";
import { ForkApp } from "@/ui/shell/ForkApp";
import { eventTitle } from "@/ui/store/eventLabels";
import { resetForkStoreForTests, simulationInputs, useForkStore } from "@/ui/store/useForkStore";
import { rectsIntersect, type Rect } from "./roadGeometry";
import { selectJourney } from "./useJourney";

/**
 * Section 8 of docs/handoffs/FUTURE-TIMELINE-SPEC.md as a checklist, proved through the real app: <ForkApp/>, the real
 * store, the real simulation and decision engine, and the real offline reader (no network, so the plain rules read what
 * is typed). Every expected number is read from the store's results and evaluation or recomputed by the engine, never typed.
 */

const state = () => useForkStore.getState();
const actions = () => useForkStore.getState().actions;
const EM_DASH = String.fromCharCode(0x2014);
const ALEX_CAMRY_VIN = "4T1G11AK1NU900001";
const SPRING_SENTENCE = "I'm moving to Denver next year and expecting my second child in spring 2029";

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  resetForkStoreForTests();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ---- driving the real UI -------------------------------------------------------------------------------------------

async function openApp() {
  render(<ForkApp />);
  await advance(0);
  fireEvent.change(screen.getByPlaceholderText("Enter your VIN"), { target: { value: ALEX_CAMRY_VIN } });
  fireEvent.click(screen.getByRole("button", { name: "Decode VIN" }));
  await advance(0);
  await advance(4100);
}

/** Type a sentence in the chat box and send it, like a person. */
async function ask(text: string) {
  fireEvent.change(screen.getByPlaceholderText(/tell fork what's changing/i), { target: { value: text } });
  await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Submit changes" })));
  await advance(0);
}

/** Confirm the card above the chat box. It also opens the Future page. */
async function confirmCard() {
  await act(async () => void fireEvent.click(screen.getByRole("button", { name: /branch timeline/i })));
  await advance(0);
}

async function compare() {
  fireEvent.click(screen.getByRole("button", { name: /^Compare with the RAV4$/ }));
  await advance(0);
}

/** Alex's car, the demo sentence confirmed, the Future page open and (by default) the RAV4 compared. */
async function world(opts: { text?: string; compared?: boolean } = {}) {
  await openApp();
  await ask(opts.text ?? data.demo.brainDump);
  await confirmCard();
  expect(state().ui.view).toBe("future");
  if (opts.compared !== false) await compare();
}

// ---- reading the engine --------------------------------------------------------------------------------------------

const cmp = () => state().comparison!;
const scen = (id: string) => state().explore.scenarios.find((s) => s.id === id)!;
const pointAt = (id: string, m: number) => state().results[id].points.find((p) => p.month === m);
const fiveYear = (id: string) => pointAt(id, 60)!.netEconomicCost;
const owned = (): VehicleConfig => state().twin!.vehicle;
const other = (): VehicleConfig => state().replacementVehicle!;
const swap = () => scen(cmp().replaceId).events.find((e) => e.type === "vehicle_replacement")!;
const lifeEvents = (): LifeEvent[] => scen(cmp().keepId).events.filter((e) => e.status === "confirmed" && e.type !== "vehicle_replacement");
const allEvents = (): LifeEvent[] => [...lifeEvents(), swap()];
const carName = (v: VehicleConfig) => `${v.year} ${v.model} ${v.trim}`;
const carAt = (id: string, m: number): VehicleConfig => (m === 0 ? owned() : [owned(), other()].find((v) => v.id === pointAt(id, m)!.vehicleId)!);
const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const calendar = (m: number) => {
  const [year, month] = state().todayISO.split("-").map(Number);
  return `${MONTH_NAMES[(month - 1 + m) % 12]} ${year + Math.floor((month - 1 + m) / 12)}`;
};
const span = (m: number) => (m < 12 ? `${m} mo` : m % 12 === 0 ? `${m / 12} yr` : `${Math.floor(m / 12)} yr ${m % 12} mo`);
const changes = (n: number) => (n === 0 ? "no changes yet" : n === 1 ? "1 change so far" : `${n} changes so far`);
const diffAmount = () => Math.round(fiveYear(cmp().replaceId)) - Math.round(fiveYear(cmp().keepId));
const diffPhrase = () => (diffAmount() > 0 ? `Switching adds ${money(diffAmount())}` : diffAmount() < 0 ? `Switching saves ${money(-diffAmount())}` : "No difference between the two");
/** The engine's call as the page words it: read from the store's evaluation, never assumed. */
const callWords = () => {
  const preferred = state().evaluation!.preferredScenarioId;
  return preferred === "inconclusive" ? "Close call" : preferred === cmp().keepId ? `Keep your ${owned().model}` : `Switch to the ${other().model}`;
};

// ---- reading the page ----------------------------------------------------------------------------------------------

const q = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector);
const text = (el: Element | null) => el?.textContent ?? "";
const slot = (name: string) => text(q(`[data-slot="${name}"]`));
const tid = (id: string) => screen.getByTestId(id);
const slider = () => q<HTMLInputElement>('input[type="range"][aria-label="Selected month"]')!;
const scrub = (m: number) => fireEvent.change(slider(), { target: { value: String(m) } });
const markers = () => [...document.querySelectorAll<HTMLElement>('[data-testid="event-marker"]')];
const marker = (id: string) => q(`[data-testid="event-marker"][data-event-id="${id}"]`)!;
const dest = (future: "keep" | "switch") => q(`[data-testid="destination"][data-future="${future}"]`)!;
const heading = () => text(q('[data-testid="journey-header"] h1'));
const playButton = () => q<HTMLButtonElement>('[data-slot="scrubber"] button')!;
const goTo = (name: "Car" | "Future") => fireEvent.click(screen.getByRole("tab", { name }));
const openDialogs = () => [...document.querySelectorAll<HTMLElement>('[role="dialog"][data-open="true"]')];
/** What opens each drawer, as a person would press it ("explain" needs an event selected first). */
const openers = {
  explain: () => screen.getByRole("button", { name: "Explain this" }),
  costs: () => screen.getByRole("button", { name: "Compare costs" }),
  recommendation: () => tid("journey-heading"),
};
const escape = () => fireEvent.keyDown(window, { key: "Escape" });
const rectOf = (el: HTMLElement): Rect => {
  const t = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(el.style.transform);
  const [w, h] = [parseFloat(el.style.width), parseFloat(el.style.height)];
  return t ? { x: Number(t[1]), y: Number(t[2]), w, h } : { x: parseFloat(el.style.left), y: parseFloat(el.style.top), w, h };
};
/**
 * The road as drawn: its size, its axis, and where a month sits along time, all read off the page (the year ticks for month 0 and
 * month 60), so these checks do not lean on the road's own math.
 */
function drawn() {
  const svg = tid("journey-road");
  const vertical = tid("journey-timeline").getAttribute("data-orientation") === "vertical";
  const tick = (m: number) => Number(q(`[data-testid="road-axis-tick"][data-month="${m}"] line`)!.getAttribute(vertical ? "y1" : "x1"));
  const axisC = Number(svg.querySelector("line")!.getAttribute(vertical ? "x1" : "y1"));
  const width = Number(svg.getAttribute("width"));
  const height = Number(svg.getAttribute("height"));
  return {
    vertical,
    width,
    height,
    along: (month: number) => tick(0) + (month / 60) * (tick(60) - tick(0)),
    centre: (r: Rect) => (vertical ? r.y + r.h / 2 : r.x + r.w / 2),
    axisBlock: (vertical ? { x: 0, y: 0, w: axisC + 8, h: height } : { x: 0, y: axisC - 12, w: width, h: height - (axisC - 12) }) as Rect,
  };
}
/** Everything a person could read or hear: text, tooltips, labels. */
function everythingVisible(): string[] {
  const out = [document.body.textContent ?? ""];
  for (const el of document.body.querySelectorAll("*")) {
    for (const name of ["title", "aria-label", "placeholder", "alt", "aria-valuetext", "aria-description"]) {
      const v = el.getAttribute(name);
      if (v) out.push(v);
    }
  }
  return out;
}

/** The five-year figures, the difference and the call, as the page shows them now. */
const headlineOnPage = () => ({ keep: text(dest("keep")), switch: text(dest("switch")), difference: text(tid("journey-difference")), call: heading() });
/** Every event, label and destination lies inside a road this wide (a narrow screen rearranges instead of running off the side). */
const expectAcross = (width: number) => {
  for (const el of [...markers(), ...document.querySelectorAll<HTMLElement>('[data-testid="destination"], [data-testid="event-label"]')]) {
    expect(rectOf(el).x).toBeGreaterThanOrEqual(0);
    expect(rectOf(el).x + rectOf(el).w).toBeLessThanOrEqual(width);
  }
};

describe("Future page, spec section 8", () => {
  /** Every place that shows the selected month, checked against the engine for the future being looked at. */
  function expectClock(m: number, id: string, future: "keep" | "switch", how: string) {
    const car = carAt(id, m);
    const label = `${how}: month ${m} on the ${future} future`;
    expect(state().activeMonth, label).toBe(m);
    expect(slider().value, label).toBe(String(m));
    expect(slider().getAttribute("aria-valuetext"), label).toBe(`${calendar(m)}, ${m === 0 ? "now" : `in ${span(m)}`}`);
    expect(tid("time-marker"), label).toHaveAttribute("data-month", String(m));
    expect(tid("journey-timeline"), label).toHaveAttribute("data-month", String(m));
    expect(slot("date"), label).toBe(calendar(m));
    expect(slot("vehicle"), label).toBe(carName(car));
    // cost through the month is the simulation's own monthly figure (month 0 is before anything is spent)
    expect(slot("through"), label).toBe(`Through ${calendar(m)}: ${m === 0 ? "$0" : money(pointAt(id, m)!.netEconomicCost)}`);
    // no event selected: the card says where the same month stands
    const card = tid("event-card");
    expect(card, label).toHaveAttribute("data-state", "moment");
    expect(card.textContent, label).toContain(`${calendar(m)}: you are in the ${car.model}, with ${changes(lifeEvents().filter((e) => e.month <= m).length)}.`);
    expect(q('[data-slot="swap-note"]') !== null, label).toBe(future === "switch" && m === swap().month);
    if (m === swap().month) expect(card.textContent, label).toContain(future === "switch" ? "You change cars this month." : "The switch future changes cars this month.");
  }

  it("1 scrubbing updates the same month everywhere", async () => {
    await world();
    const { keepId, replaceId } = cmp();
    for (const [future, id] of [["switch", replaceId], ["keep", keepId]] as const) {
      fireEvent.click(dest(future));
      for (const m of [0, 1, 11, swap().month, 13, 29, 32, 33, 45, 60, 20, 0]) {
        scrub(m);
        expectClock(m, id, future, "slider");
      }
      // the keyboard on the slider, and dragging along the road itself, move the same clock
      scrub(10);
      for (const [key, month] of [["ArrowRight", 11], ["ArrowLeft", 10], ["PageUp", 22], ["PageDown", 10], ["End", 60], ["Home", 0]] as const) {
        fireEvent.keyDown(slider(), { key });
        expectClock(month, id, future, key);
      }
      const road = drawn();
      const drag = { pointerId: 1, button: 0, pointerType: "touch", clientY: 0 };
      fireEvent.pointerDown(tid("road-hit"), { ...drag, clientX: road.along(20) });
      expectClock(20, id, future, "touching the road");
      fireEvent.pointerMove(tid("road-hit"), { ...drag, clientX: road.along(47) });
      expectClock(47, id, future, "dragging along the road");
      fireEvent.pointerUp(tid("road-hit"), drag);
      fireEvent.pointerMove(tid("road-hit"), { ...drag, clientX: road.along(5) });
      expectClock(47, id, future, "after letting go");
    }
  });

  // KNOWN BUG (kept as the assertion it should be): scrubbing off a selected event leaves the card on that event and its date while
  // the scrubber and road are on another month. buildJourney (model.ts selectedEventId) never checks the month; the store never clears it.
  it.fails("1 an event on the card follows the clock: scrubbing off it shows the month you are on", async () => {
    await world();
    const denver = lifeEvents().find((e) => e.type === "relocation")!;
    fireEvent.click(marker(denver.id));
    expect(tid("event-card")).toHaveAttribute("data-state", "event");
    expect(tid("event-card").textContent).toContain(calendar(denver.month));
    scrub(denver.month + 8);
    // The selected month is now somewhere else; the card must not keep describing a different date.
    expect(tid("event-card").textContent).toContain(calendar(denver.month + 8));
    expect(slot("date")).toBe(calendar(denver.month + 8));
  });

  it("2 event selection moves to the correct date", async () => {
    await world();
    const CARD_SIZE = "h-[148px] sm:h-[124px]"; // the card never changes size, so choosing an event does not push the page around
    expect(tid("event-card").className).toContain(CARD_SIZE);
    for (const future of ["keep", "switch"] as const) {
      fireEvent.click(dest(future));
      expect(markers().map((m) => m.getAttribute("data-event-id")).sort()).toEqual(allEvents().map((e) => e.id).sort());
      for (const mk of markers()) {
        const id = mk.getAttribute("data-event-id")!;
        const event = allEvents().find((e) => e.id === id)!;
        const title = event.type === "vehicle_replacement" ? `Switch to the ${other().model}` : eventTitle(event);
        fireEvent.click(mk);
        const label = `${title} on the ${future} future`;
        expect(state().selectedEventId, label).toBe(id);
        expect(state().activeMonth, label).toBe(event.month);
        expect(mk.getAttribute("data-month"), label).toBe(String(event.month));
        expect(mk.getAttribute("aria-label"), label).toBe(`${title}, ${calendar(event.month)}`);
        expect(tid("time-marker"), label).toHaveAttribute("data-month", String(event.month));
        expect(slot("date"), label).toBe(calendar(event.month));
        expect(Number(tid("time-marker").getAttribute("data-x")), label).toBeCloseTo(drawn().centre(rectOf(mk)), 5); // the clock's marker sits on the event
        expect(markers().filter((m) => m.getAttribute("aria-pressed") === "true").map((m) => m.getAttribute("data-event-id")), label).toEqual([id]);
        const card = tid("event-card");
        expect(card, label).toHaveAttribute("data-state", "event");
        expect(card.className, label).toContain(CARD_SIZE);
        expect(tid("event-card-title"), label).toHaveTextContent(title);
        expect(tid("event-card-when"), label).toHaveTextContent(`${calendar(event.month)} · ${event.month === 0 ? "Now" : `In ${span(event.month)}`}`);
        expect(tid("event-card-sentence").textContent, label).toMatch(/\S/);
        expect(tid("event-card-sentence").textContent, label).not.toMatch(/Working out|Updating/);
        expect(within(card).getByRole("button", { name: "Explain this" }), label).toBeInTheDocument();
      }
    }
    // the written label next to a marker selects it too
    const label = q('[data-testid="event-label"]')!;
    fireEvent.click(label);
    expect(state().selectedEventId).toBe(label.getAttribute("data-event-id"));
    expect(state().activeMonth).toBe(allEvents().find((e) => e.id === state().selectedEventId)!.month);
  });

  it("3 branch selection preserves the selected time and the engine's call", async () => {
    await world();
    const { keepId, replaceId } = cmp();
    const evaluation = state().evaluation;
    const before = headlineOnPage();
    expect(before.call).toBe(callWords());
    expect(before.difference).toBe(`${diffPhrase()} over five years.`);
    expect(before.keep).toContain(money(fiveYear(keepId)));
    expect(before.switch).toContain(money(fiveYear(replaceId)));

    const road = () => fireEvent.click(tid("road-hit-other")); // tapping the path that is not selected
    const picks: Array<[() => void, string, "keep" | "switch"]> = [
      [() => fireEvent.click(dest("keep")), keepId, "keep"],
      [() => fireEvent.click(dest("switch")), replaceId, "switch"],
      [() => fireEvent.click(dest("keep")), keepId, "keep"],
      [road, replaceId, "switch"],
      [road, keepId, "keep"],
    ];
    for (const m of [0, 12, 31, 60, 5]) {
      scrub(m);
      for (const [pick, id, kind] of picks) {
        pick();
        const label = `${kind} at month ${m}`;
        expect(state().activeScenarioId, label).toBe(id);
        expect(state().activeMonth, label).toBe(m);
        expect(slider().value, label).toBe(String(m));
        expect(tid("time-marker"), label).toHaveAttribute("data-future", kind);
        expect(tid("time-marker"), label).toHaveAttribute("data-month", String(m));
        expect(dest(kind), label).toHaveAttribute("aria-pressed", "true");
        expect(dest(kind === "keep" ? "switch" : "keep"), label).toHaveAttribute("aria-pressed", "false");
        expect(tid(kind === "keep" ? "road-path-keep" : "road-path-switch"), label).toHaveAttribute("data-selected", "true");
        expect(slot("vehicle"), label).toBe(carName(carAt(id, m)));
        // exploring a branch is not changing the model: the same verdict object, words and totals
        expect(state().evaluation, label).toBe(evaluation);
        expect(headlineOnPage(), label).toEqual(before);
      }
      // and the stage settles on the car of the future you picked, at this month (a morph runs when they differ)
      for (const [kind, id] of [["switch", replaceId], ["keep", keepId]] as const) {
        fireEvent.click(dest(kind));
        await advance(1900);
        expect(state().activeVehicleId, `${kind} at month ${m}`).toBe(carAt(id, m).id);
        expect(tid("car-stage-stub"), `${kind} at month ${m}`).toHaveAttribute("data-vehicle-id", carAt(id, m).id);
        expect(state().activeMonth).toBe(m);
      }
    }
  });

  it("4 the vehicle changes at the modeled replacement month", async () => {
    await world();
    const { replaceId, keepId } = cmp();
    const swapMonth = swap().month;
    const ownedBefore = structuredClone(owned());
    expect(ownedBefore.vin).toBe(ALEX_CAMRY_VIN);
    // the simulation itself changes cars in the swap month and not a month earlier
    expect(pointAt(replaceId, swapMonth - 1)!.vehicleId).toBe(owned().id);
    expect(pointAt(replaceId, swapMonth)!.vehicleId).toBe(other().id);
    expect(pointAt(keepId, 60)!.vehicleId).toBe(owned().id);

    const stageShows = async (expected: VehicleConfig) => {
      const morphs = state().activeVehicleId !== expected.id;
      goTo("Car");
      expect(state().stage.phase === "transition").toBe(morphs); // a morph only when the car at this month is not the one on stage
      if (morphs) expect(state().stage.transitionTo!.id).toBe(expected.id);
      await advance(1900);
      expect(tid("car-stage-stub")).toHaveAttribute("data-vehicle-id", expected.id);
      expect(state().activeVehicleId).toBe(expected.id);
      goTo("Future");
    };
    for (const [m, car] of [[swapMonth - 1, owned()], [swapMonth, other()], [swapMonth - 1, owned()], [swapMonth, other()], [60, other()]] as const) {
      scrub(m);
      const label = `month ${m}`;
      expect(slot("vehicle"), label).toBe(carName(car));
      expect(tid("time-marker"), label).toHaveAttribute("data-month", String(m));
      expect(q('[data-slot="swap-note"]') !== null, label).toBe(m === swapMonth);
      await stageShows(car);
      // the owned car and its VIN are never replaced by the hypothetical one
      expect(owned(), label).toEqual(ownedBefore);
      expect(state().twin!.vehicle.vin).toBe(ALEX_CAMRY_VIN);
    }
    // keeping never changes cars, at any month
    fireEvent.click(dest("keep"));
    for (const m of [swapMonth - 1, swapMonth, 60]) {
      scrub(m);
      expect(slot("vehicle")).toBe(carName(owned()));
    }
    await advance(1900);
    expect(state().activeVehicleId).toBe(owned().id);
    expect(owned()).toEqual(ownedBefore);
  });

  it("5 shared events remain aligned across futures", async () => {
    await world();
    const keep = scen(cmp().keepId);
    const replace = scen(cmp().replaceId);
    const inReplace = replace.events.filter((e) => e.type !== "vehicle_replacement");
    expect(inReplace.map((e) => [e.id, e.month]).sort()).toEqual(keep.events.map((e) => [e.id, e.month]).sort());
    const road = drawn();
    const where = () => Object.fromEntries(markers().map((m) => [m.getAttribute("data-event-id")!, m.getAttribute("style")]));
    const first = where();
    for (const future of ["switch", "keep", "switch"] as const) {
      fireEvent.click(dest(future));
      expect(where()).toEqual(first); // choosing a future never moves an event
    }
    for (const event of lifeEvents()) {
      expect(markers().filter((m) => m.getAttribute("data-event-id") === event.id)).toHaveLength(1); // one marker, shared by both futures
      const mk = marker(event.id);
      expect(mk.getAttribute("data-month")).toBe(String(event.month));
      const rect = rectOf(mk);
      expect(road.centre(rect)).toBeCloseTo(road.along(event.month), 5); // time is a straight line, never nudged
      expect(["both", "trunk"]).toContain(mk.getAttribute("data-on")); // on both futures (or the part they share)
    }
    expect(tid("road-path-switch")).toHaveAttribute("data-split-month", String(swap().month));
    expect(Number(tid("road-path-switch").getAttribute("data-split-x"))).toBeCloseTo(road.along(swap().month), 5);
    for (const m of [7, swap().month, 45]) {
      scrub(m);
      expect(Number(tid("time-marker").getAttribute("data-x"))).toBeCloseTo(road.along(m), 5); // the marker is on the same straight line
    }
    expect(marker(swap().id).getAttribute("data-on")).toBe("switch");
  });

  it("5 before comparing, the offered switch splits at the month the real swap then lands in", async () => {
    await world({ compared: false });
    const life = scen(state().activeScenarioId); // what is kept
    const offer = tid("road-path-switch");
    expect(offer).toHaveAttribute("data-dashed", "true");
    expect(heading()).toBe("Your next five years");
    expect(text(dest("switch"))).toContain("Compare");
    expect(text(dest("switch"))).not.toMatch(/\$/); // no cost is invented for a switch nobody has priced
    expect(text(tid("journey-difference"))).toBe("Compare to see what switching would change over five years.");
    const candidate = data.listSampleVehicles().find((v) => v.id !== owned().id)!;
    const promised = sim.makeReplaceScenario(life, candidate).events.find((e) => e.type === "vehicle_replacement")!.month;
    expect(offer.getAttribute("data-split-month")).toBe(String(promised));
    for (const m of [0, promised, 33, 60]) {
      scrub(m); // keeping is priced and stable at every month, and it never changes cars
      expect(text(dest("keep"))).toContain(money(pointAt(life.id, 60)!.netEconomicCost));
      expect(slot("through")).toBe(`Through ${calendar(m)}: ${m === 0 ? "$0" : money(pointAt(life.id, m)!.netEconomicCost)}`);
      expect(slot("vehicle")).toBe(carName(owned()));
    }
    scrub(15);
    fireEvent.click(dest("switch")); // the offer's destination asks for the comparison
    await advance(0);
    expect(swap().month).toBe(promised);
    expect(tid("road-path-switch")).toHaveAttribute("data-dashed", "false");
    expect(tid("road-path-switch")).toHaveAttribute("data-split-month", String(promised));
    expect(state().activeMonth).toBe(15);
    expect(heading()).toBe(callWords());
  });

  it("6 chat changes propagate through the interface", async () => {
    await world();
    const child = lifeEvents().find((e) => e.type === "family_change")!;
    fireEvent.click(marker(child.id)); // looking at an event that will still be valid afterwards
    const before = { revision: state().revision, comparison: { ...cmp() }, results: state().results, swapMonth: swap().month };
    expect(before.swapMonth).toBeGreaterThan(4);

    await ask("I'm moving to Seattle in 4 months"); // earlier than the Denver move it replaces: the swap follows the earliest big change
    expect(state().explore.draftChanges).toHaveLength(1);
    await confirmCard();

    // the engine moved: new futures, new results, a higher revision, and the swap at the new earliest life change
    const { keepId, replaceId } = cmp();
    expect([keepId, replaceId]).not.toEqual([before.comparison.keepId, before.comparison.replaceId]);
    expect(state().revision).toBeGreaterThan(before.revision);
    expect(state().results).not.toBe(before.results);
    const seattle = lifeEvents().find((e) => e.payload.location === "Seattle")!;
    expect(seattle.month).toBe(4);
    expect(lifeEvents().some((e) => e.payload.location === "Denver")).toBe(false); // the new move replaces the old one
    const earliest = Math.min(...lifeEvents().filter((e) => e.type === "relocation" || e.type === "family_change").map((e) => e.month));
    expect(swap().month).toBe(earliest);
    expect(swap().month).toBe(4);
    expect(state().lastChange).toMatchObject({ kind: "confirm", eventIds: [seattle.id] });

    // events and dates: one marker per event, at the engine's month, with its calendar date
    expect(markers().map((m) => m.getAttribute("data-event-id")).sort()).toEqual(allEvents().map((e) => e.id).sort());
    for (const event of allEvents()) {
      expect(marker(event.id).getAttribute("data-month")).toBe(String(event.month));
      expect(marker(event.id).getAttribute("aria-label")).toContain(calendar(event.month));
    }
    // the split moved to the right month, on the road and on the scrubber
    expect(tid("road-path-switch")).toHaveAttribute("data-split-month", "4");
    scrub(3);
    expect(slot("vehicle")).toBe(carName(owned()));
    scrub(4);
    expect(slot("vehicle")).toBe(carName(other()));
    scrub(child.month);
    // destinations, difference line and call all come from the new results
    expect(text(dest("keep"))).toContain(money(fiveYear(keepId)));
    expect(text(dest("switch"))).toContain(money(fiveYear(replaceId)));
    expect(text(tid("journey-difference"))).toBe(`${diffPhrase()} over five years.`);
    expect(heading()).toBe(callWords());
    // selection kept (the event still exists), and the month with it
    expect(state().selectedEventId).toBe(child.id);
    expect(state().activeMonth).toBe(child.month);
    expect(tid("event-card-title")).toHaveTextContent(eventTitle(child));

    // the change is highlighted, then lets go after two seconds
    const lit = () => markers().filter((m) => m.getAttribute("data-changed") === "true").map((m) => m.getAttribute("data-event-id"));
    expect(lit()).toEqual([seattle.id]);
    await advance(1000);
    expect(lit()).toEqual([seattle.id]);
    await advance(1100);
    expect(lit()).toEqual([]);
    expect(tid("event-card")).toHaveAttribute("data-changed", "false");

    // the drawers read the same results
    fireEvent.click(screen.getByRole("button", { name: "Compare costs" }));
    expect(text(tid("five-year-keep"))).toBe(money(fiveYear(keepId)));
    expect(text(tid("five-year-switch"))).toBe(money(fiveYear(replaceId)));
    expect(text(tid("five-year-difference"))).toBe(diffPhrase());
    escape();
    fireEvent.click(tid("journey-heading"));
    expect(openDialogs()[0]).toHaveAttribute("aria-label", callWords());
    expect(text(tid("recommendation-difference"))).toContain(diffPhrase());
    escape();
    fireEvent.click(marker(seattle.id));
    fireEvent.click(screen.getByRole("button", { name: "Explain this" }));
    expect(text(tid("explain-title"))).toBe("Move to Seattle");
    expect(text(tid("explain-said"))).toContain("I'm moving to Seattle in 4 months");
    // and nothing recalculates behind the page's back afterwards
    const revision = state().revision;
    await advance(5000);
    expect(state().revision).toBe(revision);
  });

  it("6 a selection that a chat change removes falls back to the month instead of showing a ghost", async () => {
    await world();
    const denver = lifeEvents().find((e) => e.payload.location === "Denver")!;
    fireEvent.click(marker(denver.id));
    expect(tid("event-card")).toHaveAttribute("data-state", "event");
    await ask("I'm moving to Seattle in 4 months"); // replaces the Denver move
    await confirmCard();
    expect(allEvents().some((e) => e.id === denver.id)).toBe(false);
    expect(marker(denver.id)).toBeNull();
    expect(state().activeMonth).toBe(denver.month); // the clock stays where it was
    expect(tid("event-card")).toHaveAttribute("data-state", "moment");
    expect(markers().filter((m) => m.getAttribute("aria-pressed") === "true")).toEqual([]);
    expect(tid("event-card").textContent).toContain(`${calendar(denver.month)}: you are in the`);
  });

  // KNOWN BUG (kept as the assertion it should be): the swap's id is "<replace scenario id>/event" and every confirm builds a new replace
  // scenario, so selectedEventId names a swap that no longer exists although it is where it was (confirmDrafts never remaps it).
  it.fails("6 the swap stays selected when a chat change leaves it where it was", async () => {
    await world();
    const before = swap();
    fireEvent.click(marker(before.id));
    await ask("we will be driving 30,000 miles a year in 18 months"); // later than the swap, so the swap does not move
    await confirmCard();
    expect(swap().month).toBe(before.month);
    expect(state().activeMonth).toBe(before.month);
    expect(tid("event-card")).toHaveAttribute("data-state", "event");
    expect(tid("event-card-title")).toHaveTextContent(`Switch to the ${other().model}`);
    expect(marker(swap().id)).toHaveAttribute("aria-pressed", "true");
  });

  it("6 the car follows a swap that a chat change moves earlier", async () => {
    await world();
    scrub(8); // before the swap in month 12: still the Camry
    expect(slot("vehicle")).toBe(carName(owned()));
    expect(state().activeVehicleId).toBe(owned().id);
    await ask("I'm moving to Seattle in 4 months");
    await confirmCard();
    expect(swap().month).toBe(4);
    expect(slot("vehicle")).toBe(carName(other())); // month 8 is now after the swap
    expect(state().stage.transitionTo?.id).toBe(other().id);
    await advance(1900);
    expect(state().activeVehicleId).toBe(other().id);
    expect(tid("car-stage-stub")).toHaveAttribute("data-vehicle-id", other().id);
  });

  // KNOWN BUG (kept as the assertion it should be): "the summer of 2028" is cut to "the summer" by the timing pattern in ai/offline.ts
  // line 40 (ai/dates.ts line 57 has the same gap for "of"), so the stated year is dropped and the event lands in June 2027.
  it.fails("6 a season said with its year lands in that year", async () => {
    await openApp();
    await ask("I'm expecting a baby in the summer of 2028");
    expect(state().explore.draftChanges).toHaveLength(1);
    expect(calendar(state().explore.draftChanges[0].month)).toBe("Jun 2028");
  });

  it("7 rapid updates cannot show stale results", async () => {
    await world();
    const seen: Array<{ revision: number; totals: string[] }> = [];
    const stop = useForkStore.subscribe((s) => {
      const c = s.comparison;
      seen.push({ revision: s.revision, totals: c ? [c.keepId, c.replaceId].map((id) => money(s.results[id]?.points.find((p) => p.month === 60)?.netEconomicCost ?? 0)) : [] });
    });
    const start = state().revision;
    const denver = lifeEvents().find((e) => e.type === "relocation")!;
    const keepBefore = cmp().keepId;
    const recalculated = (label: string, run: () => void) => {
      const was = state().revision;
      run();
      expect(state().revision, label).toBeGreaterThan(was);
    };

    // two sentences sent back to back: the first is superseded, only the second is read
    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    await act(async () => {
      first = actions().submitDump("I'm moving to Boston in 3 months");
      second = actions().submitDump("we will be driving 30,000 miles a year in 18 months");
      recalculated("answer", () => actions().answerRiders("mixed")); // none of these wait for the sentences above
      recalculated("move", () => actions().moveEvent(keepBefore, denver.id, 20));
      recalculated("assumption", () => actions().setAssumption("insurancePerMonth", 310));
      recalculated("question", () => actions().answerQuestion("annualMiles", 31000));
      await Promise.all([first, second]);
    });
    expect(await first).toEqual({ kind: "stale" });
    expect(await second).toMatchObject({ kind: "proposed" });
    expect(state().explore.draftChanges.map((d) => d.type)).toEqual(["mileage_change"]); // nothing of the dropped sentence
    expect(state().ui.busy).toBe("idle");

    // confirm, move again and confirm again, with no waiting in between
    await act(async () => {
      recalculated("confirm", () => actions().confirmDrafts(state().explore.draftChanges.map((d) => d.id)));
      recalculated("move again", () => actions().moveEvent(cmp().keepId, denver.id, 7));
      actions().addDraft({ type: "fuel_price_change", month: 24, payload: { fuelPricePerGal: 5 }, source: "user", assumptions: [], certainty: "clear" });
      recalculated("confirm again", () => actions().confirmDrafts(state().explore.draftChanges.map((d) => d.id)));
      recalculated("answer again", () => actions().answerRiders("solo"));
    });
    stop();
    expect(seen.map((s) => s.revision)).toEqual([...seen.map((s) => s.revision)].sort((a, b) => a - b)); // never goes back
    expect(state().revision).toBeGreaterThan(start);

    // every number on the page is a fresh run of the engine on the final state
    const inputs = simulationInputs(state())!;
    const fresh = Object.fromEntries(state().explore.scenarios.map((s) => [s.id, sim.simulate(inputs.twin, s, inputs.ctx)]));
    for (const s of state().explore.scenarios) expect(state().results[s.id].points).toEqual(fresh[s.id].points);
    const { keepId, replaceId } = cmp();
    const evaluation = decision.evaluate({
      twin: inputs.twin,
      scenarios: [scen(keepId), scen(replaceId)],
      results: [fresh[keepId], fresh[replaceId]],
      priorities: state().explore.confirmedProfile.priorities,
      maxMonthlyBudget: state().explore.confirmedProfile.monthlyBudget,
    });
    expect(state().evaluation!.preferredScenarioId).toBe(evaluation.preferredScenarioId);
    const keepTotal = money(fresh[keepId].points.find((p) => p.month === 60)!.netEconomicCost);
    const switchTotal = money(fresh[replaceId].points.find((p) => p.month === 60)!.netEconomicCost);
    expect(text(dest("keep"))).toContain(keepTotal);
    expect(text(dest("switch"))).toContain(switchTotal);
    expect(heading()).toBe(callWords());
    expect(text(tid("journey-difference"))).toBe(`${diffPhrase()} over five years.`);
    const month = state().activeMonth;
    expect(slot("through")).toBe(`Through ${calendar(month)}: ${month === 0 ? "$0" : money(fresh[state().activeScenarioId].points.find((p) => p.month === month)!.netEconomicCost)}`);
    expect(markers().map((m) => [m.getAttribute("data-event-id"), m.getAttribute("data-month")]).sort()).toEqual(allEvents().map((e) => [e.id, String(e.month)]).sort());
    // no value from an in-between state is left on the page
    const page = text(tid("future-view"));
    const gone = seen.flatMap((s) => s.totals).filter((t) => t !== money(0) && t !== keepTotal && t !== switchTotal);
    expect(gone.length).toBeGreaterThan(0); // the burst really did pass through other numbers
    for (const figure of gone) expect(page, figure).not.toContain(figure);
    expect(text(tid("journey-updating"))).toBe("");
    // and so is what the card says about an event: the cost it adds is a fresh run with and without it
    const fuel = lifeEvents().find((e) => e.type === "fuel_price_change")!;
    fireEvent.click(marker(fuel.id));
    const future = scen(replaceId);
    const without = sim.simulate(inputs.twin, { ...future, events: future.events.filter((e) => e.id !== fuel.id) }, inputs.ctx);
    const delta = fresh[replaceId].points.find((p) => p.month === 60)!.netEconomicCost - without.points.find((p) => p.month === 60)!.netEconomicCost;
    expect(Math.abs(Math.round(delta))).toBeGreaterThan(0);
    expect(text(tid("event-card-sentence"))).toBe(delta > 0 ? `Adds ${money(delta)} to your five-year cost.` : `Saves ${money(-delta)} on your five-year cost.`);
  });

  it("7 a slow answer that arrives after a newer change is dropped, and the page says it is updating meanwhile", async () => {
    await world();
    let release!: (r: InterpretResult) => void;
    vi.spyOn(ai, "interpret").mockImplementationOnce(() => new Promise<InterpretResult>((resolve) => (release = resolve)));
    let slow!: Promise<unknown>;
    await act(async () => {
      slow = actions().submitDump("something about Boston");
    });
    expect(text(tid("journey-updating"))).toBe("Updating");
    expect(tid("event-card")).toHaveAttribute("data-updating", "true");
    expect(screen.getByPlaceholderText(/tell fork what's changing/i)).toBeDisabled(); // the box waits for the reading
    // meanwhile a newer sentence is read and confirmed
    await act(async () => {
      await actions().submitDump("I'm moving to Seattle in 4 months");
    });
    act(() => actions().confirmDrafts(state().explore.draftChanges.map((d) => d.id)));
    const settled = { scenarios: state().explore.scenarios, results: state().results, evaluation: state().evaluation, comparison: state().comparison };
    const late: LifeEvent = { id: "late-1", type: "relocation", month: 2, payload: { location: "Boston" }, source: "ai", assumptions: [], certainty: "clear", status: "proposed", quote: "Boston" };
    await act(async () => {
      release({ aiAvailable: true, intent: "CREATE_SCENARIO", proposals: [late], profilePatches: [] });
      await slow;
    });
    expect(await slow).toEqual({ kind: "stale" });
    expect(state().explore.draftChanges).toEqual([]);
    expect({ scenarios: state().explore.scenarios, results: state().results, evaluation: state().evaluation, comparison: state().comparison }).toEqual(settled);
    expect(JSON.stringify(state().explore.scenarios)).not.toContain("Boston");
    expect(text(tid("journey-updating"))).toBe("");
  });

  it("8 five-year totals stay stable while scrubbing 0 to 60", async () => {
    await world();
    const { keepId, replaceId } = cmp();
    const expected = { keep: money(fiveYear(keepId)), switch: money(fiveYear(replaceId)), difference: `${diffPhrase()} over five years.` };
    for (const future of ["switch", "keep"] as const) {
      fireEvent.click(dest(future));
      for (let m = 0; m <= 60; m++) {
        scrub(m);
        expect(slider().value).toBe(String(m));
        expect(text(dest("keep")), `keep at ${m}`).toContain(expected.keep);
        expect(text(dest("switch")), `switch at ${m}`).toContain(expected.switch);
        expect(text(tid("journey-difference")), `difference at ${m}`).toBe(expected.difference);
        expect(text(dest("keep")).match(/\$[\d,]+/g), `keep figures at ${m}`).toEqual([expected.keep]);
        expect(text(dest("switch")).match(/\$[\d,]+/g), `switch figures at ${m}`).toEqual([expected.switch]);
      }
    }
    // the through-month figure is separate, labeled as such, and does change
    scrub(30);
    const mid = slot("through");
    scrub(60);
    expect(slot("through")).toBe(`Through ${calendar(60)}: ${money(pointAt(keepId, 60)!.netEconomicCost)}`);
    expect(slot("through")).not.toBe(mid);
  });

  it("9 drawers open, close and show the right context", async () => {
    await world({ text: SPRING_SENTENCE });
    const { keepId, replaceId } = cmp();
    const dialog = () => openDialogs()[0];

    // explain: the selected event, what was said, assumptions in plain words
    const technical = /US-season|represented by|using a|confirm or correct|fork month|Replacement month \d|proposal starts|mapped to june|\bpayload\b|\bmonth \d+\b/i;
    for (const event of allEvents()) {
      fireEvent.click(marker(event.id));
      fireEvent.click(screen.getByRole("button", { name: "Explain this" }));
      const title = event.type === "vehicle_replacement" ? `Switch to the ${other().model}` : eventTitle(event);
      const body = text(tid("drawer-body"));
      expect(dialog(), title).toHaveAttribute("aria-label", title);
      expect(text(tid("explain-title")), title).toBe(title);
      if (event.quote) expect(text(tid("explain-said")), title).toContain(event.quote);
      else expect(q('[data-testid="explain-said"]'), title).toBeNull();
      for (const raw of event.assumptions) expect(body.toLowerCase(), raw).not.toContain(raw.toLowerCase().replace(/\.$/, ""));
      expect(body, title).not.toMatch(technical);
      expect(body, title).not.toMatch(/\bno effect\b/i); // not modeled is not the same as no effect
      expect(text(tid("explain-changes")), title).toMatch(/Adds|Saves|Removes|No direct vehicle-cost change modeled|Costs shift|Changes your car/);
      escape();
    }
    const child = lifeEvents().find((e) => e.type === "family_change")!;
    fireEvent.click(marker(child.id));
    fireEvent.click(screen.getByRole("button", { name: "Explain this" }));
    expect(child.assumptions.join(" ")).toMatch(/US-season/); // so this really covers the rewrite
    expect(text(tid("explain-assumed"))).toContain("is assumed because you only said spring");
    escape();

    // costs: the same five-year numbers as the road, and no second road
    scrub(24);
    fireEvent.click(screen.getByRole("button", { name: "Compare costs" }));
    expect(dialog()).toHaveAttribute("aria-label", "Compare costs");
    expect(text(tid("five-year-keep"))).toBe(money(fiveYear(keepId)));
    expect(text(tid("five-year-switch"))).toBe(money(fiveYear(replaceId)));
    expect(text(tid("five-year-difference"))).toBe(diffPhrase());
    expect(text(dest("keep"))).toContain(text(tid("five-year-keep")));
    expect(text(dest("switch"))).toContain(text(tid("five-year-switch")));
    expect(document.querySelectorAll('[data-testid="journey-timeline"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-testid$="road"]')).toHaveLength(1); // the one road on the page is the main one
    const lines = within(tid("cost-readout")).getAllByTestId("cost-readout-line");
    const month24 = [keepId, replaceId, "base"].map((id) => money(pointAt(id, 24)!.netEconomicCost));
    expect(text(tid("cost-readout"))).toContain(`Net cost at ${span(24)}`);
    for (const line of lines) expect(month24.some((figure) => text(line).includes(figure))).toBe(true); // actual monthly output
    escape();

    // recommendation: titled with the call, with the tradeoff rows and the other factors on a close call
    fireEvent.click(tid("journey-heading"));
    expect(dialog()).toHaveAttribute("aria-label", callWords());
    const rows = within(tid("tradeoff-rows")).getAllByTestId("tradeoff-row");
    expect(rows.map((r) => r.getAttribute("data-factor")).sort()).toEqual(["comfort", "cost", "family", "fuel", "longevity"]);
    for (const row of rows) expect(["keep", "switch", "level"]).toContain(row.getAttribute("data-leader"));
    expect(text(tid("recommendation-difference"))).toContain(diffPhrase());
    expect(text(tid("priorities-words"))).toMatch(/\S/);
    const closeCall = state().evaluation!.preferredScenarioId === "inconclusive";
    const dearer = diffAmount() > 0 ? "switch" : "keep";
    const ahead = rows.filter((r) => r.getAttribute("data-factor") !== "cost" && r.getAttribute("data-leader") === dearer);
    expect(q('[data-testid="recommendation-balance"]') !== null).toBe(closeCall && diffAmount() !== 0 && ahead.length > 0);
    escape();
    expect(openDialogs()).toHaveLength(0);

    // open and close three ways, focus returns, only one is ever open
    fireEvent.click(marker(child.id));
    for (const [name, find] of Object.entries(openers)) {
      for (const how of ["Escape", "the close button", "the dim layer"]) {
        const opener = find();
        opener.focus();
        fireEvent.click(opener);
        const label = `${name}, closed by ${how}`;
        expect(openDialogs(), label).toHaveLength(1);
        expect(state().ui.drawer, label).toBe(name);
        expect(document.activeElement, label).toBe(dialog().querySelector('button[aria-label="Close"]'));
        if (how === "Escape") escape();
        else if (how === "the close button") fireEvent.click(within(dialog()).getByRole("button", { name: "Close" }));
        else fireEvent.click(tid("drawer-dim"));
        await advance(300);
        expect(openDialogs(), label).toHaveLength(0);
        expect(state().ui.drawer, label).toBeNull();
        expect(document.activeElement, label).toBe(opener);
      }
    }
    fireEvent.click(openers.costs());
    fireEvent.click(openers.explain()); // another one while one is up: it swaps, it never stacks
    expect(openDialogs()).toHaveLength(1);
    expect(state().ui.drawer).toBe("explain");
    act(() => actions().openDrawer("recommendation"));
    expect(openDialogs()).toHaveLength(1);
    expect(dialog()).toHaveAttribute("aria-label", callWords());
    escape();

    // opening one pauses playback
    fireEvent.click(playButton());
    await advance(500);
    expect(state().ui.playing).toBe(true);
    fireEvent.click(openers.costs());
    expect(state().ui.playing).toBe(false);
    expect(playButton()).toHaveAttribute("aria-label", "Play");
  });

  it("10 playback pauses on manual interaction, stops at the end and never autoplays", async () => {
    await world();
    await advance(15_000);
    expect([state().ui.playing, state().activeMonth]).toEqual([false, 0]); // nothing autoplays
    expect(playButton()).toHaveAttribute("aria-label", "Play");
    expect(typeof requestAnimationFrame).toBe("function"); // driven by the (fake) frame clock, like usePlayback.test

    // it glides, rests at each milestone, and stops itself at the end
    const stops = selectJourney(state(), false)!.stops.filter((s) => s > 0 && s < 60);
    expect(stops.length).toBeGreaterThan(1);
    fireEvent.click(playButton());
    expect(playButton()).toHaveAttribute("aria-label", "Pause");
    const trace: number[] = [];
    for (let t = 0; t < 30_000 && state().ui.playing; t += 16) {
      await advance(16);
      trace.push(state().activeMonth);
    }
    expect(trace.every((m, i) => i === 0 || (m >= trace[i - 1] && m - trace[i - 1] <= 1))).toBe(true);
    for (const stop of stops) {
      const frames = trace.filter((m) => m === stop).length;
      expect(frames, `rests on month ${stop}`).toBeGreaterThan(45);
      expect(frames, `rests on month ${stop}`).toBeLessThan(70);
    }
    expect(trace.filter((m) => m === 20).length).toBeLessThan(20); // an ordinary month is not rested on
    expect([state().ui.playing, state().activeMonth]).toEqual([false, 60]);
    expect(playButton()).toHaveAttribute("aria-label", "Play");
    await advance(5000);
    expect(state().activeMonth).toBe(60);

    // each manual interaction pauses it and leaves the clock where the interaction put it
    const interactions: Array<[string, () => void]> = [
      ["scrubbing", () => scrub(40)],
      ["clicking an event", () => fireEvent.click(markers()[1])],
      ["choosing a future", () => fireEvent.click(dest(state().activeScenarioId === cmp().keepId ? "switch" : "keep"))],
      ["opening a drawer", () => fireEvent.click(screen.getByRole("button", { name: "Compare costs" }))],
      ["switching page", () => goTo("Car")],
    ];
    for (const [name, interact] of interactions) {
      if (state().ui.view === "car") goTo("Future");
      act(() => actions().closeDrawer());
      act(() => actions().setActiveMonth(0));
      fireEvent.click(playButton());
      await advance(500);
      expect(state().ui.playing, `${name}: running before`).toBe(true);
      expect(state().activeMonth).toBeGreaterThan(0);
      interact();
      expect(state().ui.playing, name).toBe(false);
      const month = state().activeMonth;
      await advance(3000);
      expect(state().activeMonth, name).toBe(month);
      expect(state().ui.playing, name).toBe(false);
    }
    goTo("Future");
    expect(playButton()).toHaveAttribute("aria-label", "Play"); // coming back to the page does not start it
    await advance(3000);
    expect(state().ui.playing).toBe(false);
  });

  describe("11 layout sanity", () => {
    /** A jsdom stand-in for a container this wide, then the app is mounted again on the same state. */
    async function mountAt(width: number) {
      cleanup();
      vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: width, bottom: 400, width, height: 400, toJSON: () => ({}) } as DOMRect);
      render(<ForkApp />);
      await advance(0);
      expect(state().ui.view).toBe("future");
    }

    it("the road and the event card exist at 1280 and in a narrow container, which turns the road vertical", async () => {
      await world();
      await mountAt(1280);
      expect(tid("journey-timeline")).toHaveAttribute("data-orientation", "horizontal");
      expect(tid("journey-road")).toHaveAttribute("width", "1280");
      expect(tid("event-card")).toBeInTheDocument();
      expect(screen.getByRole("group", { name: "Your next five years" })).toBeInTheDocument();
      // the chat composer is not inside the page, which ends above it (the measured height of its bar)
      expect(tid("future-view").contains(tid("command-box"))).toBe(false);
      expect(tid("future-view").style.bottom).toBe("400px");
      expectAcross(1280);
      await mountAt(390);
      expect(tid("journey-timeline")).toHaveAttribute("data-orientation", "vertical");
      expect(tid("journey-road")).toHaveAttribute("width", "390");
      expect(tid("event-card")).toBeInTheDocument();
      expect(slider()).toBeInTheDocument();
      expect(markers()).toHaveLength(allEvents().length);
      expectAcross(390);
      const road = drawn();
      expect(road.vertical).toBe(true);
      for (const e of allEvents()) expect(road.centre(rectOf(marker(e.id))), e.id).toBeCloseTo(road.along(e.month), 5); // time runs down the page
      expect(road.along(60)).toBeGreaterThan(road.along(0));
    });

    it("every figure goes through the source label rule: one group label for the destinations, none repeated, none missing", async () => {
      await world();
      const view = tid("future-view");
      expect(screen.getAllByTestId("journey-source")).toHaveLength(1);
      const badges = view.querySelectorAll("span[data-source]");
      expect(badges).toHaveLength(1);
      expect(tid("journey-source").contains(badges[0])).toBe(true);
      const journey = selectJourney(state(), false)!;
      expect(badges[0].getAttribute("data-source")).toBe(journey.keep.costSource);
      expect(journey.switch!.costSource).toBe(journey.keep.costSource); // one label can honestly speak for both
      for (const d of [dest("keep"), dest("switch")]) expect(d.querySelector("[data-source]")).toBeNull(); // not repeated under each number
      // every dollar on the page sits in a place that is covered by it: the destinations, the difference line, the card, the through line
      const covered = '[data-testid="destination"], [data-testid="journey-difference"], [data-testid="event-card"], [data-slot="scrubber-readout"]';
      const offenders: string[] = [];
      for (const w = document.createTreeWalker(view, NodeFilter.SHOW_TEXT); w.nextNode(); ) if (/\$\d/.test(w.currentNode.textContent!) && !w.currentNode.parentElement!.closest(covered)) offenders.push(w.currentNode.textContent!);
      expect(offenders).toEqual([]);
      expect(document.querySelector('[data-source="none"]')).toBeNull();
      // the drawers: one group label over the five-year table, a label on every other figure
      fireEvent.click(screen.getByRole("button", { name: "Compare costs" }));
      expect(tid("costs-content").querySelector("section")!.querySelectorAll("[data-source]")).toHaveLength(1);
      for (const line of screen.getAllByTestId("cost-readout-line")) expect(line.querySelector("[data-source]")).not.toBeNull();
      expect(document.querySelector('[data-source="none"]')).toBeNull();
      escape();
      fireEvent.click(marker(lifeEvents()[1].id));
      fireEvent.click(screen.getByRole("button", { name: "Explain this" }));
      for (const fact of tid("changes-list").querySelectorAll('li[data-testid^="change-"]')) {
        if (/\$\d/.test(text(fact))) expect(fact.querySelector("[data-source]"), text(fact)).not.toBeNull();
      }
      expect(document.querySelector('[data-source="none"]')).toBeNull();
    });

    // KNOWN BUG (kept as the assertion it should be): ui/profile/SourceBadge.tsx lines 46 and 62 use text-[11px]; the badge is in the
    // Future header and every drawer. Remove `.fails` once it is text-xs.
    it.fails("no text is smaller than 12px anywhere on the Future page or in its drawers", async () => {
      await world();
      const small = (root: Element): string[] => {
        const found: string[] = [];
        for (const el of [root, ...root.querySelectorAll("*")]) {
          const cls = el.getAttribute("class") ?? "";
          for (const m of cls.matchAll(/(?:^|\s)(?:[a-z-]+:)*text-\[(\d+(?:\.\d+)?)px\]/g)) if (Number(m[1]) < 12) found.push(`${el.tagName.toLowerCase()} ${m[0].trim()}`);
          if (/(?:^|\s)text-2xs\b/.test(cls)) found.push(`${el.tagName.toLowerCase()} text-2xs`);
          const size = parseFloat((el as HTMLElement).style?.fontSize ?? "");
          if (Number.isFinite(size) && size < 12) found.push(`${el.tagName.toLowerCase()} font-size ${size}px`);
        }
        return found;
      };
      const offenders = [...small(tid("future-view")).map((s) => `page: ${s}`)];
      fireEvent.click(marker(lifeEvents()[1].id));
      for (const [name, open] of Object.entries(openers)) {
        fireEvent.click(open());
        offenders.push(...small(openDialogs()[0]).map((s) => `${name} drawer: ${s}`));
        escape();
      }
      expect(offenders).toEqual([]);
    });

    it("has no em dash, no demo and no data on screen, and no stray NaN, on the page or in any drawer", async () => {
      await world({ text: SPRING_SENTENCE });
      const sweep = (step: string) => {
        for (const words of everythingVisible()) {
          expect(words, step).not.toContain(EM_DASH);
          expect(words, step).not.toMatch(/demo|data/i);
          expect(words, step).not.toMatch(/\bNaN\b|undefined|Infinity|\[object/);
        }
      };
      sweep("page");
      for (const event of allEvents()) {
        fireEvent.click(marker(event.id));
        sweep(`event ${event.id}`);
        for (const [name, open] of Object.entries(openers)) {
          fireEvent.click(open());
          sweep(`${name} drawer for ${event.id}`);
          escape();
        }
      }
      await mountAt(390);
      sweep("narrow");
    });

    it("the road's labels never overlap each other, a marker, a destination, the axis, a path or the edge", async () => {
      // more events than the demo, so labels have to find room
      await world({ text: "I'm moving to Denver in 6 months and driving 30,000 miles a year in 8 months" });
      for (const sentence of ["we will be driving 20,000 miles a year in 9 months", "gas will cost $5 a gallon in 10 months", "I am getting a new job 25 miles each way starting in 12 months"]) {
        await ask(sentence);
        await confirmCard();
      }
      expect(allEvents().length).toBeGreaterThanOrEqual(6);
      const check = (width: number, vertical: boolean) => {
        expect(tid("journey-timeline")).toHaveAttribute("data-orientation", vertical ? "vertical" : "horizontal");
        const road = drawn();
        expect(road.width).toBe(width);
        const labels = [...document.querySelectorAll<HTMLElement>('[data-testid="event-label"]')];
        expect(labels).toHaveLength(markers().length); // every event is named
        const blocks = [...document.querySelectorAll<HTMLElement>('[data-testid="destination"]')].map(rectOf);
        const lines = ["road-path-keep", "road-path-switch", "road-path-trunk"].flatMap((id) => [...(q(`[data-testid="${id}"]`)?.getAttribute("d") ?? "").matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) })));
        expect(lines.length).toBeGreaterThan(20);
        const rects = labels.map(rectOf);
        rects.forEach((r, i) => {
          const name = labels[i].getAttribute("data-event-id");
          expect(r.x >= 0 && r.y >= 0 && r.x + r.w <= road.width && r.y + r.h <= road.height, `${name} inside the road`).toBe(true);
          for (let j = i + 1; j < rects.length; j++) expect(rectsIntersect(r, rects[j]), `${name} and ${labels[j].getAttribute("data-event-id")}`).toBe(false);
          for (const mk of markers()) expect(rectsIntersect(r, rectOf(mk)), `${name} and marker ${mk.getAttribute("data-event-id")}`).toBe(false);
          for (const b of blocks) expect(rectsIntersect(r, b), `${name} and a destination`).toBe(false);
          expect(rectsIntersect(r, road.axisBlock), `${name} and the axis`).toBe(false);
          expect(lines.filter((p) => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h), `${name} and a path`).toEqual([]);
        });
      };
      await mountAt(1280);
      check(1280, false);
      await mountAt(390);
      check(390, true);
    });
  });
});
