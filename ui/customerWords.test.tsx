import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { LifeEvent } from "@/contracts";
import { makeFrame } from "@/ui/journey/roadGeometry";
import { data } from "@/ui/mocks";
import { ForkApp } from "@/ui/shell/ForkApp";
import { resetForkStoreForTests, useForkStore } from "@/ui/store/useForkStore";

// Nothing on screen may say "demo" or "data", at any step, in any tooltip, label or placeholder. The app should read like
// something handed to a customer. This walks the whole app: the first screens, the car page, the assumptions drawer with
// every group open, and the Future page (the road, its scrubber, its event card and each of its drawers) before and after
// comparing, mid-scrub, while playing, on a narrow road, and with changes waiting to be confirmed.

const BANNED = /demo|data/i;
const state = () => useForkStore.getState();
const actions = () => useForkStore.getState().actions;

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Attributes a person (or a screen reader, or a hover) can read. */
const READABLE_ATTRIBUTES = ["title", "aria-label", "placeholder", "alt", "aria-valuetext", "aria-description", "aria-roledescription", "aria-placeholder", "value"];

/**
 * Everything a person could read or hear at this moment: text (including what is hidden from view but still in the page, such as a
 * closed dropdown or a screen-reader-only sentence), tooltips, labels, placeholders, alt text, and what is typed in a field.
 */
function everythingVisible(): string[] {
  const words = [document.body.textContent ?? ""];
  for (const el of document.body.querySelectorAll("*")) {
    for (const attr of READABLE_ATTRIBUTES) {
      // A button's `value` is not shown; only fields and options are read from it, and they are covered below.
      if (attr === "value" && !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) continue;
      const v = el.getAttribute(attr);
      if (v) words.push(v);
    }
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) if (el.value) words.push(el.value);
  }
  return words;
}

const seen: Array<{ step: string; chars: number }> = [];
function sweep(step: string) {
  const all = everythingVisible();
  seen.push({ step, chars: all.join(" ").length });
  const hits = all.filter((w) => BANNED.test(w)).map((w) => w.match(new RegExp(`.{0,40}(${BANNED.source}).{0,40}`, "i"))?.[0]);
  expect(hits, `"demo" or "data" on screen at: ${step}`).toEqual([]);
}

/** A walk is only worth something if it really looked: many steps, each with a page's worth of text. */
function expectRealWalk(minSteps: number) {
  expect(seen.length, `steps: ${seen.map((s) => s.step).join(" | ")}`).toBeGreaterThanOrEqual(minSteps);
  expect(seen.filter((s) => s.chars <= 100).map((s) => s.step)).toEqual([]);
}

// ---- helpers that drive the app the way a person does ----

const VIN_CAMRY = "4T1G11AK1NU900001";

async function openCamry() {
  render(<ForkApp />);
  await advance(0);
  fireEvent.change(screen.getByPlaceholderText("Enter your VIN"), { target: { value: VIN_CAMRY } });
  fireEvent.click(screen.getByRole("button", { name: "Decode VIN" }));
  await advance(0);
}

async function enterWorkspace() {
  await openCamry();
  await advance(4100);
  expect(state().phase).toBe("workspace");
}

const goCar = () => fireEvent.click(screen.getByRole("tab", { name: "Car" }));
const goFuture = () => fireEvent.click(screen.getByRole("tab", { name: "Future" }));

/** The "Edit assumptions" drawer with every group opened, so nothing in it is skipped. Left open. */
function openAssumptionsEverywhere() {
  fireEvent.click(screen.getByRole("button", { name: "Edit assumptions" }));
  const sheet = screen.getByRole("dialog", { name: "Edit assumptions" });
  for (const h of within(sheet).getAllByRole("heading", { level: 3 })) {
    const header = within(h).getByRole("button");
    if (header.getAttribute("aria-expanded") !== "true") fireEvent.click(header);
  }
  return sheet;
}
const closeAssumptions = () => fireEvent.click(screen.getByRole("button", { name: "Close details" }));

/**
 * Open one of the Future page's drawers, check that is the one that opened, sweep it, and close it with its own button.
 * `title` is what the drawer says it is.
 */
async function sweepDrawer(open: () => void, title: string | RegExp, step: string) {
  open();
  await advance(0);
  const dialog = screen.getByRole("dialog", { name: title });
  expect(dialog.getAttribute("data-open"), `${step}: the drawer opened`).toBe("true");
  expect(dialog.textContent?.length ?? 0, `${step}: the drawer has something in it`).toBeGreaterThan(40);
  sweep(step);
  fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
  await advance(400);
  expect(state().ui.drawer).toBeNull();
}

