import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LifeEvent, SimulationResult } from "@/contracts";
import { buildTradeoff } from "@/ui/compare/tradeoff";
import { robustnessLine } from "@/ui/compare/Verdict";
import { dateLabel } from "@/ui/journey/dates";
import { EVENT_CARD_SIZE } from "@/ui/journey/EventCard";
import { DWELL_MS, MS_PER_MONTH } from "@/ui/journey/playback";
import { prioritiesInWords } from "@/ui/journey/RecommendationContent";
import { makeFrame, timePos } from "@/ui/journey/roadGeometry";
import { ai, data, sim } from "@/ui/mocks";
import { customerText } from "@/ui/profile/customerText";
import { monthLabel, usd } from "@/ui/profile/format";
import { eventTitle } from "@/ui/store/eventLabels";
import { resetForkStoreForTests, simulationInputs, useForkStore } from "@/ui/store/useForkStore";
import { ForkApp } from "./ForkApp";

const state = () => useForkStore.getState();

// Built from the code point so this file has none itself.
const EM_DASH = String.fromCharCode(0x2014);

/** Flush promises, then run the stub's timers. */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

// The demo Camry's made-up VIN, typed into the first screen the way a person would.
const ALEX_CAMRY_VIN = "4T1G11AK1NU900001";

async function openCamry() {
  render(<ForkApp />);
  await advance(0);
  fireEvent.change(screen.getByPlaceholderText("Enter your VIN"), { target: { value: ALEX_CAMRY_VIN } });
  fireEvent.click(screen.getByRole("button", { name: "Decode VIN" }));
  await advance(0);
}

async function enterWorkspace() {
  await openCamry();
  await advance(4100);
}

const goFuture = () => fireEvent.click(screen.getByRole("tab", { name: "Future" }));
const goCar = () => fireEvent.click(screen.getByRole("tab", { name: "Car" }));
// Opens the drawer and every dropdown in it, so a test can reach any control. (DetailsSheet.test.tsx covers the dropdowns.)
const openDetails = () => {
  fireEvent.click(screen.getByRole("button", { name: "Edit assumptions" }));
  const dialog = screen.getByRole("dialog", { name: "Edit assumptions" });
  for (const h of within(dialog).getAllByRole("heading", { level: 3 })) {
    const header = within(h).getByRole("button");
    if (header.getAttribute("aria-expanded") !== "true") fireEvent.click(header);
  }
};
const stats = () => [...document.querySelectorAll('[data-slot="stat"]')];

// ---- the Future page: where things are on it ----
const slider = () => screen.getByRole("slider", { name: "Selected month" }) as HTMLInputElement;
const scrubTo = (month: number) => fireEvent.change(slider(), { target: { value: String(month) } });
const timeline = () => screen.getByTestId("journey-timeline");
const marker = () => screen.getByTestId("time-marker");
const stage = () => screen.getByTestId("car-stage-stub");
const destination = (future: "keep" | "switch") => document.querySelector(`[data-testid="destination"][data-future="${future}"]`) as HTMLElement;
const eventMarkers = () => screen.getAllByTestId("event-marker");
/** A drawer panel by its label, whether or not it is open. (A shut one is hidden, which leaves it without a computed name.) */
const drawerPanel = (label: string) => screen.getAllByRole("dialog", { hidden: true }).find((d) => d.getAttribute("aria-label") === label)!;
const eventMarker = (id: string) => document.querySelector(`[data-testid="event-marker"][data-event-id="${id}"]`) as HTMLElement;

const denver = {
  type: "relocation" as const,
  month: 12,
  payload: { location: "Denver" },
  source: "user" as const,
  assumptions: [],
  quote: "moving to Denver next year",
  certainty: "clear" as const,
};

const mileage = {
  type: "mileage_change" as const,
  month: 30,
  payload: { annualMiles: 24000 },
  source: "user" as const,
  assumptions: [],
  certainty: "clear" as const,
};

const family = {
  type: "family_change" as const,
  month: 6,
  payload: { children: 2 },
  source: "user" as const,
  assumptions: [],
  quote: "expecting a second child this spring",
  certainty: "clear" as const,
};

type Said = typeof denver | typeof mileage | typeof family;

/** Say these in the chat and confirm them, the way the command bar does it. */
const confirm = (...events: Said[]) =>
  act(() => {
    for (const e of events) state().actions.addDraft(e);
    state().actions.confirmDrafts(state().explore.draftChanges.map((d) => d.id));
  });
const confirmDenver = () => confirm(denver);
const compareNow = async () => {
  fireEvent.click(screen.getByRole("button", { name: /Compare with the RAV4/ }));
  await advance(0);
};
/** The Future page with the other car compared (and what was said confirmed first). */
async function openCompared(...events: Said[]) {
  await enterWorkspace();
  if (events.length > 0) confirm(...events);
  goFuture();
  await compareNow();
}

// ---- what the engine says, to check the page against ----
/** The simulation's net cost for a future at a month (the page never shows a number that is not one of these). */
const at = (scenarioId: string, month: number): number => state().results[scenarioId].points.find((p) => p.month === month)!.netEconomicCost;
/** What the engine called it, in the words the heading uses. */
function verdictWords(): string {
  const { evaluation, comparison } = state();
  if (evaluation!.preferredScenarioId === "inconclusive") return "Close call";
  return evaluation!.preferredScenarioId === comparison!.keepId ? "Keep your Camry" : "Switch to the RAV4";
}
/** The one line about the gap, from the two rounded five-year figures. */
function differenceWords(): string {
  const { keepId, replaceId } = state().comparison!;
  const amount = Math.round(at(replaceId, 60)) - Math.round(at(keepId, 60));
  return `${amount > 0 ? `Switching adds ${usd(amount)}` : amount < 0 ? `Switching saves ${usd(-amount)}` : "No difference between the two"} over five years.`;
}
/** Where the simulation would put a swap for the future on screen. */
function defaultSwapMonth(): number {
  const keep = state().explore.scenarios.find((sc) => sc.id === state().activeScenarioId)!;
  const other = data.listSampleVehicles().find((v) => v.id !== state().twin!.vehicle.id)!;
  const swaps = sim.makeReplaceScenario(keep, other).events.filter((e) => e.type === "vehicle_replacement");
  return swaps[swaps.length - 1].month;
}
/** What a future holds that the person said (not the swap). */
const lifeIn = (scenarioId: string): LifeEvent[] => state().explore.scenarios.find((sc) => sc.id === scenarioId)!.events.filter((e) => e.type !== "vehicle_replacement");
const swapOf = (scenarioId: string): LifeEvent => state().explore.scenarios.find((sc) => sc.id === scenarioId)!.events.find((e) => e.type === "vehicle_replacement")!;
/** What one event does at month 60, by running its future again without it: the cost and the miles it adds. */
function engineEffect(scenarioId: string, eventId: string): { cost: number; miles: number } {
  const inputs = simulationInputs(state())!;
  const scenario = state().explore.scenarios.find((sc) => sc.id === scenarioId)!;
  const without = sim.simulate(inputs.twin, { ...scenario, events: scenario.events.filter((e) => e.id !== eventId) }, inputs.ctx);
  const end = (r: SimulationResult) => r.points.find((p) => p.month === 60)!;
  return { cost: end(state().results[scenarioId]).netEconomicCost - end(without).netEconomicCost, miles: end(state().results[scenarioId]).mileage - end(without).mileage };
}
/** Everything a person could read or hear: text, labels, tooltips. */
function everythingVisible(): string {
  const out = [document.body.textContent ?? ""];
  for (const el of document.body.querySelectorAll("*")) {
    for (const name of ["title", "aria-label", "placeholder", "alt", "aria-valuetext"]) {
      const v = el.getAttribute(name);
      if (v) out.push(v);
    }
  }
  return out.join("\n");
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  resetForkStoreForTests();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks(); // a spy on the AI or the layout must never leak into the next test
  vi.unstubAllGlobals();
});

describe("flow", () => {
  it("boots to landing with the mock banner on", async () => {
    render(<ForkApp />);
    await advance(0);
    expect(screen.getByText("The future branches. Explore yours.", { selector: "p" })).toBeInTheDocument();
    // Data, sim, decision and the AI are real now. Only the 3D stage is still a placeholder.
    expect(screen.getByTestId("mock-banner")).toHaveTextContent("car is a placeholder");
    expect(screen.getByTestId("mock-banner")).not.toHaveTextContent(/\b(data|sim|decision|ai)\b/);
    expect(screen.getByPlaceholderText("Enter your VIN")).toBeInTheDocument(); // the first screen is your VIN
    // nothing to open before there is a car
    expect(screen.queryByRole("button", { name: "Edit assumptions" })).toBeNull();
  });

  it("runs the reveal and lands on the car page", async () => {
    await openCamry();
    const stage = screen.getByTestId("car-stage-stub");
    expect(stage).toHaveAttribute("data-phase", "reveal");
    expect(stage).toHaveAttribute("data-vehicle-id", "camry-2022-se");
    // during the reveal: no command bar, no page switch
    expect(screen.queryByRole("tablist", { name: "Page" })).toBeNull();
    expect(screen.queryByPlaceholderText(/tell fork/i)).toBeNull();

    await advance(4100);
    expect(state().phase).toBe("workspace");
    expect(screen.getByTestId("car-stage-stub")).toHaveAttribute("data-phase", "interactive");
    expect(screen.getByRole("tab", { name: "Car" })).toHaveAttribute("aria-selected", "true");
  });

  it("skip jumps straight into the workspace at any moment of the reveal", async () => {
    await openCamry();
    await advance(1000);
    expect(state().phase).toBe("reveal");
    fireEvent.click(screen.getByRole("button", { name: /^skip$/i }));
    await advance(0);
    expect(state().phase).toBe("workspace");
  });

  it("start over (in the details sheet) goes back to the landing screen", async () => {
    await enterWorkspace();
    openDetails();
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(state().phase).toBe("landing");
    expect(screen.getByPlaceholderText("Enter your VIN")).toHaveValue(""); // back to the one field, empty
  });

  it("switching the sample car restarts the stage on the new car", async () => {
    await enterWorkspace();
    openDetails();
    fireEvent.click(within(screen.getByRole("dialog", { name: "Edit assumptions" })).getByRole("button", { name: /2024 RAV4/ }));
    await advance(0);
    const stage = screen.getByTestId("car-stage-stub");
    expect(stage).toHaveAttribute("data-vehicle-id", "rav4-2024-hybrid-xle");
    expect(stage).toHaveAttribute("data-phase", "reveal");
  });
});

describe("the car page", () => {
  it("is just the car, its name, the command bar and the page switch, and the car's own specs for a while", async () => {
    await enterWorkspace();
    expect(screen.getByRole("heading", { level: 1, name: "2022 Toyota Camry" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/tell fork what's changing/i)).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "Page" })).toBeInTheDocument();

    // The only numbers are the car's own four specs, and they fade away. Never a timeline or a side panel.
    expect(stats()).toHaveLength(4);
    expect(screen.getByTestId("reveal-specs").querySelectorAll('[data-slot="stat"]')).toHaveLength(4);
    await advance(60_000);
    expect(stats()).toHaveLength(0);
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByTestId("future-view")).toBeNull();
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.queryByTestId("road")).toBeNull();
  });

  it("the header has only the wordmark and one button", async () => {
    await enterWorkspace();
    const header = screen.getByRole("banner");
    expect(within(header).getAllByRole("button")).toHaveLength(1);
    expect(within(header).getByRole("button", { name: "Edit assumptions" })).toBeInTheDocument();
  });

  it("shows the name of the branch you are looking at, only when it is not the baseline", async () => {
    await enterWorkspace();
    expect(screen.queryByText(/Move to Denver/)).toBeNull();
    act(() => {
      state().actions.addDraft(denver);
      state().actions.confirmDrafts(state().explore.draftChanges.map((d) => d.id));
    });
    goCar();
    expect(screen.getByText(/Representative 3D model/)).toHaveTextContent("Move to Denver");
  });

  it("never prints placeholder paint text from the fixtures", async () => {
    await enterWorkspace();
    openDetails();
    expect(document.body.textContent).not.toMatch(/TODO/);
  });
});


describe("the future page", () => {
  it("opens on your next five years at month 0: the road, what keeping costs, and a dashed offer that is not priced", async () => {
    await enterWorkspace();
    goFuture();
    expect(screen.getByRole("tab", { name: "Future" })).toHaveAttribute("aria-selected", "true");
    expect(state().activeMonth).toBe(0);

    // Before a comparison the heading is plain text: there is no recommendation to open yet.
    const heading = screen.getByRole("heading", { level: 1, name: "Your next five years" });
    expect(within(heading).queryByRole("button")).toBeNull();
    expect(screen.queryByTestId("journey-heading")).toBeNull();
    expect(screen.getByTestId("journey-difference")).toHaveTextContent("Compare to see what switching would change over five years.");

    // The road, at month 0, on the horizontal layout.
    expect(timeline()).toHaveAttribute("data-month", "0");
    expect(timeline()).toHaveAttribute("data-orientation", "horizontal");
    expect(slider().value).toBe("0");
    expect(marker()).toHaveAttribute("data-month", "0");
    expect(screen.getByTestId("road-path-keep")).toHaveAttribute("data-dashed", "false");

    // Keeping is priced, and its figure is the simulation's month 60.
    expect(destination("keep")).toHaveTextContent("Keep your Camry");
    expect(destination("keep")).toHaveTextContent(usd(at("base", 60)));
    expect(destination("keep")).toHaveTextContent("over five years");
    expect(destination("keep")).toHaveTextContent("2022 Camry SE");

    // Switching is an offer: dashed, from the month the simulation would default to, with no dollar figure of its own.
    const offer = screen.getByTestId("road-path-switch");
    expect(offer).toHaveAttribute("data-dashed", "true");
    expect(offer.getAttribute("stroke-dasharray")).toBeTruthy();
    expect(offer).toHaveAttribute("data-split-month", String(defaultSwapMonth()));
    expect(destination("switch")).toHaveTextContent("Switch to the RAV4");
    expect(destination("switch")).toHaveTextContent("Compare");
    expect(destination("switch").textContent).not.toContain("$");
    expect(destination("switch")).toHaveAttribute("aria-pressed", "false");
    expect(Object.keys(state().results)).toEqual(["base"]); // nothing was simulated for it
    expect(timeline().textContent!.match(/\$[\d,]+/g)).toEqual([usd(at("base", 60))]); // the only dollar figure on the road is keeping's

    // One way to compare the costs and one to compare with the other car, and nothing else on the page asks for it.
    expect(screen.getAllByRole("button", { name: "Compare costs" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /Compare with the RAV4/ })).toHaveLength(1);
    expect(screen.queryByTestId("future-selector")).toBeNull(); // one future so far: nothing to choose between

    // The scrubber waits at month 0 with Play, and the event card describes the moment, with nothing to explain yet.
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    const card = screen.getByRole("region", { name: "Selected moment" });
    expect(card).toHaveAttribute("data-state", "moment");
    expect(card).toHaveTextContent(dateLabel(state().todayISO, 0));
    expect(within(card).queryByRole("button", { name: "Explain this" })).toBeNull();
    expect(screen.queryByTestId("explain-content")).toBeNull(); // the long version waits behind a click
    expect(state().ui.drawer).toBeNull();
  });

  it("nothing plays by itself", async () => {
    await enterWorkspace();
    goFuture();
    await advance(10_000);
    expect(state().ui.playing).toBe(false);
    expect(state().activeMonth).toBe(0);
    expect(screen.getByRole("button", { name: "Play" })).toHaveAttribute("aria-pressed", "false");
    expect(slider().value).toBe("0");

    confirmDenver();
    await compareNow();
    await advance(10_000);
    expect(state().ui.playing).toBe(false);
    expect(state().activeMonth).toBe(0);
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("draws every event the person confirmed at its modeled month, once, and names it with its date", async () => {
    await enterWorkspace();
    confirm(denver, mileage);
    goFuture();
    const keepId = state().activeScenarioId;
    const events = lifeIn(keepId);
    expect(events.map((e) => e.month).sort((a, b) => a - b)).toEqual([12, 30]);
    expect(eventMarkers()).toHaveLength(2);
    for (const e of events) {
      const m = eventMarker(e.id);
      expect(m).toHaveAttribute("data-month", String(e.month));
      expect(m).toHaveAccessibleName(`${eventTitle(e)}, ${dateLabel(state().todayISO, e.month)}`);
    }
    expect(eventMarker(events.find((e) => e.type === "relocation")!.id)).toHaveAccessibleName("Move to Denver, Oct 2027");
  });

  it("Edit assumptions, in the header, opens the assumptions drawer from here too", async () => {
    await enterWorkspace();
    goFuture();
    expect(screen.getByRole("dialog", { name: "Edit assumptions" })).toHaveAttribute("data-open", "false");
    fireEvent.click(screen.getByRole("button", { name: "Edit assumptions" }));
    expect(state().ui.detailsOpen).toBe(true);
    expect(screen.getByRole("dialog", { name: "Edit assumptions" })).toHaveAttribute("data-open", "true");
  });

  it("is on screen alongside the command bar on this page, and reads no build words", async () => {
    await enterWorkspace();
    goFuture();
    expect(screen.getByRole("button", { name: "Submit changes" })).toBeInTheDocument();
    expect(everythingVisible()).not.toMatch(/demo|data/i);
    expect(everythingVisible()).not.toContain(EM_DASH);
  });
});

describe("the future page, after comparing", () => {
  it("the heading is the engine's call, and it opens the recommendation", async () => {
    await openCompared(denver);
    const preferred = state().evaluation!.preferredScenarioId;
    expect(["inconclusive", state().comparison!.keepId, state().comparison!.replaceId]).toContain(preferred);

    const heading = screen.getByRole("heading", { level: 1 });
    const button = within(heading).getByRole("button", { name: verdictWords() });
    expect(button).toHaveAttribute("data-testid", "journey-heading");
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    expect(verdictWords()).toMatch(/^(Close call|Keep your Camry|Switch to the RAV4)$/);
    expect(screen.queryByRole("button", { name: /Compare with the RAV4/ })).toBeNull(); // the offer is gone once it is priced
    expect(state().ui.drawer).toBeNull();

    fireEvent.click(button);
    expect(state().ui.drawer).toBe("recommendation");
    expect(screen.getByRole("dialog", { name: verdictWords() })).toHaveAttribute("data-open", "true");
    expect(screen.getByTestId("recommendation-content")).toBeInTheDocument();
  });

  it("says the difference in one line, from the two rounded five-year figures", async () => {
    await openCompared(denver);
    const { keepId, replaceId } = state().comparison!;
    expect(screen.getByTestId("journey-difference")).toHaveTextContent(differenceWords());
    expect(screen.getByTestId("journey-difference").textContent).toMatch(/^(Switching (adds|saves) \$[\d,]+|No difference between the two) over five years\.$/);
    expect(Math.round(at(replaceId, 60)) - Math.round(at(keepId, 60))).not.toBe(0); // a real difference, so the sentence is not the empty case
  });

  it("shows each destination's five-year cost as the simulation's month 60, and no scrubbing changes it", async () => {
    await openCompared(denver);
    const { keepId, replaceId } = state().comparison!;
    const shown = () => ({ keep: destination("keep").textContent, sw: destination("switch").textContent, line: screen.getByTestId("journey-difference").textContent });
    expect(destination("keep")).toHaveTextContent(usd(at(keepId, 60)));
    expect(destination("switch")).toHaveTextContent(usd(at(replaceId, 60)));
    expect(destination("keep")).toHaveTextContent("Keep your Camry");
    expect(destination("switch")).toHaveTextContent("Switch to the RAV4");
    const first = shown();

    // the range input...
    for (const month of [5, 11, 12, 13, 30, 59, 60, 0]) {
      scrubTo(month);
      expect(state().activeMonth).toBe(month);
      expect(shown()).toEqual(first);
    }
    // ...and every month of the clock, set directly
    for (let month = 0; month <= 60; month++) {
      act(() => state().actions.setActiveMonth(month));
      expect(shown()).toEqual(first);
    }
    // the through-this-month figure is separate, labeled, and the simulation's own monthly number
    scrubTo(24);
    const through = document.querySelector('[data-slot="through"]')!;
    expect(through).toHaveTextContent(`Through ${dateLabel(state().todayISO, 24)}: ${usd(at(replaceId, 24))}`);
    expect(through.textContent).not.toContain(usd(at(replaceId, 60)));
    expect(shown()).toEqual(first);
  });

  it("says where the figures come from once, for both destinations, not as a badge under each number", async () => {
    await openCompared(denver);
    const labels = screen.getAllByTestId("journey-source");
    expect(labels).toHaveLength(1);
    expect(labels[0].querySelector("[data-source]")).not.toBeNull();
    expect(labels[0]).toHaveTextContent("Modeled net cost");
    expect(screen.getByTestId("journey-header").contains(labels[0])).toBe(true);
    expect(timeline().querySelector("[data-source]")).toBeNull();
    for (const future of ["keep", "switch"] as const) {
      expect(destination(future).querySelector("[data-source]")).toBeNull();
      expect(destination(future).textContent).not.toMatch(/illustrative|estimated|synthetic|sourced|listing/i);
    }
  });

  it("the verdict stays the engine's when you look around: it only changes when the numbers do", async () => {
    await openCompared(denver);
    const evaluation = state().evaluation;
    const words = verdictWords();
    const line = screen.getByTestId("journey-difference").textContent;
    scrubTo(40);
    fireEvent.click(destination("keep"));
    fireEvent.click(destination("switch"));
    fireEvent.click(screen.getByTestId("road-hit-other"));
    expect(state().evaluation).toBe(evaluation);
    expect(screen.getByTestId("journey-heading")).toHaveTextContent(words);
    expect(screen.getByTestId("journey-difference").textContent).toBe(line);
  });
});

describe("scrubbing", () => {
  it("the range input, the road's marker and the date move together, to the month on the clock", async () => {
    await openCompared(denver);
    for (const month of [7, 12, 33, 60, 1, 0]) {
      scrubTo(month);
      expect(state().activeMonth).toBe(month);
      expect(slider().value).toBe(String(month));
      expect(marker()).toHaveAttribute("data-month", String(month));
      expect(timeline()).toHaveAttribute("data-month", String(month));
      expect(document.querySelector('[data-slot="date"]')).toHaveTextContent(dateLabel(state().todayISO, month));
    }
    // the marker rides the selected future's path at that month
    scrubTo(20);
    expect(marker()).toHaveAttribute("data-future", "switch");
    fireEvent.click(destination("keep"));
    expect(marker()).toHaveAttribute("data-future", "keep");
    expect(marker()).toHaveAttribute("data-month", "20");
  });

  it("keys on the range input move the same clock, and a key press while it plays is a manual move that pauses it", async () => {
    await enterWorkspace();
    goFuture();
    slider().focus();
    fireEvent.keyDown(slider(), { key: "ArrowRight" });
    expect(state().activeMonth).toBe(1);
    expect(marker()).toHaveAttribute("data-month", "1");
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    await advance(300);
    expect(state().ui.playing).toBe(true);
    fireEvent.keyDown(slider(), { key: "ArrowRight" });
    expect(state().ui.playing).toBe(false);
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    fireEvent.keyDown(slider(), { key: "End" });
    expect(state().activeMonth).toBe(60);
    expect(marker()).toHaveAttribute("data-month", "60");
    fireEvent.keyDown(slider(), { key: "Home" });
    expect(state().activeMonth).toBe(0);
    expect(marker()).toHaveAttribute("data-month", "0");
  });

  it("dragging along the road moves the same clock as the range input", async () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    const frame = makeFrame(1120, true);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 1120, bottom: 380, width: 1120, height: 380, toJSON: () => ({}) } as DOMRect);
    await openCompared(denver);
    const hit = screen.getByTestId("road-hit");
    fireEvent.pointerDown(hit, { clientX: timePos(frame, 30), clientY: 150, pointerId: 1, button: 0, pointerType: "mouse" });
    expect(state().activeMonth).toBe(30);
    fireEvent.pointerMove(hit, { clientX: timePos(frame, 41), clientY: 150, pointerId: 1 });
    expect(state().activeMonth).toBe(41);
    fireEvent.pointerUp(hit, { pointerId: 1 });
    expect(slider().value).toBe("41");
    expect(marker()).toHaveAttribute("data-month", "41");
    expect(document.querySelector('[data-slot="date"]')).toHaveTextContent(dateLabel(state().todayISO, 41));
  });

  it("the car is the Camry before the swap month and the RAV4 from it, in the readout and on the stage", async () => {
    await openCompared(denver);
    const swap = swapOf(state().comparison!.replaceId);
    expect(swap.month).toBe(12); // the demo's replacement lands in year one
    const vehicle = () => document.querySelector('[data-slot="vehicle"]')!.textContent;

    scrubTo(swap.month - 1);
    expect(vehicle()).toBe("2022 Camry SE");
    expect(document.querySelector('[data-slot="swap-note"]')).toBeNull();
    goCar();
    expect(stage()).toHaveAttribute("data-vehicle-id", "camry-2022-se");
    expect(stage()).toHaveAttribute("data-phase", "interactive"); // nothing to morph yet
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("2022 Toyota Camry");

    goFuture();
    scrubTo(swap.month);
    expect(vehicle()).toBe("2024 RAV4 Hybrid XLE");
    expect(document.querySelector('[data-slot="swap-note"]')).toHaveTextContent("Swap this month");
    goCar();
    expect(stage()).toHaveAttribute("data-phase", "transition"); // the stage morphs to the car of that month
    await advance(1900);
    expect(stage()).toHaveAttribute("data-vehicle-id", "rav4-2024-hybrid-xle");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("2024 Toyota RAV4");

    goFuture();
    scrubTo(swap.month - 1);
    expect(vehicle()).toBe("2022 Camry SE");
    goCar();
    await advance(1900);
    expect(stage()).toHaveAttribute("data-vehicle-id", "camry-2022-se");
  });

  it("keeping never changes cars, wherever you scrub", async () => {
    await openCompared(denver);
    fireEvent.click(destination("keep"));
    for (const month of [0, 12, 40, 60]) {
      scrubTo(month);
      expect(document.querySelector('[data-slot="vehicle"]')).toHaveTextContent("2022 Camry SE");
    }
    goCar();
    await advance(1900);
    expect(stage()).toHaveAttribute("data-vehicle-id", "camry-2022-se");
  });
});