/** Every event on the road, one by one: its card, then its full explanation. */
async function walkEvents(label: string) {
  const ids = screen.getAllByTestId("event-marker").map((m) => m.getAttribute("data-event-id") as string);
  expect(ids.length, `${label}: there are events to walk`).toBeGreaterThan(0);
  for (const id of ids) {
    fireEvent.click(document.querySelector(`[data-testid="event-marker"][data-event-id="${id}"]`) as Element);
    await advance(0);
    expect(state().selectedEventId).toBe(id);
    const title = screen.getByTestId("event-card-title").textContent ?? "";
    sweep(`${label}: the card for "${title}"`);
    await sweepDrawer(() => fireEvent.click(screen.getByRole("button", { name: "Explain this" })), title, `${label}: "Explain this" for "${title}"`);
  }
}

/** The month slider, the way a finger would move it. */
const scrubTo = (month: number) => fireEvent.change(screen.getByRole("slider", { name: "Selected month" }), { target: { value: String(month) } });

// ---- a narrow screen: the road runs top to bottom ----
let rectSpy: MockInstance | null = null;
function setScreenWidth(width: number | null) {
  rectSpy?.mockRestore();
  rectSpy = null;
  vi.unstubAllGlobals();
  if (width === null) return;
  const tall = makeFrame(width, true).height;
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: width, bottom: tall, width, height: tall, toJSON: () => ({}) } as DOMRect);
}
/** Leave the page and come back, so the road measures itself again at whatever width is set. */
async function remountFuture() {
  goCar();
  await advance(600);
  goFuture();
  await advance(0);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  localStorage.clear();
  resetForkStoreForTests();
  seen.length = 0;
});