describe("events", () => {
  async function comparedWithTwoEvents() {
    await openCompared(denver, mileage);
    const { keepId, replaceId } = state().comparison!;
    return { keepId, replaceId, moveId: lifeIn(keepId).find((e) => e.type === "relocation")!.id, milesId: lifeIn(keepId).find((e) => e.type === "mileage_change")!.id, swapId: swapOf(replaceId).id };
  }

  it("clicking an event's marker selects it, moves the month to its date and fills the event card", async () => {
    const { moveId, milesId } = await comparedWithTwoEvents();
    expect(state().selectedEventId).toBeNull();

    fireEvent.click(eventMarker(milesId));
    expect(state().selectedEventId).toBe(milesId);
    expect(state().activeMonth).toBe(30);
    expect(eventMarker(milesId)).toHaveAttribute("aria-pressed", "true");
    expect(eventMarker(moveId)).toHaveAttribute("aria-pressed", "false");
    expect(marker()).toHaveAttribute("data-month", "30");
    expect(slider().value).toBe("30");

    const card = screen.getByRole("region", { name: "Selected moment" });
    expect(card).toHaveAttribute("data-state", "event");
    expect(screen.getByTestId("event-card-title")).toHaveTextContent("24,000 miles a year");
    expect(screen.getByTestId("event-card-when")).toHaveTextContent(`${dateLabel(state().todayISO, 30)} · In ${monthLabel(30)}`);
    // one sentence, from the simulation: the miles it adds over the five years (to the nearest hundred)
    const sentence = screen.getByTestId("event-card-sentence").textContent!;
    expect(sentence).toMatch(/^Adds about [\d,]+ miles over five years/);
    const said = Number(/about ([\d,]+) miles/.exec(sentence)![1].replace(/,/g, ""));
    expect(Math.abs(said - engineEffect(state().comparison!.replaceId, milesId).miles)).toBeLessThanOrEqual(50);
    expect(within(card).getByRole("button", { name: "Explain this" })).toBeInTheDocument();

    fireEvent.click(eventMarker(moveId));
    expect(state().selectedEventId).toBe(moveId);
    expect(state().activeMonth).toBe(12);
    expect(screen.getByTestId("event-card-title")).toHaveTextContent("Move to Denver");
    expect(screen.getByTestId("event-card-when")).toHaveTextContent(`${dateLabel(state().todayISO, 12)} · In ${monthLabel(12)}`);
    // the model puts no number on a move, and the card says that, not that it does not matter
    expect(screen.getByTestId("event-card-sentence")).toHaveTextContent("No direct vehicle-cost change modeled");
    expect(screen.getByTestId("event-card-sentence").textContent).not.toMatch(/no effect|does not matter|doesn't matter/i);
  });

  it("the swap is an event too: selecting it goes to its month, and its sentence is the engine's difference", async () => {
    const { swapId, replaceId } = await comparedWithTwoEvents();
    fireEvent.click(eventMarker(swapId));
    const swap = swapOf(replaceId);
    expect(state().selectedEventId).toBe(swapId);
    expect(state().activeMonth).toBe(swap.month);
    expect(screen.getByTestId("event-card-title")).toHaveTextContent("Switch to the RAV4");
    const effect = engineEffect(replaceId, swapId).cost;
    expect(screen.getByTestId("event-card-sentence")).toHaveTextContent(`Switching ${effect > 0 ? "adds" : "saves"} ${usd(Math.abs(Math.round(effect)))} over five years and changes your car in ${dateLabel(state().todayISO, swap.month)}.`);
  });

  it("the card keeps one size whether or not an event is selected, so choosing never pushes the page", async () => {
    const { moveId } = await comparedWithTwoEvents();
    const card = () => screen.getByTestId("event-card");
    expect(card().className).toContain(EVENT_CARD_SIZE);
    fireEvent.click(eventMarker(moveId));
    expect(card().className).toContain(EVENT_CARD_SIZE);
    expect(card()).toHaveAttribute("data-state", "event");
  });

  it("Explain this opens the explanation, Escape closes it, and focus goes back to the button", async () => {
    const { milesId, replaceId } = await comparedWithTwoEvents();
    fireEvent.click(eventMarker(milesId));
    const explain = screen.getByRole("button", { name: "Explain this" });
    explain.focus();
    fireEvent.click(explain);

    expect(state().ui.drawer).toBe("explain");
    const dialog = screen.getByRole("dialog", { name: "24,000 miles a year" });
    expect(dialog).toHaveAttribute("data-open", "true");
    expect(within(dialog).getByTestId("explain-content")).toHaveAttribute("data-mode", "event");
    expect(within(dialog).getByTestId("explain-title")).toHaveTextContent("24,000 miles a year");
    // what changes: the engine's dollars for this event, with where they come from
    const effect = engineEffect(replaceId, milesId);
    expect(within(dialog).getByTestId("change-cost")).toHaveTextContent(`${effect.cost > 0 ? "Adds" : "Saves"} ${usd(Math.abs(Math.round(effect.cost)))} ${effect.cost > 0 ? "to" : "on"} your five-year cost`);
    expect(within(dialog).getByTestId("change-cost").querySelector("[data-source]")).not.toBeNull();
    expect(within(dialog).getByTestId("explain-assumed")).toBeInTheDocument();
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Close" }));

    fireEvent.keyDown(window, { key: "Escape" });
    expect(state().ui.drawer).toBeNull();
    expect(drawerPanel("24,000 miles a year")).toHaveAttribute("data-open", "false");
    expect(document.activeElement).toBe(explain);
    expect(state().selectedEventId).toBe(milesId); // closing explains nothing away
  });

  it("the explanation says what the person said, and what Fork assumed in plain words", async () => {
    await openCompared(denver);
    const moveId = lifeIn(state().comparison!.keepId)[0].id;
    fireEvent.click(eventMarker(moveId));
    fireEvent.click(screen.getByRole("button", { name: "Explain this" }));
    const dialog = screen.getByRole("dialog", { name: "Move to Denver" });
    expect(within(dialog).getByTestId("explain-said")).toHaveTextContent("“moving to Denver next year”");
    expect(within(dialog).getByTestId("not-modeled")).toHaveTextContent("Fork does not put a number on this one yet");
    expect(within(dialog).getByTestId("change-cost")).toHaveTextContent("No direct vehicle-cost change modeled.");
    const close = within(dialog).getByRole("button", { name: "Close" });
    expect(document.activeElement).toBe(close);
    fireEvent.click(close);
    expect(state().ui.drawer).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Explain this" })); // back where the person was
  });
});

describe("selecting a future", () => {
  it("picking the other destination keeps the month and the engine's verdict, and the marker moves to that path", async () => {
    await openCompared(denver);
    const { keepId, replaceId } = state().comparison!;
    const evaluation = state().evaluation;
    const words = verdictWords();
    expect(state().activeScenarioId).toBe(replaceId); // comparing opens on the switch
    expect(destination("switch")).toHaveAttribute("aria-pressed", "true");
    scrubTo(30);

    fireEvent.click(destination("keep"));
    expect(state().activeScenarioId).toBe(keepId);
    expect(state().activeMonth).toBe(30);
    expect(timeline()).toHaveAttribute("data-month", "30");
    expect(destination("keep")).toHaveAttribute("aria-pressed", "true");
    expect(destination("switch")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("road-path-keep")).toHaveAttribute("data-selected", "true");
    expect(screen.getByTestId("road-path-switch")).toHaveAttribute("data-selected", "false");
    expect(marker()).toHaveAttribute("data-future", "keep");
    expect(screen.getByTestId("journey-heading")).toHaveTextContent(words);
    expect(state().evaluation).toBe(evaluation);

    fireEvent.click(destination("switch"));
    expect(state().activeScenarioId).toBe(replaceId);
    expect(state().activeMonth).toBe(30);
    expect(screen.getByTestId("road-path-switch")).toHaveAttribute("data-selected", "true");
    expect(marker()).toHaveAttribute("data-future", "switch");
    expect(screen.getByTestId("journey-heading")).toHaveTextContent(words);
  });

  it("the stage follows the month and the future: the RAV4 only on the switch, and only from the swap", async () => {
    await openCompared(denver);
    scrubTo(30);
    fireEvent.click(destination("keep"));
    expect(stage()).toHaveAttribute("data-phase", "interactive"); // keeping at month 30 is still the Camry
    fireEvent.click(destination("switch"));
    expect(stage()).toHaveAttribute("data-phase", "transition"); // the switch future at month 30 is the RAV4
    await advance(1900);
    expect(stage()).toHaveAttribute("data-vehicle-id", "rav4-2024-hybrid-xle");
    fireEvent.click(destination("keep"));
    await advance(1900);
    expect(stage()).toHaveAttribute("data-vehicle-id", "camry-2022-se");
  });

  it("the offer's Compare button prices the switch: its figure appears, from the simulation, and the offer is gone", async () => {
    await enterWorkspace();
    goFuture();
    expect(destination("switch")).toHaveTextContent("Compare");
    fireEvent.click(destination("switch"));
    await advance(0);
    const { keepId, replaceId } = state().comparison!;
    expect(destination("switch")).toHaveTextContent(usd(at(replaceId, 60)));
    expect(destination("keep")).toHaveTextContent(usd(at(keepId, 60)));
    expect(destination("switch")).not.toHaveTextContent("Compare");
    expect(screen.getByTestId("road-path-switch")).toHaveAttribute("data-dashed", "false");
    expect(screen.getByTestId("journey-heading")).toHaveTextContent(verdictWords());
    expect(screen.queryByRole("button", { name: /Compare with the RAV4/ })).toBeNull();
  });

  it("tapping the other path itself picks it too, and an unpriced offer asks to compare instead", async () => {
    await enterWorkspace();
    goFuture();
    fireEvent.click(screen.getByTestId("road-hit-other")); // the dashed offer
    await advance(0);
    expect(state().comparison).not.toBeNull();
    expect(destination("switch").textContent).toMatch(/\$[\d,]+/);
    fireEvent.click(screen.getByTestId("road-hit-other")); // now it is the other future
    expect(state().activeScenarioId).toBe(state().comparison!.keepId);
  });

  it("the selector beside the road switches your life, keeps the month, and the comparison follows it", async () => {
    await openCompared(denver);
    scrubTo(30);
    const selector = screen.getByTestId("future-selector") as HTMLSelectElement;
    expect([...selector.options].map((o) => o.textContent)).toEqual(["If nothing changes", "Move to Denver"]);

    fireEvent.change(selector, { target: { value: "base" } });
    const { keepId, replaceId } = state().comparison!;
    expect(keepId).toBe("base");
    expect(state().activeMonth).toBe(30);
    expect(timeline()).toHaveAttribute("data-month", "30");
    expect(selector.value).toBe("base");
    // the road shows that life: nothing was said, so only the swap is on it
    expect(eventMarkers().map((m) => m.getAttribute("data-event-id"))).toEqual([swapOf(replaceId).id]);
    // and every figure on the page is that comparison's own
    expect(destination("keep")).toHaveTextContent(usd(at("base", 60)));
    expect(destination("switch")).toHaveTextContent(usd(at(replaceId, 60)));
    expect(screen.getByTestId("journey-heading")).toHaveTextContent(verdictWords());
    expect(screen.getByTestId("journey-difference")).toHaveTextContent(differenceWords());

    fireEvent.change(selector, { target: { value: "base/12-move-to-denver" } });
    expect(state().comparison!.keepId).toBe("base/12-move-to-denver");
    expect(state().activeMonth).toBe(30);
    expect(eventMarkers()).toHaveLength(2); // Denver and the swap
  });
});

describe("the road's two branches", () => {
  it("the switch leaves at the swap event's modeled month, and the swap's marker is there", async () => {
    await openCompared(denver);
    const { replaceId } = state().comparison!;
    const swap = swapOf(replaceId);
    expect(swap.month).toBe(12);
    const path = screen.getByTestId("road-path-switch");
    expect(path).toHaveAttribute("data-split-month", String(swap.month));
    expect(path).toHaveAttribute("data-dashed", "false"); // it is priced now
    expect(eventMarker(swap.id)).toHaveAttribute("data-month", String(swap.month));
    expect(eventMarker(swap.id)).toHaveAttribute("data-on", "switch");
    expect(screen.getByTestId("road-path-keep")).not.toHaveAttribute("data-split-month"); // keeping never leaves
  });

  it("a replacement in year one splits the paths in year one, at the same month as its marker and the car change", async () => {
    await enterWorkspace();
    confirm(family); // a second child in month 6: the simulation puts the swap there
    goFuture();
    const offerSplit = defaultSwapMonth();
    expect(offerSplit).toBe(6);
    expect(screen.getByTestId("road-path-switch")).toHaveAttribute("data-split-month", "6"); // the offer already splits in year one
    await compareNow();
    const swap = swapOf(state().comparison!.replaceId);
    expect(swap.month).toBe(6);
    expect(screen.getByTestId("road-path-switch")).toHaveAttribute("data-split-month", "6");
    expect(eventMarker(swap.id)).toHaveAttribute("data-month", "6");
    expect(eventMarker(lifeIn(state().comparison!.keepId)[0].id)).toHaveAttribute("data-month", "6"); // the shared event is at the same month
    scrubTo(5);
    expect(document.querySelector('[data-slot="vehicle"]')).toHaveTextContent("2022 Camry SE");
    scrubTo(6);
    expect(document.querySelector('[data-slot="vehicle"]')).toHaveTextContent("2024 RAV4 Hybrid XLE");
  });

  it("moving the replacement later moves the split with it, flags it, and nothing the person said moves", async () => {
    await openCompared(denver);
    const { replaceId } = state().comparison!;
    const swapId = swapOf(replaceId).id;
    const moveId = lifeIn(state().comparison!.keepId)[0].id;
    act(() => state().actions.moveEvent(replaceId, swapId, 24));
    expect(swapOf(state().comparison!.replaceId).month).toBe(24);
    expect(screen.getByTestId("road-path-switch")).toHaveAttribute("data-split-month", "24");
    expect(eventMarker(swapId)).toHaveAttribute("data-month", "24");
    expect(eventMarker(swapId)).toHaveAttribute("data-changed", "true");
    expect(eventMarker(moveId)).toHaveAttribute("data-month", "12"); // what the person said stays where it was
    expect(eventMarker(moveId)).toHaveAttribute("data-changed", "false");
    scrubTo(23);
    expect(document.querySelector('[data-slot="vehicle"]')).toHaveTextContent("2022 Camry SE");
    scrubTo(24);
    expect(document.querySelector('[data-slot="vehicle"]')).toHaveTextContent("2024 RAV4 Hybrid XLE");
    expect(destination("switch")).toHaveTextContent(usd(at(replaceId, 60))); // priced from the moved swap
  });

  it("a swap cannot be moved before the month its future branches (the simulation keeps it there)", async () => {
    await openCompared(denver);
    const { replaceId } = state().comparison!;
    act(() => state().actions.moveEvent(replaceId, swapOf(replaceId).id, 6));
    expect(swapOf(replaceId).month).toBe(12);
    expect(screen.getByTestId("road-path-switch")).toHaveAttribute("data-split-month", "12");
  });

  it("an event the person said sits at the same month in both futures, whichever one is selected", async () => {
    await openCompared(denver, mileage);
    const { keepId, replaceId } = state().comparison!;
    const lifeMonths = (id: string) => Object.fromEntries(lifeIn(id).map((e) => [e.id, e.month]));
    expect(lifeMonths(replaceId)).toEqual(lifeMonths(keepId)); // the two futures hold the same events at the same months
    const onRoad = () => Object.fromEntries(eventMarkers().filter((m) => m.getAttribute("data-on") !== "switch").map((m) => [m.getAttribute("data-event-id"), Number(m.getAttribute("data-month"))]));

    fireEvent.click(destination("keep"));
    const whileKeeping = onRoad();
    fireEvent.click(destination("switch"));
    expect(onRoad()).toEqual(whileKeeping);
    expect(whileKeeping).toEqual(lifeMonths(keepId));
    expect(eventMarkers()).toHaveLength(Object.keys(lifeMonths(keepId)).length + 1); // each once, plus the swap
  });
});

describe("play and pause", () => {
  const play = () => fireEvent.click(screen.getByRole("button", { name: "Play" }));

  it("Play glides month by month, with the range input and the marker following, and rests on the event", async () => {
    await openCompared(denver);
    play();
    expect(state().ui.playing).toBe(true);
    expect(screen.getByRole("button", { name: "Pause" })).toHaveAttribute("aria-pressed", "true");
    await advance(MS_PER_MONTH * 4);
    const early = state().activeMonth;
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(12);
    expect(slider().value).toBe(String(early));
    expect(marker()).toHaveAttribute("data-month", String(early));

    // it lands on the event's month and stays a moment
    for (let step = 0; step < 200 && state().activeMonth < 12; step++) await advance(50);
    expect(state().activeMonth).toBe(12);
    await advance(DWELL_MS / 2);
    expect(state().activeMonth).toBe(12);
    expect(state().ui.playing).toBe(true);
    await advance(DWELL_MS);
    expect(state().activeMonth).toBeGreaterThan(12);
    expect(slider().value).toBe(String(state().activeMonth));
  });

  it("a manual move of the range input pauses it, and it stays where you put it", async () => {
    await openCompared(denver);
    play();
    await advance(500);
    scrubTo(40);
    expect(state().ui.playing).toBe(false);
    expect(screen.getByRole("button", { name: "Play" })).toHaveAttribute("aria-pressed", "false");
    await advance(5_000);
    expect(state().activeMonth).toBe(40);
  });

  it("choosing an event or the other future pauses it", async () => {
    await openCompared(denver);
    const moveId = lifeIn(state().comparison!.keepId)[0].id;
    play();
    await advance(300);
    fireEvent.click(eventMarker(moveId));
    expect(state().ui.playing).toBe(false);
    expect(state().activeMonth).toBe(12);

    play();
    await advance(300);
    expect(state().ui.playing).toBe(true);
    fireEvent.click(destination("keep"));
    expect(state().ui.playing).toBe(false);
    const frozen = state().activeMonth;
    await advance(3_000);
    expect(state().activeMonth).toBe(frozen);
  });

  it("stops at month 60, the button goes back to Play, and Play again starts over", async () => {
    await openCompared(denver);
    play();
    await advance(30_000);
    expect(state().activeMonth).toBe(60);
    expect(state().ui.playing).toBe(false);
    expect(screen.getByRole("button", { name: "Play" })).toHaveAttribute("aria-pressed", "false");
    expect(slider().value).toBe("60");
    expect(marker()).toHaveAttribute("data-month", "60");

    play();
    expect(state().ui.playing).toBe(true);
    expect(state().activeMonth).toBeLessThan(60);
    await advance(MS_PER_MONTH * 3);
    expect(state().activeMonth).toBeGreaterThan(0);
  });

  it("opening a drawer pauses it, and so does leaving the page", async () => {
    await openCompared(denver);
    play();
    await advance(400);
    fireEvent.click(screen.getByRole("button", { name: "Compare costs" }));
    expect(state().ui.drawer).toBe("costs");
    expect(state().ui.playing).toBe(false);
    const frozen = state().activeMonth;
    await advance(3_000);
    expect(state().activeMonth).toBe(frozen);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    play();
    await advance(300);
    expect(state().ui.playing).toBe(true);
    goCar();
    expect(state().ui.playing).toBe(false);
  });
});

describe("Compare costs", () => {
  it("opens the cost breakdown in a drawer: a labeled chart, a month slider, and a close button", async () => {
    await openCompared(denver);
    fireEvent.click(screen.getByRole("button", { name: "Compare costs" }));
    expect(state().ui.drawer).toBe("costs");
    const dialog = screen.getByRole("dialog", { name: "Compare costs" });
    expect(dialog).toHaveAttribute("data-open", "true");
    expect(within(dialog).getByTestId("cost-chart")).toBeInTheDocument();
    expect(within(dialog).getByTestId("cost-chart-xtitle")).toHaveTextContent("Years from now");
    expect(within(dialog).getByTestId("cost-chart-ytitle")).toHaveTextContent("Net cost");
    expect(within(dialog).getByRole("slider", { name: "Month" })).toBeInTheDocument();
    expect(within(dialog).getAllByTestId("decision-effect").length).toBeGreaterThan(0); // what each change did to cost

    // the five-year totals are the same ones as on the road
    const { keepId, replaceId } = state().comparison!;
    expect(within(dialog).getByTestId("five-year-keep")).toHaveTextContent(usd(at(keepId, 60)));
    expect(within(dialog).getByTestId("five-year-switch")).toHaveTextContent(usd(at(replaceId, 60)));
    expect(within(dialog).getByTestId("five-year-difference")).toHaveTextContent(differenceWords().replace(" over five years.", ""));

    // there is one road on the page: the drawer does not draw another
    expect(screen.getAllByTestId("journey-road")).toHaveLength(1);
    expect(screen.getAllByTestId("road-path-keep")).toHaveLength(1);
    expect(screen.queryByTestId("road")).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(state().ui.drawer).toBeNull();
    expect(drawerPanel("Compare costs")).toHaveAttribute("data-open", "false");
    expect(screen.getByTestId("cost-chart")).toBeInTheDocument(); // it stays while it slides away...
    await advance(300);
    expect(screen.queryByTestId("cost-chart")).toBeNull(); // ...and once shut it holds nothing
  });

  it("its month slider moves the page's clock, and its totals do not change", async () => {
    await openCompared(denver);
    const { keepId, replaceId } = state().comparison!;
    fireEvent.click(screen.getByRole("button", { name: "Compare costs" }));
    const dialog = screen.getByRole("dialog", { name: "Compare costs" });
    const monthSlider = within(dialog).getByRole("slider", { name: "Month" });
    fireEvent.change(monthSlider, { target: { value: "24" } });

    expect(state().activeMonth).toBe(24);
    expect(slider().value).toBe("24"); // the road's own scrubber, behind the drawer
    expect(marker()).toHaveAttribute("data-month", "24");
    expect(within(dialog).getByTestId("cost-readout")).toHaveTextContent(`Net cost at ${monthLabel(24)}`);
    const line = (kind: string) => within(dialog).getAllByTestId("cost-readout-line").find((l) => l.getAttribute("data-line") === kind)!;
    expect(line("keep")).toHaveTextContent(usd(at(keepId, 24)));
    expect(line("switch")).toHaveTextContent(usd(at(replaceId, 24)));
    within(dialog).getAllByTestId("cost-readout-line").forEach((l) => expect(l.querySelector("[data-source]")).not.toBeNull());
    expect(within(dialog).getByTestId("five-year-keep")).toHaveTextContent(usd(at(keepId, 60)));
    expect(within(dialog).getByTestId("five-year-switch")).toHaveTextContent(usd(at(replaceId, 60)));
    expect(destination("keep")).toHaveTextContent(usd(at(keepId, 60)));
  });

  it("before comparing, it says the switch is not priced and offers to price it", async () => {
    await enterWorkspace();
    goFuture();
    fireEvent.click(screen.getByRole("button", { name: "Compare costs" }));
    const dialog = screen.getByRole("dialog", { name: "Compare costs" });
    expect(within(dialog).getByTestId("costs-unpriced")).toHaveTextContent("The switch isn't priced yet.");
    expect(within(dialog).getByTestId("five-year-keep")).toHaveTextContent(usd(at("base", 60)));
    expect(within(dialog).queryByTestId("five-year-switch")).toBeNull();
    expect(within(dialog).getByTestId("five-year-table").textContent!.match(/\$[\d,]+/g)).toEqual([usd(at("base", 60))]); // no invented figure for the switch

    fireEvent.click(within(dialog).getByRole("button", { name: /Compare with the RAV4/ }));
    await advance(0);
    expect(within(dialog).getByTestId("five-year-switch")).toHaveTextContent(usd(at(state().comparison!.replaceId, 60)));
    expect(within(dialog).queryByTestId("costs-unpriced")).toBeNull();
  });

  it("Escape and the dim layer close it as well", async () => {
    await openCompared(denver);
    fireEvent.click(screen.getByRole("button", { name: "Compare costs" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(state().ui.drawer).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Compare costs" }));
    fireEvent.click(screen.getByTestId("drawer-dim"));
    expect(state().ui.drawer).toBeNull();
  });
});

describe("the recommendation", () => {
  it("shows the engine's tradeoff row by row, the robustness count, and what matters to the person", async () => {
    await openCompared(denver);
    fireEvent.click(screen.getByTestId("journey-heading"));
    const dialog = screen.getByRole("dialog", { name: verdictWords() });
    const content = within(dialog).getByTestId("recommendation-content");

    // the rows are the engine's per priority scores, in words
    const s = state();
    const expected = buildTradeoff({
      scores: s.scores,
      evaluation: s.evaluation!,
      keepId: s.comparison!.keepId,
      replaceId: s.comparison!.replaceId,
      keepName: `the ${s.twin!.vehicle.model}`,
      switchName: `the ${s.replacementVehicle!.model}`,
      priorities: s.explore.confirmedProfile.priorities,
    });
    expect(expected).not.toBeNull();
    const rows = within(content).getAllByTestId("tradeoff-row");
    expect(rows.map((r) => [r.getAttribute("data-factor"), r.getAttribute("data-leader")])).toEqual(expected!.rows.map((r) => [r.key, r.leader]));
    expect(rows).toHaveLength(5);
    expect(within(content).getByTestId("tradeoff-sentence")).toHaveTextContent(customerText(expected!.sentence));

    // "Held in X of Y tested cases": a count, from the engine, never a percentage
    const robust = robustnessLine(s.evaluation!)!;
    expect(robust).toMatch(/^Held in \d+ of \d+ tested cases$/);
    expect(within(content).getByTestId("recommendation-robustness")).toHaveTextContent(robust);
    expect(content.textContent).not.toMatch(/\d\s*%/);
    expect(within(content).getByTestId("priorities-words")).toHaveTextContent(prioritiesInWords(s.explore.confirmedProfile.priorities));
    expect(within(content).getByTestId("recommendation-difference")).toHaveTextContent(differenceWords());
  });

  it("the robustness count and the tradeoff are behind the heading, not on the front page", async () => {
    await openCompared(denver);
    expect(screen.getByTestId("journey-header").textContent).not.toMatch(/tested cases/);
    expect(screen.queryByTestId("tradeoff-rows")).toBeNull();
    expect(screen.queryByTestId("recommendation-content")).toBeNull();
  });

  it("the next step line opens the same drawer, and one drawer at a time is open", async () => {
    await openCompared(denver);
    const next = screen.getByTestId("journey-next");
    expect(next).toHaveTextContent(`Next: ${customerText(state().evaluation!.nextAction.label.trim())}`);
    fireEvent.click(next);
    expect(state().ui.drawer).toBe("recommendation");
    const open = () => screen.getAllByRole("dialog").filter((d) => d.getAttribute("data-open") === "true");
    expect(open().map((d) => d.getAttribute("aria-label"))).toEqual([verdictWords()]);

    fireEvent.click(within(open()[0]).getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Compare costs" }));
    expect(open().map((d) => d.getAttribute("aria-label"))).toEqual(["Compare costs"]);
  });
});

describe("when something does not work, it says so", () => {
  it("shows the store's error above the command bar on either page, and goes away when dismissed", async () => {
    await enterWorkspace();
    expect(screen.queryByRole("alert")).toBeNull();
    act(() => useForkStore.setState({ error: "There is no other car to compare with." }));
    expect(screen.getByRole("alert")).toHaveTextContent("There is no other car to compare with.");
    goFuture();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(state().error).toBeNull();
  });

  it("an unusable answer to a question is not silent", async () => {
    await enterWorkspace();
    act(() => state().actions.answerQuestion("annualMiles", -5));
    expect(screen.getByRole("alert")).toHaveTextContent(/usable value/);
  });
});

describe("the answer fits the page", () => {
  it("each part has one job, in order: the heading and its difference, the road, the scrubber, then the selected moment", async () => {
    await openCompared(denver);
    const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const page = screen.getByTestId("future-view");
    const heading = screen.getByRole("heading", { level: 1 });
    const difference = screen.getByTestId("journey-difference");
    const source = screen.getByTestId("journey-source");
    const road = timeline();
    const scrubber = screen.getByRole("region", { name: "Time scrubber" });
    const card = screen.getByTestId("event-card");
    expect(before(heading, difference)).toBe(true); // the call, then what it means in dollars
    expect(before(difference, source)).toBe(true); // then where the dollars come from
    expect(before(source, road)).toBe(true);
    expect(before(road, scrubber)).toBe(true);
    expect(before(scrubber, card)).toBe(true);
    for (const el of [heading, difference, source, road, scrubber, card]) expect(page.contains(el)).toBe(true);
    // the command bar is not part of the scrolling page: it is below it
    expect(page.contains(screen.getByTestId("command-box"))).toBe(false);
    expect(before(page, screen.getByTestId("command-box"))).toBe(true);
  });

  it("nothing deeper is on screen until it is asked for", async () => {
    await openCompared(denver);
    for (const id of ["cost-chart", "tradeoff-rows", "recommendation-content", "explain-content", "costs-content", "five-year-table", "costs-panel", "panel-costs", "road"]) {
      expect(screen.queryByTestId(id), id).toBeNull();
    }
    expect(screen.getAllByTestId("journey-road")).toHaveLength(1);
    expect(state().ui.drawer).toBeNull();
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("the default screen is the call, both costs, the road, the scrubber and one line about the selected moment", async () => {
    await openCompared(denver);
    for (const id of ["journey-heading", "journey-difference", "journey-source", "journey-timeline", "time-marker", "event-card", "journey-next"]) {
      expect(screen.getByTestId(id), id).toBeInTheDocument();
    }
    expect(screen.getAllByTestId("destination")).toHaveLength(2);
    expect(slider()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compare costs" })).toBeInTheDocument();
    expect(screen.getByTestId("event-card-sentence").textContent!.length).toBeGreaterThan(0);
  });
});

describe("chat changes reach the whole page", () => {
  beforeEach(() => {
    // The plain rules read the sentence, so these run with the AI unavailable.
    vi.spyOn(ai, "interpret").mockResolvedValue({ aiAvailable: false });
  });

  const sayInChat = async (text: string) => {
    fireEvent.change(screen.getByPlaceholderText(/tell fork what's changing/i), { target: { value: text } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Submit changes" }));
    });
    await advance(0);
  };
  const branchTimeline = async () => {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /branch timeline/i }));
    });
    await advance(0);
  };

  it("a second sentence updates the events, dates, costs and revision together, lights up what changed, then lets go", async () => {
    await openCompared(denver);
    const before = state().comparison!;
    const moveId = lifeIn(before.keepId)[0].id;
    fireEvent.click(eventMarker(moveId));
    scrubTo(12);
    const revision = state().revision;
    const keepBefore = destination("keep").textContent;
    const switchBefore = destination("switch").textContent;
    expect(eventMarkers()).toHaveLength(2); // Denver and the swap

    await sayInChat("I'm driving 30,000 miles annually and expecting my second child in 2029");
    expect(state().explore.draftChanges).toHaveLength(2); // proposals only: nothing counts until it is confirmed
    expect(eventMarkers()).toHaveLength(2);
    expect(destination("keep").textContent).toBe(keepBefore);
    await branchTimeline();

    // the events, at the months the model gave them, named with their dates
    const { keepId, replaceId } = state().comparison!;
    const events = lifeIn(keepId);
    expect(events.map((e) => e.type).sort()).toEqual(["family_change", "mileage_change", "relocation"]);
    expect(eventMarkers()).toHaveLength(4); // three things said, and the swap
    for (const e of events) {
      expect(eventMarker(e.id)).toHaveAttribute("data-month", String(e.month));
      expect(eventMarker(e.id)).toHaveAccessibleName(`${eventTitle(e)}, ${dateLabel(state().todayISO, e.month)}`);
    }
    expect(eventMarker(swapOf(replaceId).id)).toHaveAccessibleName(`Switch to the RAV4, ${dateLabel(state().todayISO, swapOf(replaceId).month)}`);
    const child = events.find((e) => e.type === "family_change")!;
    expect(child.month).toBe(32);
    expect(eventMarker(child.id)).toHaveAccessibleName(`Second child, ${dateLabel(state().todayISO, 32)}`);

    // the costs and the verdict are the new run's, and the revision moved with them
    expect(state().revision).toBeGreaterThan(revision);
    expect(destination("keep")).toHaveTextContent(usd(at(keepId, 60)));
    expect(destination("switch")).toHaveTextContent(usd(at(replaceId, 60)));
    expect(destination("keep").textContent).not.toBe(keepBefore);
    expect(destination("switch").textContent).not.toBe(switchBefore);
    expect(screen.getByTestId("journey-heading")).toHaveTextContent(verdictWords());
    expect(screen.getByTestId("journey-difference")).toHaveTextContent(differenceWords());

    // what was just added is flagged, and nothing else is
    const added = state().lastChange!.eventIds;
    expect(added).toHaveLength(2);
    for (const m of eventMarkers()) expect(m).toHaveAttribute("data-changed", added.includes(m.getAttribute("data-event-id")!) ? "true" : "false");
    await advance(2500);
    for (const m of eventMarkers()) expect(m).toHaveAttribute("data-changed", "false");

    // the selection that is still valid is kept: the event, the month and the future
    expect(state().selectedEventId).toBe(moveId);
    expect(eventMarker(moveId)).toHaveAttribute("aria-pressed", "true");
    expect(state().activeMonth).toBe(12);
    expect(screen.getByTestId("event-card-title")).toHaveTextContent("Move to Denver");
    expect(destination("switch")).toHaveAttribute("aria-pressed", "true");
    expect(state().ui.view).toBe("future");
  });

  it("a selected event that the new future no longer holds is not shown as selected", async () => {
    await openCompared(denver);
    const moveId = lifeIn(state().comparison!.keepId)[0].id;
    fireEvent.click(eventMarker(moveId));
    expect(screen.getByRole("region", { name: "Selected moment" })).toHaveAttribute("data-state", "event");
    fireEvent.change(screen.getByTestId("future-selector"), { target: { value: "base" } }); // a life without the move
    expect(screen.getByRole("region", { name: "Selected moment" })).toHaveAttribute("data-state", "moment");
    expect(screen.queryByRole("button", { name: "Explain this" })).toBeNull();
    expect(state().activeMonth).toBe(12); // the month is the one clock: it stays
  });

  it("while it is working out a change the page says Updating and keeps the five-year figures where they were", async () => {
    await openCompared(denver);
    const keep = destination("keep").textContent;
    const sw = destination("switch").textContent;
    expect(screen.getByTestId("journey-updating")).toHaveTextContent("");
    act(() => useForkStore.setState({ ui: { ...state().ui, busy: "simulating" } }));
    expect(screen.getByTestId("journey-updating")).toHaveTextContent("Updating");
    expect(screen.getByTestId("event-card")).toHaveAttribute("data-updating", "true");
    expect(document.querySelector('[data-slot="through"]')).toHaveTextContent("updating");
    expect(destination("keep").textContent).toBe(keep);
    expect(destination("switch").textContent).toBe(sw);
    act(() => useForkStore.setState({ ui: { ...state().ui, busy: "idle" } }));
    expect(screen.getByTestId("journey-updating")).toHaveTextContent("");
    expect(screen.getByTestId("event-card")).toHaveAttribute("data-updating", "false");
  });
});

describe("on a narrow screen", () => {
  function narrow(width: number) {
    const tall = makeFrame(width, true).height; // what the drawing is, so the pointer maps one to one
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: width, bottom: tall, width, height: tall, toJSON: () => ({}) } as DOMRect);
  }
  const translateOf = (el: HTMLElement) => {
    const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(el.style.transform);
    return { x: Number(m?.[1]), y: Number(m?.[2]) };
  };
  const firstPoint = (d: string) => {
    const m = /[ML] (-?[\d.]+) (-?[\d.]+)/.exec(d)!;
    return { x: Number(m[1]), y: Number(m[2]) };
  };

  it("the road runs top to bottom, with time running down it, and every control still moves the one clock", async () => {
    narrow(360);
    await openCompared(denver, mileage);
    const frame = makeFrame(360, true);
    expect(timeline()).toHaveAttribute("data-orientation", "vertical");
    expect(screen.getByTestId("journey-road").getAttribute("width")).toBe("360");

    // time is the y axis: the marker, the split and each event sit at their month, down the page
    expect(Number(marker().getAttribute("data-y"))).toBeCloseTo(timePos(frame, 0), 6);
    scrubTo(40);
    expect(Number(marker().getAttribute("data-y"))).toBeCloseTo(timePos(frame, 40), 6);
    const { replaceId } = state().comparison!;
    expect(screen.getByTestId("road-path-switch")).toHaveAttribute("data-split-month", String(swapOf(replaceId).month));
    expect(firstPoint(screen.getByTestId("road-path-switch").getAttribute("d")!).y).toBeCloseTo(timePos(frame, swapOf(replaceId).month), 1);
    for (const e of [...lifeIn(state().comparison!.keepId), swapOf(replaceId)]) expect(translateOf(eventMarker(e.id)).y + 12).toBeCloseTo(timePos(frame, e.month), 6);

    // it all fits across a phone, rather than being a shrunk desktop canvas
    for (const el of [...screen.getAllByTestId("destination"), ...screen.getAllByTestId("event-label"), ...eventMarkers()]) {
      const x = el.style.transform ? translateOf(el).x : Number(el.style.left.replace("px", ""));
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x + Number(el.style.width.replace("px", ""))).toBeLessThanOrEqual(360);
    }

    // dragging down the road, picking an event and playing all work the same
    fireEvent.pointerDown(screen.getByTestId("road-hit"), { clientX: 200, clientY: timePos(frame, 25), pointerId: 1, button: 0, pointerType: "touch" });
    expect(state().activeMonth).toBe(25);
    expect(slider().value).toBe("25");
    fireEvent.click(eventMarker(lifeIn(state().comparison!.keepId).find((e) => e.type === "relocation")!.id));
    expect(state().activeMonth).toBe(12);
    expect(Number(marker().getAttribute("data-y"))).toBeCloseTo(timePos(frame, 12), 6);
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(screen.getByTestId("event-card")).toBeInTheDocument();
    expect(screen.getByTestId("journey-heading")).toBeInTheDocument();
  });

  it("the drawers come up from the bottom as sheets", async () => {
    narrow(360);
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("max-width"), media: q, addEventListener: () => {}, removeEventListener: () => {} }));
    await openCompared(denver);
    fireEvent.click(screen.getByRole("button", { name: "Compare costs" }));
    expect(screen.getByRole("dialog", { name: "Compare costs" })).toHaveAttribute("data-placement", "bottom");
  });

  it("goes back to the wide road at desktop width, with the drawers at the side", async () => {
    narrow(1280);
    await openCompared(denver);
    expect(timeline()).toHaveAttribute("data-orientation", "horizontal");
    expect(Number(marker().getAttribute("data-y"))).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Compare costs" }));
    expect(screen.getByRole("dialog", { name: "Compare costs" })).toHaveAttribute("data-placement", "right");
  });
});

describe("the page and the command bar", () => {
  it("the page ends above the command bar, whatever height the bar grows to", async () => {
    const callbacks: Array<() => void> = [];
    vi.stubGlobal("ResizeObserver", class { constructor(cb: () => void) { callbacks.push(cb); } observe() {} unobserve() {} disconnect() {} });
    let barHeight = 0;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      // Only the bottom bar (the box that holds the command box) has a size in this test.
      const isBar = this.firstElementChild?.getAttribute("data-testid") === "command-box";
      const h = isBar ? barHeight : 0;
      return { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: h, width: 0, height: h, toJSON: () => ({}) } as DOMRect;
    });
    const refit = () => act(() => callbacks.forEach((cb) => cb()));

    await enterWorkspace();
    goFuture();
    const bar = screen.getByTestId("command-box").parentElement!;
    barHeight = 210;
    refit();
    expect(bar.getBoundingClientRect().height).toBe(210);
    expect(screen.getByTestId("future-view").style.bottom).toBe("210px");

    // a proposal appears in the bar and it grows: the page gives up the same room
    act(() => state().actions.addDraft(denver));
    barHeight = 330;
    refit();
    expect(screen.getByTestId("future-view").style.bottom).toBe("330px");
    // the bar and the page switch stay outside the scrolling page, after it
    expect(screen.getByTestId("future-view").contains(screen.getByTestId("command-box"))).toBe(false);
    expect(Boolean(screen.getByTestId("future-view").compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });
});