afterEach(() => {
  cleanup();
  setScreenWidth(null);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// A few more changes of other kinds, so every kind of event card and explanation is read. Months are inside the five years.
const MORE_CHANGES: Array<Omit<LifeEvent, "id" | "status">> = [
  { type: "cargo_change", month: 18, payload: { cargoNeed: "high" }, source: "user", assumptions: ["Assumes the extra gear fits behind the seats"], certainty: "inferred", quote: "we need more cargo room" },
  { type: "budget_change", month: 3, payload: { monthlyBudget: 450 }, source: "user", assumptions: [], certainty: "clear" },
  { type: "fuel_price_change", month: 8, payload: { fuelPricePerGal: 5.25 }, source: "user", assumptions: [], certainty: "vague" },
  { type: "maintenance_decision", month: 24, payload: {}, source: "user", assumptions: [], certainty: "clear" },
  { type: "mileage_change", month: 40, payload: { commuteMilesOneWay: 30, commuteDaysPerWeek: 5 }, source: "user", assumptions: ["Assumes every week"], certainty: "inferred" },
];

describe("a customer never reads the words demo or data", () => {
  it("not on the first screen, nor on the car picker behind it", async () => {
    render(<ForkApp />);
    await advance(0);
    sweep("first screen");
    fireEvent.click(screen.getByRole("button", { name: "No VIN? Choose your car" }));
    sweep("car picker");
    fireEvent.click(screen.getByRole("button", { name: "Back to VIN" }));
    fireEvent.change(screen.getByPlaceholderText("Enter your VIN"), { target: { value: "123i" } });
    sweep("a VIN with a bad letter");
    fireEvent.change(screen.getByPlaceholderText("Enter your VIN"), { target: { value: "4T1G11AK2NU900001" } });
    fireEvent.click(screen.getByRole("button", { name: "Decode VIN" }));
    sweep("a VIN whose check digit is wrong");
  });

  it("not while the car forms, on the car page, or in the assumptions drawer with every group open", async () => {
    await openCamry();
    sweep("the car forming");
    await advance(1200);
    sweep("the car forming, a moment later");
    await advance(2900);
    expect(state().phase).toBe("workspace");
    expect(state().ui.view).toBe("car");
    sweep("car page, with the specs up");
    await advance(31_000);
    sweep("car page, after the specs fade");

    // the assumptions drawer: vehicle, household, financing, priorities, and the groups that start closed (History, Display,
    // Session). The history is written by another module, so make sure there is some, or the sweep would not mean anything.
    const sheet = openAssumptionsEverywhere();
    for (const name of ["History", "Display", "Session"]) expect(within(sheet).getByRole("button", { name }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("vehicle-history-list").querySelectorAll("li").length).toBeGreaterThan(0);
    sweep("the assumptions drawer, every group open, with the history");
    closeAssumptions();

    // asking something the car page can answer, and the question it asks back
    await act(async () => {
      await actions().submitDump("hi");
    });
    sweep("the car page after a sentence it could not use");
    expectRealWalk(5);
  });

  it("not on the Future page before comparing: the road, the offer, scrubbing, playing, each drawer, a narrow road, the confirm card", async () => {
    await enterWorkspace();

    // tell it something, and read the card that asks you to confirm it (on the car page)
    await act(async () => {
      await actions().submitDump(data.demo.brainDump);
    });
    expect(state().explore.draftChanges.length).toBeGreaterThan(0);
    const waiting = screen.getByTestId("confirm-proposal-card");
    expect(waiting.textContent).toContain("Branch timeline");
    sweep("the confirm card on the car page, changes waiting to be confirmed");

    // one tap confirms them and takes you to the Future page
    await act(async () => {
      fireEvent.click(within(waiting).getByRole("button", { name: /branch timeline/i }));
    });
    await advance(0);
    expect(state().ui.view).toBe("future");
    expect(state().comparison).toBeNull();
    expect(screen.getByTestId("journey-timeline").getAttribute("data-orientation")).toBe("horizontal");
    sweep("the Future page, before comparing: the offer to compare");

    // more changes, of every kind, waiting on the Future page (the card floats over it)
    act(() => {
      for (const e of MORE_CHANGES) actions().addDraft(e);
    });
    expect(screen.getByTestId("confirm-proposal-card")).toBeInTheDocument();
    sweep("the confirm card on the Future page, with every kind of change waiting");
    await act(async () => {
      fireEvent.click(within(screen.getByTestId("confirm-proposal-card")).getByRole("button", { name: /branch timeline/i }));
    });
    await advance(0);
    expect(state().explore.draftChanges).toHaveLength(0);
    expect(screen.getAllByTestId("event-marker").length).toBeGreaterThanOrEqual(8);
    await advance(2100); // the highlight on what just changed ends
    sweep("the Future page with every kind of change, before comparing");

    // an event: its card, then its full explanation, one by one
    await walkEvents("before comparing");

    // the other drawers, with nothing to compare yet
    await sweepDrawer(() => fireEvent.click(screen.getByRole("button", { name: "Compare costs" })), "Compare costs", "the costs drawer, before comparing");
    await sweepDrawer(() => actions().openDrawer("recommendation"), "Keep or switch?", "the recommendation drawer, before there is anything to recommend");

    // mid-scrub, and playing
    scrubTo(23);
    expect(state().activeMonth).toBe(23);
    sweep("the Future page, mid scrub");
    scrubTo(60);
    sweep("the Future page, scrubbed to the end");
    scrubTo(0);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(state().ui.playing).toBe(true);
    await advance(1500);
    expect(state().activeMonth).toBeGreaterThan(0);
    sweep("the Future page, playing");
    await advance(500);
    sweep("the Future page, playing, a little further");
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(state().ui.playing).toBe(false);
    sweep("the Future page, paused");

    // the road, selecting, and the other road: both futures are paths on it
    fireEvent.click(screen.getAllByTestId("event-marker")[0]);
    sweep("the Future page with an event selected");
    fireEvent.click(screen.getByRole("button", { name: /^Keep your/ }));
    sweep("the offer, the keep path selected");

    // a narrow screen: the road runs down the page
    setScreenWidth(360);
    await remountFuture();
    expect(screen.getByTestId("journey-timeline").getAttribute("data-orientation")).toBe("vertical");
    sweep("a narrow road, before comparing");
    scrubTo(30);
    sweep("a narrow road, mid scrub");
    await walkEvents("a narrow road, before comparing");
    await sweepDrawer(() => fireEvent.click(screen.getByRole("button", { name: "Compare costs" })), "Compare costs", "a narrow road, the costs drawer");
    setScreenWidth(null);

    expectRealWalk(30);
  });

  it("not on the Future page after comparing: both futures, each drawer, what would change it, the terms, a narrow road", async () => {
    await enterWorkspace();
    await act(async () => {
      await actions().submitDump(data.demo.brainDump);
    });
    act(() => {
      for (const e of MORE_CHANGES) actions().addDraft(e);
    });
    await act(async () => {
      fireEvent.click(within(screen.getByTestId("confirm-proposal-card")).getByRole("button", { name: /branch timeline/i }));
    });
    await advance(2100);
    expect(state().ui.view).toBe("future");

    // compare, the way the page offers it
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Compare with the/ }));
    });
    await advance(0);
    expect(state().comparison).not.toBeNull();
    expect(state().evaluation).not.toBeNull();
    expect(screen.getAllByTestId("destination")).toHaveLength(2);
    sweep("the Future page, just after comparing: both futures priced");
    await advance(1900); // the car morphs, the explanation words arrive
    sweep("the Future page, after comparing, once the words have arrived");

    // the keep future and the switch future, each selected, with every event walked
    await walkEvents("after comparing, keep selected");
    fireEvent.click(screen.getAllByTestId("destination").find((d) => d.getAttribute("data-future") === "switch") as Element);
    await advance(0);
    expect(screen.getByTestId("road-path-switch").getAttribute("data-selected")).toBe("true");
    sweep("the switch future selected");
    await walkEvents("after comparing, switch selected");
    const swap = state().explore.scenarios.flatMap((s) => s.events).find((e) => e.type === "vehicle_replacement");
    expect(swap, "a swap exists, so the car changes on the road").toBeDefined();
    scrubTo(Math.max(0, (swap?.month ?? 12) - 1));
    sweep("the switch future, the month before the swap (still the Camry)");
    scrubTo(swap?.month ?? 12);
    sweep("the switch future, the month of the swap");
    scrubTo(60);
    sweep("the switch future, at the end (the RAV4)");
    scrubTo(0);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    await advance(1800);
    expect(state().activeMonth).toBeGreaterThan(0);
    sweep("the switch future, playing");
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));

    // the heading is the recommendation; its drawer, the costs, and what would change the answer
    scrubTo(20);
    await sweepDrawer(() => fireEvent.click(screen.getByTestId("journey-heading")), /^(Close call|Keep your|Switch to)/, "the recommendation drawer");
    await sweepDrawer(() => fireEvent.click(screen.getByRole("button", { name: "Compare costs" })), "Compare costs", "the costs drawer, both futures priced");

    // the costs drawer has its own month slider and chart: move it
    fireEvent.click(screen.getByRole("button", { name: "Compare costs" }));
    await advance(0);
    const costs = screen.getByRole("dialog", { name: "Compare costs" });
    for (const slider of within(costs).queryAllByRole("slider")) fireEvent.change(slider, { target: { value: "37" } });
    sweep("the costs drawer, its own slider moved");
    fireEvent.click(within(costs).getByRole("button", { name: "Close" }));
    await advance(400);

    fireEvent.click(screen.getByTestId("journey-heading"));
    await advance(0);
    const rec = screen.getByRole("dialog", { name: /^(Close call|Keep your|Switch to)/ });
    await act(async () => {
      fireEvent.click(within(rec).getByRole("button", { name: "Show what would change it" }));
    });
    await advance(0);
    expect(state().breakEven).not.toBeNull();
    sweep("the recommendation drawer, with what would change it");
    fireEvent.click(within(rec).getByRole("button", { name: "Close" }));
    await advance(400);

    // asking it in words
    await act(async () => {
      await actions().submitDump("What would have to change for keeping the Camry to be the better option?");
    });
    await advance(0);
    sweep("the Future page after asking what would change it");

    // the terms of the replacement, in the assumptions drawer with every group open
    const sheet = openAssumptionsEverywhere();
    expect(within(sheet).getByRole("button", { name: "Replacement terms" }).getAttribute("aria-expanded")).toBe("true");
    sweep("the assumptions drawer after comparing, every group open, with the replacement terms");
    closeAssumptions();

    // the other lives you made, in the selector
    expect(screen.getByTestId("future-selector")).toBeInTheDocument();
    sweep("the Future page with another future to choose");

    // a narrow road, compared, both futures
    setScreenWidth(360);
    await remountFuture();
    expect(screen.getByTestId("journey-timeline").getAttribute("data-orientation")).toBe("vertical");
    sweep("a narrow road, after comparing");
    fireEvent.click(screen.getAllByTestId("destination").find((d) => d.getAttribute("data-future") === "switch") as Element);
    sweep("a narrow road, the switch future selected");
    scrubTo(45);
    sweep("a narrow road, mid scrub, in the switch future");
    await walkEvents("a narrow road, after comparing");
    await sweepDrawer(() => fireEvent.click(screen.getByTestId("journey-heading")), /^(Close call|Keep your|Switch to)/, "a narrow road, the recommendation drawer");
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    await advance(1200);
    sweep("a narrow road, playing");
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    setScreenWidth(null);

    // and the car page again, now that the car has been compared
    goCar();
    await advance(2000);
    sweep("the car page after comparing");

    expectRealWalk(40);
  });

  it("not in an error, however it was worded where it came from", async () => {
    render(<ForkApp />);
    await advance(0);
    for (const message of ["Unsupported demo vehicle", "Provider data or profile failed validation", "The saved demo vehicle could not be loaded"]) {
      act(() => useForkStore.setState({ error: message }));
      sweep(`error: ${message}`);
    }
  });
});