describe("two pages, one stage", () => {
  it("the 3D stage stays mounted and only fades out on the future page", async () => {
    await enterWorkspace();
    const stage = screen.getByTestId("car-stage-stub");
    expect(screen.getByTestId("stage-wrap")).toHaveAttribute("data-visible", "true");

    goFuture();
    expect(screen.getByTestId("car-stage-stub")).toBe(stage); // same element, never rebuilt
    expect(screen.getByTestId("stage-wrap")).toHaveAttribute("data-visible", "false");
    expect(screen.getByTestId("stage-wrap")).toHaveAttribute("aria-hidden", "true");

    goCar();
    expect(screen.getByTestId("car-stage-stub")).toBe(stage);
    expect(screen.getByTestId("stage-wrap")).toHaveAttribute("data-visible", "true");
  });

  it("the command bar is on both pages", async () => {
    await enterWorkspace();
    expect(screen.getByPlaceholderText(/tell fork what's changing/i)).toBeInTheDocument();
    goFuture();
    expect(screen.getByPlaceholderText(/tell fork what's changing/i)).toBeInTheDocument();
  });

  it("confirming a proposal branches the timeline and lands on the future page", async () => {
    await enterWorkspace();
    act(() => state().actions.addDraft(denver));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /branch timeline/i }));
    });
    expect(state().ui.view).toBe("future");
    expect(screen.getByTestId("journey-timeline")).toBeInTheDocument();
    // the page opens on your next five years, at month 0, with nothing compared yet
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Your next five years");
    expect(state().activeMonth).toBe(0);
    expect(slider().value).toBe("0");

    // the move is a year out: on the road at that month, named with its date, and flagged as new
    const keepId = state().activeScenarioId;
    const [moved] = lifeIn(keepId);
    expect(moved.month).toBe(12);
    expect(eventMarkers()).toHaveLength(1);
    expect(eventMarker(moved.id)).toHaveAccessibleName(`Move to Denver, ${dateLabel(state().todayISO, 12)}`);
    expect(eventMarker(moved.id)).toHaveAttribute("data-month", "12");
    expect(eventMarker(moved.id)).toHaveAttribute("data-changed", "true");
    // keeping that future costs what the simulation says, and the other car is still only an offer
    expect(destination("keep")).toHaveTextContent(usd(at(keepId, 60)));
    expect(destination("switch").textContent).not.toContain("$");
    expect(screen.getByTestId("road-path-switch")).toHaveAttribute("data-dashed", "true");
    await advance(2500);
    expect(eventMarker(moved.id)).toHaveAttribute("data-changed", "false"); // the highlight lets go
  });

  it("every control has an accessible name", async () => {
    await enterWorkspace();
    goFuture();
    screen.getAllByRole("button").forEach((b) => expect(b).toHaveAccessibleName());
    screen.getAllByRole("tab").forEach((b) => expect(b).toHaveAccessibleName());
  });

  it("every control has an accessible name once the cars are compared, with each drawer open", async () => {
    await openCompared(denver, mileage);
    const named = () => {
      for (const role of ["button", "tab", "slider", "combobox"] as const) screen.getAllByRole(role).forEach((el) => expect(el).toHaveAccessibleName());
      screen.getAllByRole("dialog").forEach((el) => expect(el).toHaveAccessibleName());
    };
    named();
    fireEvent.click(eventMarker(lifeIn(state().comparison!.keepId)[0].id));
    named();
    for (const drawer of ["explain", "costs", "recommendation"] as const) {
      act(() => state().actions.openDrawer(drawer));
      named();
      act(() => state().actions.closeDrawer());
    }
  });

  it("reads no build words and no dash, on the page or in any drawer", async () => {
    await openCompared(denver, mileage);
    fireEvent.click(eventMarker(lifeIn(state().comparison!.keepId)[0].id));
    for (const drawer of [null, "explain", "costs", "recommendation"] as const) {
      act(() => (drawer === null ? state().actions.closeDrawer() : state().actions.openDrawer(drawer)));
      expect(everythingVisible(), String(drawer)).not.toMatch(/demo|data/i);
      expect(everythingVisible(), String(drawer)).not.toContain(EM_DASH);
    }
  });
});

describe("the details sheet", () => {
  it("is closed until you ask, and shows the profile, priorities and display options", async () => {
    await enterWorkspace();
    const dialog = screen.getByRole("dialog", { name: "Edit assumptions" });
    expect(dialog).toHaveAttribute("data-open", "false");

    openDetails();
    expect(dialog).toHaveAttribute("data-open", "true");
    expect(state().ui.detailsOpen).toBe(true);
    expect(within(dialog).getByTestId("profile-confirm-card")).toBeInTheDocument();
    expect(within(dialog).getByText("Priorities")).toBeInTheDocument();
    expect(within(dialog).getByText("History")).toBeInTheDocument();
    expect(within(dialog).getByRole("switch", { name: /low performance/i })).toBeInTheDocument();
  });

  it("every number in it has a source label", async () => {
    await enterWorkspace();
    openDetails();
    const rows = screen.getByRole("dialog", { name: "Edit assumptions" }).querySelectorAll('[data-slot="data-row"]');
    expect(rows.length).toBeGreaterThan(5);
    rows.forEach((row) => expect(row.querySelector("[data-source]")).not.toBeNull());
  });

  it("closes with the close button, with Escape, and by tapping outside", async () => {
    await enterWorkspace();
    const dialog = screen.getByRole("dialog", { name: "Edit assumptions" });

    openDetails();
    fireEvent.click(screen.getByRole("button", { name: "Close details" }));
    expect(dialog).toHaveAttribute("data-open", "false");

    openDetails();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(dialog).toHaveAttribute("data-open", "false");

    openDetails();
    fireEvent.click(dialog.previousElementSibling!); // the dim layer behind it
    expect(dialog).toHaveAttribute("data-open", "false");
  });

  it("the low performance switch reaches CarStage as quality=low", async () => {
    await enterWorkspace();
    expect(screen.getByTestId("car-stage-stub")).toHaveAttribute("data-quality", "high");
    openDetails();
    fireEvent.click(screen.getByRole("switch", { name: /low performance/i }));
    expect(state().ui.lowPerformance).toBe(true);
    expect(screen.getByTestId("car-stage-stub")).toHaveAttribute("data-quality", "low");
  });

  it("view mode buttons drive CarStage viewMode", async () => {
    await enterWorkspace();
    openDetails();
    fireEvent.click(screen.getByRole("button", { name: "Wireframe" }));
    expect(screen.getByTestId("car-stage-stub")).toHaveAttribute("data-view-mode", "wireframe");
    expect(screen.getByRole("button", { name: "Wireframe" })).toHaveAttribute("aria-pressed", "true");
  });

  it("reset camera and replay reveal bump their signals, and replay closes the sheet", async () => {
    await enterWorkspace();
    const before = state().stage;
    openDetails();
    fireEvent.click(screen.getByRole("button", { name: "Reset camera" }));
    expect(state().stage.resetCameraSignal).toBe(before.resetCameraSignal + 1);
    fireEvent.click(screen.getByRole("button", { name: "Replay reveal" }));
    expect(state().stage.replaySignal).toBe(before.replaySignal + 1);
    expect(state().phase).toBe("reveal");
    expect(state().ui.detailsOpen).toBe(false);
  });
});

describe("preferences", () => {
  it("reduced motion from the OS reaches the store and the page", async () => {
    const listeners: Array<(e: { matches: boolean }) => void> = [];
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q.includes("reduce"),
      media: q,
      addEventListener: (_: string, l: (e: { matches: boolean }) => void) => listeners.push(l),
      removeEventListener: () => {},
    }));
    render(<ForkApp />);
    await advance(0);
    expect(state().ui.reducedMotion).toBe(true);
    expect(document.documentElement.dataset.reducedMotion).toBe("true");
    act(() => listeners.forEach((l) => l({ matches: false })));
    expect(state().ui.reducedMotion).toBe(false);
    vi.unstubAllGlobals();
  });

  it("remembers low performance, and nothing about which page or sheet was open", async () => {
    await enterWorkspace();
    openDetails();
    fireEvent.click(screen.getByRole("switch", { name: /low performance/i }));
    goFuture();
    await advance(200);
    const saved = JSON.parse(localStorage.getItem("fork:v1")!);
    expect(saved.prefs).toEqual({ lowPerformance: true });
    expect(JSON.stringify(saved)).not.toMatch(/"view"|detailsOpen/);
  });
});

describe("the specs after the car forms", () => {
  it("are still on the car page when the car can first be turned, instead of flashing past", async () => {
    await enterWorkspace();
    expect(state().phase).toBe("workspace");
    expect(state().ui.view).toBe("car");
    const specs = screen.getByTestId("reveal-specs");
    expect(specs).toHaveTextContent("5 seats");
    expect(specs).toHaveTextContent("32 mpg");
    expect(specs).toHaveAttribute("data-state", "holding");
  });

  it("stay while you look around, hold for about 30 seconds, then fade away slowly and stay gone", async () => {
    await enterWorkspace();
    await advance(20_000);
    expect(screen.getByTestId("reveal-specs")).toHaveAttribute("data-state", "holding");
    await advance(15_000); // past the hold: now fading, not gone
    const el = screen.queryByTestId("reveal-specs");
    expect(el === null || el.getAttribute("data-state") === "fading").toBe(true);
    await advance(10_000);
    expect(screen.queryByTestId("reveal-specs")).toBeNull();
    goFuture();
    goCar();
    expect(screen.queryByTestId("reveal-specs")).toBeNull();
  });

  it("are not on the future page, and are there again on coming back within the time", async () => {
    await enterWorkspace();
    goFuture();
    expect(screen.queryByTestId("reveal-specs")).toBeNull();
    goCar();
    expect(screen.getByTestId("reveal-specs")).toBeInTheDocument();
  });

  it("lift above the command bar instead of sitting under it (small screens)", async () => {
    await enterWorkspace();
    const bottom = parseInt(screen.getByTestId("reveal-specs").style.getPropertyValue("--spec-bottom"), 10);
    expect(bottom).toBeGreaterThanOrEqual(150); // above the bar, never behind it
  });

  it("are a column at the left edge on wide screens, and only fade (opacity), never a moving position", async () => {
    await enterWorkspace();
    const specs = screen.getByTestId("reveal-specs");
    for (const c of ["md:left-6", "md:top-1/2", "md:-translate-y-1/2"]) expect(specs.className).toContain(c);
    expect(specs.style.transitionProperty).toBe("opacity");
  });

  it("the progress line is gone by the time they show", async () => {
    await openCamry();
    act(() => state().actions.onRevealStage("solid"));
    expect(screen.getByTestId("reveal-specs")).toBeInTheDocument();
    expect(screen.queryByTestId("reveal-stage-pill")).toBeNull();
  });

  it("never block turning the car", async () => {
    await enterWorkspace();
    expect(screen.getByTestId("reveal-specs").className).toContain("pointer-events-none");
  });

  it("show again for the other car when you switch", async () => {
    await enterWorkspace();
    await advance(60_000);
    expect(screen.queryByTestId("reveal-specs")).toBeNull();
    openDetails();
    const switchBtn = screen.getAllByRole("button").find((b) => /RAV4/.test(b.textContent ?? "") && /Switch|switch/.test(b.getAttribute("aria-label") ?? b.textContent ?? ""));
    if (switchBtn) {
      fireEvent.click(switchBtn);
      await advance(4100);
      expect(screen.getByTestId("reveal-specs")).toBeInTheDocument();
    } else {
      await act(async () => {
        await state().actions.startFromSample("rav4-2024-hybrid-xle");
      });
      await advance(4100);
      expect(screen.getByTestId("reveal-specs")).toHaveTextContent(`${state().twin!.vehicle.mpg} mpg`);
    }
  });
});

describe("the rider chips", () => {
  const dock = () => screen.getByTestId("rider-dock");

  it("sit in a row while the car forms, then move to a side panel when it can be turned", async () => {
    await openCamry(); // the reveal has begun
    expect(state().phase).toBe("reveal");
    expect(dock()).toHaveAttribute("data-mode", "row");
    expect(within(dock()).getAllByRole("button").map((b) => b.textContent)).toEqual(["Just me", "Partner", "Kids", "Mixed"]);
    expect(screen.getByTestId("reveal-overlay")).not.toContainElement(dock()); // they are not part of what goes away with the reveal

    await advance(4100);
    expect(state().phase).toBe("workspace");
    expect(dock()).toHaveAttribute("data-mode", "panel");
    expect(dock()).toHaveAttribute("data-visible", "true");
    expect(screen.queryByTestId("reveal-overlay")).toBeNull();
  });

  it("are the same chips afterwards, and still answer the question", async () => {
    await openCamry();
    const before = within(dock()).getAllByRole("button");
    await advance(4100);
    expect(within(dock()).getAllByRole("button")).toEqual(before);
    fireEvent.click(within(dock()).getByRole("button", { name: "Kids" }));
    expect([state().explore.confirmedProfile.householdSize, state().explore.confirmedProfile.children]).toEqual([3, 1]);
    expect(within(dock()).getByRole("button", { name: "Kids" })).toHaveAttribute("aria-pressed", "true");
  });

  it("are on the car page only, and a replayed reveal brings them back to the row", async () => {
    await enterWorkspace();
    goFuture();
    expect(dock()).toHaveAttribute("data-visible", "false");
    goCar();
    expect(dock()).toHaveAttribute("data-visible", "true");
    openDetails();
    fireEvent.click(screen.getByRole("button", { name: "Replay reveal" }));
    expect(state().phase).toBe("reveal");
    expect(dock()).toHaveAttribute("data-mode", "row");
  });

  it("never block turning the car, and read no build words", async () => {
    await enterWorkspace();
    expect(dock().className).toContain("pointer-events-none");
    expect(dock().textContent).not.toMatch(/demo|data/i);
  });
});
