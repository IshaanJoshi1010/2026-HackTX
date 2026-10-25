import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LifeEvent } from "@/contracts";
import type { Tradeoff } from "@/ui/compare/tradeoff";
import { monthLabel } from "@/ui/profile/format";
import { BASE_ID, resetForkStoreForTests, useForkStore } from "@/ui/store/useForkStore";
import { WindingTimeline } from "./WindingTimeline";
import { ENDPOINT_H, ENDPOINT_W, MIN_HEIGHT, NODE_R, layoutWinding } from "./windingMath";

// Another module builds the tradeoff; here it is whatever the test says, so null and filled can both be shown.
const tradeoffNow = vi.hoisted(() => ({ value: null as Tradeoff | null }));
vi.mock("@/ui/compare/useTradeoff", () => ({ useTradeoff: () => tradeoffNow.value }));

const TRADEOFF: Tradeoff = {
  rows: [
    { key: "cost", label: "Cost", leader: "keep" },
    { key: "fuel", label: "Fuel use", leader: "switch" },
    { key: "longevity", label: "Life left", leader: "switch" },
    { key: "family", label: "Family fit", leader: "level" },
    { key: "comfort", label: "Comfort", leader: "keep" },
  ],
  sentence: "The RAV4 is ahead on fuel and life left, but keeping the Camry wins on cost and comfort, so it stays close.",
  closeCall: true,
};

const EM_DASH = String.fromCharCode(0x2014);

const state = () => useForkStore.getState();
const actions = () => useForkStore.getState().actions;

type Draft = Omit<LifeEvent, "id" | "status">;
const draft = (type: LifeEvent["type"], month: number, payload: LifeEvent["payload"], quote?: string): Draft => ({ type, month, payload, source: "user", assumptions: [], quote, certainty: "clear" });
const MILES = draft("mileage_change", 0, { annualMiles: 30000 }, "30,000 miles a year");
const MOVE = draft("relocation", 12, { location: "Denver" }, "moving to Denver next year");
const KID = draft("family_change", 32, { children: 2 });

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

async function compare() {
  await act(async () => {
    await actions().openReplaceComparison();
  });
}

const steps = () => screen.getAllByTestId("step");
const ends = () => screen.getAllByTestId("fork-end");
const keepEnd = () => ends().find((e) => e.getAttribute("data-option") === "keep")!;
const switchEnd = () => ends().find((e) => e.getAttribute("data-option") === "replace")!;
const px = (v: string) => parseFloat(v);
const swapMonthOf = (scenarioId: string) => state().explore.scenarios.find((s) => s.id === scenarioId)!.events.find((e) => e.type === "vehicle_replacement")!.month;
/** The three parts of the event area, by their visible label. */
const part = (label: "Selected event" | "Effect" | "Explanation") => within(screen.getByTestId("step-detail")).getByText(label).closest("section") as HTMLElement;

beforeEach(async () => {
  vi.restoreAllMocks();
  localStorage.clear();
  tradeoffNow.value = null;
  resetForkStoreForTests();
  useForkStore.setState({ hydrated: true });
  await actions().startFromSample("camry-2022-se");
  actions().onRevealStage("done");
});

afterEach(() => cleanup());

describe("the route", () => {
  it("puts each step where the geometry says, and its label on the side the geometry says", () => {
    confirm(MILES, MOVE, KID);
    render(<WindingTimeline />);
    const layout = layoutWinding(3, { width: 960, height: MIN_HEIGHT }); // the size it assumes where there is no layout
    expect(steps()).toHaveLength(4); // three events and the fork
    const at = (i: number) => (i < 3 ? layout.steps[i] : layout.fork);
    steps().forEach((el, i) => {
      expect(px(el.style.left)).toBeCloseTo(at(i).x - NODE_R, 1);
      expect(px(el.style.top)).toBeCloseTo(at(i).y - NODE_R, 1);
    });
    screen.getAllByTestId("step-label").forEach((l, i) => {
      const { y, above } = at(i);
      expect(l.style.transform).toBe(above ? "translateY(-100%)" : "");
      expect(px(l.style.top)).toBeCloseTo(above ? y - NODE_R - 12 : y + NODE_R + 12, 1);
    });
  });

  it("draws one line through every step and on to the fork, drawn in as it appears", () => {
    confirm(MILES, MOVE);
    render(<WindingTimeline />);
    const main = screen.getByTestId("path-main");
    expect(main.getAttribute("d")!.match(/C /g)).toHaveLength(2); // two events and the fork: two curves
    expect(main.getAttribute("class")).toContain("fork-draw");
    expect(main.getAttribute("pathLength")).toBe("1");
  });

  it("numbers the events 01, 02, 03 and gives the fork a branch icon instead of a number", () => {
    confirm(MILES, MOVE, KID);
    render(<WindingTimeline />);
    expect(steps().slice(0, 3).map((b) => b.textContent)).toEqual(["01", "02", "03"]);
    const fork = steps()[3];
    expect(fork).toHaveAttribute("data-step-key", "fork");
    expect(fork.textContent).toBe("");
    expect(fork.querySelector("svg")).not.toBeNull();
    expect(fork.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(fork.className).toContain("rounded-full");
  });

  it("says only a short date and the event name on each label, and 'Your choice' on the fork", () => {
    confirm(MILES, MOVE, KID);
    render(<WindingTimeline />);
    expect(screen.getAllByTestId("step-label").map((l) => l.textContent)).toEqual(["Now30,000 miles a year", "In 1 yrMove to Denver", "In 2 yr 8 moSecond child", "Your choice"]);
  });

  it("sets labels in big type: the event name is text-lg", () => {
    confirm(MILES);
    render(<WindingTimeline />);
    const title = within(screen.getAllByTestId("step-label")[0]).getByText("30,000 miles a year");
    expect(title.className).toContain("text-lg");
  });

  it("sets the fork apart from the events: a gap, and a thin divider between the last event and the fork", () => {
    confirm(MILES, MOVE, KID);
    render(<WindingTimeline />);
    const layout = layoutWinding(3, { width: 960, height: MIN_HEIGHT });
    const lefts = steps().map((s) => px(s.style.left));
    const gaps = lefts.slice(1).map((x, i) => x - lefts[i]);
    expect(gaps[0]).toBeCloseTo(layout.dx, 1);
    expect(gaps[1]).toBeCloseTo(layout.dx, 1);
    expect(gaps[2]).toBeGreaterThan(gaps[1] + 30); // the fork sits further on than the next step would
    const divider = screen.getByTestId("fork-divider");
    expect(divider).toHaveAttribute("aria-hidden", "true");
    expect(divider.className).toContain("w-px");
    expect(px(divider.style.left)).toBeGreaterThan(lefts[2] + NODE_R); // past the last event
    expect(px(divider.style.left)).toBeLessThan(lefts[3]); // before the fork
  });

  it("each step has a full name for a screen reader, and only the open one is in the tab order", () => {
    confirm(MILES, MOVE);
    render(<WindingTimeline />);
    expect(steps()[1]).toHaveAccessibleName("Step 2 of 2: Move to Denver, in 1 yr");
    expect(steps()[0]).toHaveAccessibleName("Step 1 of 2: 30,000 miles a year, now");
    expect(steps()[2]).toHaveAccessibleName("Your choice: keep or switch");
    expect(steps().map((s) => s.tabIndex)).toEqual([0, -1, -1]);
  });

  it("says nothing about cost, recommendation or what to tap on the route, before or after comparing", async () => {
    confirm(MILES, MOVE);
    render(<WindingTimeline />);
    const route = () => screen.getByTestId("winding-scroll").textContent!;
    const banned = /Adds to your cost|Lowers your cost|No change to cost|Where you start|Keep or switch|Recommended|Alternative|Close call|Your plan|Tap to compare|\$/;
    expect(route()).not.toMatch(banned);
    await compare();
    expect(route()).not.toMatch(banned);
    expect(route()).toContain("Keep your 2022 Camry");
  });

  it("scrolls sideways instead of crowding when there are many steps", () => {
    confirm(MILES, MOVE, KID);
    for (const m of [14, 20, 26, 40, 50]) confirm(draft("fuel_price_change", m, { fuelPricePerGal: 3 + m / 10 }));
    render(<WindingTimeline />);
    expect(steps().length).toBeGreaterThanOrEqual(8);
    const scroll = screen.getByTestId("winding-scroll");
    expect(scroll.className).toContain("overflow-x-auto");
    const inner = scroll.firstElementChild as HTMLElement;
    expect(px(inner.style.width)).toBeGreaterThan(960);
    const xs = steps().map((s) => px(s.style.left));
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(192); // never closer than a label needs
  });

  it("brings the open step into view when it changes", () => {
    confirm(MILES, MOVE, KID);
    render(<WindingTimeline />);
    const scrollIntoView = vi.fn();
    steps().forEach((s) => (s.scrollIntoView = scrollIntoView));
    fireEvent.click(steps()[2]);
    expect(scrollIntoView).toHaveBeenCalledWith({ inline: "center", block: "nearest", behavior: "smooth" });
  });

  it("moves along with the arrow keys, Home and End, the fork included, with focus following", () => {
    confirm(MILES, MOVE);
    render(<WindingTimeline />);
    const key = (i: number, k: string) => fireEvent.keyDown(steps()[i], { key: k });
    key(0, "ArrowRight");
    expect(screen.getByTestId("step-title")).toHaveTextContent("Move to Denver");
    expect(steps()[1]).toHaveFocus();
    key(1, "ArrowRight");
    expect(screen.getByTestId("step-title")).toHaveTextContent("A fork in the road");
    expect(steps()[2]).toHaveFocus();
    expect(steps().map((s) => s.tabIndex)).toEqual([-1, -1, 0]);
    key(2, "ArrowRight"); // nothing past the fork
    expect(steps()[2]).toHaveAttribute("aria-current", "step");
    key(2, "Home");
    expect(screen.getByTestId("step-title")).toHaveTextContent("30,000 miles a year");
    key(0, "End");
    expect(steps()[2]).toHaveAttribute("aria-current", "step");
    key(2, "ArrowLeft");
    expect(steps()[1]).toHaveAttribute("aria-current", "step");
  });
});

describe("the event area", () => {
  it("is the first step by default, and says which of how many", () => {
    confirm(MILES, MOVE);
    render(<WindingTimeline />);
    expect(screen.getByTestId("step-title")).toHaveTextContent("30,000 miles a year");
    expect(screen.getByTestId("step-count")).toHaveTextContent("1 of 2");
    expect(steps()[0]).toHaveAttribute("aria-current", "step");
  });

  it("never changes height: a fixed minimum, and a fixed box for the text that scrolls if it ever outgrows it", () => {
    confirm(MILES, MOVE, KID);
    render(<WindingTimeline />);
    const detail = screen.getByTestId("step-detail");
    expect(detail.className).toContain("min-h-[340px]");
    const seen = new Set<string>();
    for (const s of steps()) {
      fireEvent.click(s);
      const body = screen.getByTestId("step-detail-body");
      expect(body.className).toContain("overflow-y-auto");
      expect(body.className).toMatch(/\bh-\[/);
      seen.add(`${screen.getByTestId("step-detail").className}|${body.className}`);
    }
    expect(seen.size).toBe(1); // the same box for the first event, the last and the fork
  });

  it("keeps the large two digit number, hidden from a screen reader", () => {
    confirm(MILES, MOVE);
    render(<WindingTimeline />);
    fireEvent.click(steps()[1]);
    const big = screen.getByTestId("step-detail").querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(big.textContent).toBe("02");
    expect(big.className).toContain("text-[56px]");
  });

  it("is selected event, then effect, then explanation, for an event, for the start and for the fork", () => {
    confirm(MOVE); // no step at month 0, so there is a first step for where you start
    render(<WindingTimeline />);
    for (const s of steps()) {
      fireEvent.click(s);
      const labels = [...screen.getByTestId("step-detail").querySelectorAll("section")].map((sec) => sec.firstElementChild?.textContent);
      expect(labels).toEqual(["Selected event", "Effect", "Explanation"]);
    }
  });

  it("selected event is when and the title", () => {
    confirm(MILES, MOVE);
    render(<WindingTimeline />);
    fireEvent.click(steps()[1]);
    expect(part("Selected event").textContent).toBe("Selected eventIn 1 yrMove to Denver");
  });

  it("a costing event says what it adds over five years, with its source, in the effect", () => {
    confirm(MILES, MOVE);
    render(<WindingTimeline />);
    const effect = part("Effect");
    expect(within(effect).getByTestId("step-effect").textContent).toMatch(/(Adds|Saves) \$[\d,]+ over 5 yr/);
    expect(within(effect).getByTestId("step-effect").querySelector("[data-source]")).not.toBeNull();
  });

  it("a free event says so in words and has nothing to label", () => {
    confirm(MILES, MOVE);
    render(<WindingTimeline />);
    fireEvent.click(steps()[1]);
    expect(part("Effect")).toHaveTextContent("No change to cost.");
    expect(part("Effect").textContent).not.toContain("$");
    expect(part("Effect").querySelector("[data-source]")).toBeNull();
  });

  it("says what you said, then the assumptions, then that Fork worked it out, in the explanation", () => {
    confirm({ ...MOVE, certainty: "inferred", assumptions: ["Dated from next year", "Denver fuel prices"] });
    render(<WindingTimeline />);
    fireEvent.click(steps()[1]);
    const text = part("Explanation").textContent!;
    expect(text).toContain("“moving to Denver next year”");
    expect(text.indexOf("“moving")).toBeLessThan(text.indexOf("Dated from next year"));
    expect(text.indexOf("Dated from next year")).toBeLessThan(text.indexOf("Denver fuel prices"));
    expect(text.indexOf("Denver fuel prices")).toBeLessThan(text.indexOf("Fork worked this out from what you said."));
    expect(within(part("Explanation")).getByTestId("step-assumptions").querySelectorAll("li")).toHaveLength(2);
    expect(part("Effect").textContent).not.toContain("Dated from next year"); // the effect is not the explanation
  });

  it("puts the fit note with the effect, not the explanation", () => {
    confirm(draft("family_change", 12, { children: 3 }), draft("cargo_change", 12, { cargoNeed: "high" }));
    render(<WindingTimeline />);
    const withFit = steps().find((s) => {
      fireEvent.click(s);
      return /fit goes from/.test(screen.getByTestId("step-detail").textContent ?? "");
    });
    expect(withFit).toBeDefined();
    expect(part("Effect").textContent).toMatch(/fit goes from/);
    expect(part("Explanation").textContent).not.toMatch(/fit goes from/);
  });

  it("the start step says where you start, and has no cost of its own", () => {
    confirm(MOVE);
    render(<WindingTimeline />);
    expect(screen.getByTestId("step-title")).toHaveTextContent("Your 2022 Camry");
    expect(part("Effect")).toHaveTextContent("Where you start");
    expect(part("Explanation")).toHaveTextContent("Everything after this is what you have told Fork is changing.");
  });

  it("never repeats the five year totals or a net cost for a step: that is on the page above", async () => {
    confirm(MILES, MOVE);
    render(<WindingTimeline />);
    await compare();
    for (const s of steps()) {
      fireEvent.click(s);
      const detail = screen.getByTestId("step-detail");
      expect(detail.querySelector('[data-slot="stat"]')).toBeNull();
      expect(detail.textContent).not.toMatch(/Net cost|If nothing changes|Switching (adds|saves)/);
    }
    expect(screen.getByTestId("step-detail").textContent).not.toContain("$"); // the fork: no totals either
    expect(screen.queryByTestId("fork-difference")).toBeNull();
  });

  it("goes along with Previous and Next, and each stops at its end", () => {
    confirm(MILES, MOVE);
    render(<WindingTimeline />);
    const prev = screen.getByRole("button", { name: "Previous step" });
    const next = screen.getByRole("button", { name: "Next step" });
    expect(prev).toBeDisabled();
    fireEvent.click(next);
    expect(screen.getByTestId("step-title")).toHaveTextContent("Move to Denver");
    expect(screen.getByTestId("step-count")).toHaveTextContent("2 of 2");
    fireEvent.click(next);
    expect(screen.getByTestId("step-title")).toHaveTextContent("A fork in the road");
    expect(screen.getByTestId("step-count")).toHaveTextContent("Your choice"); // the fork is not numbered
    expect(next).toBeDisabled();
    fireEvent.click(prev);
    expect(screen.getByTestId("step-title")).toHaveTextContent("Move to Denver");
  });

  it("stays on the step you chose when something is added, and falls back to the first when it goes away", () => {
    confirm(MILES, MOVE);
    render(<WindingTimeline />);
    fireEvent.click(steps()[1]);
    expect(screen.getByTestId("step-title")).toHaveTextContent("Move to Denver");
    confirm(KID);
    expect(screen.getByTestId("step-title")).toHaveTextContent("Move to Denver"); // the same step, though it is a new future now
    act(() => actions().setActiveScenario(BASE_ID));
    expect(screen.getByTestId("step-count")).toHaveTextContent("1 of 1"); // that step is not in this future: back to the first
  });
});

describe("the two ends of the fork", () => {
  it("are the same control: same size, border, padding and type, only the pressed state differs", () => {
    confirm(MOVE);
    render(<WindingTimeline />);
    const state = new Set(["bg-ink", "text-canvas", "text-ink", "hover:bg-ink/10"]);
    const base = (el: HTMLElement) => el.className.split(/\s+/).filter((c) => !state.has(c)).sort();
    expect(base(keepEnd())).toEqual(base(switchEnd()));
    for (const c of ["border", "border-line", "rounded-lg", "px-4", "py-3"]) {
      expect(keepEnd().className.split(/\s+/)).toContain(c);
      expect(switchEnd().className.split(/\s+/)).toContain(c);
    }
    for (const el of ends()) {
      expect(el.style.width).toBe(`${ENDPOINT_W}px`);
      expect(el.style.height).toBe(`${ENDPOINT_H}px`);
      expect(el.querySelectorAll("span")).toHaveLength(2); // a title line and a timing line
      expect(el.querySelector("span")!.className).toContain("text-lg");
    }
  });

  it("have a title line and a timing line: keep runs through year 5, switch says when it swaps", () => {
    confirm(MOVE);
    render(<WindingTimeline />);
    expect(within(keepEnd()).getByText("Keep your 2022 Camry")).toBeInTheDocument();
    expect(within(keepEnd()).getByText("Through year 5")).toBeInTheDocument();
    expect(within(switchEnd()).getByText("Explore the 2024 RAV4 Hybrid XLE")).toBeInTheDocument();
    expect(within(switchEnd()).getByText("Swap in 1 yr")).toBeInTheDocument();
  });

  it("before comparing, the swap month is the one the model would pick for this life", () => {
    confirm(KID);
    render(<WindingTimeline />);
    expect(switchEnd()).toHaveTextContent("Swap in 2 yr 8 mo"); // the first family change, as the sim defaults it
    cleanup();
    confirm(MOVE);
    render(<WindingTimeline />);
    expect(switchEnd()).toHaveTextContent("Swap in 1 yr"); // the earlier move wins
  });

  it("after comparing, the swap month is the replacement's own month in the compared future", async () => {
    confirm(KID);
    render(<WindingTimeline />);
    await compare();
    const { replaceId } = state().comparison!;
    expect(switchEnd()).toHaveTextContent(`Swap in ${monthLabel(swapMonthOf(replaceId))}`);
    expect(switchEnd()).toHaveTextContent("Switch to the 2024 RAV4");
  });

  it("the future you are looking at is the pressed one; the unpriced offer never is", () => {
    confirm(MOVE);
    render(<WindingTimeline />);
    expect(keepEnd()).toHaveAttribute("aria-pressed", "true");
    expect(keepEnd().className).toContain("bg-ink");
    expect(keepEnd().className).toContain("text-canvas");
    expect(switchEnd()).toHaveAttribute("aria-pressed", "false");
    expect(switchEnd().className).not.toContain("bg-ink text-canvas");
  });

  it("carry no recommendation: the same two ends, in the same places, whatever the engine picked", async () => {
    render(<WindingTimeline />);
    await compare();
    expect(ends().map((e) => e.getAttribute("data-option"))).toEqual(["keep", "replace"]);
    const top = (el: HTMLElement) => px(el.style.top);
    expect(top(keepEnd())).toBeLessThan(top(switchEnd())); // keeping is always the upper way
    for (const e of ends()) expect(e.textContent).not.toMatch(/Recommended|Alternative|Close call|Your plan|Tap to compare/);
  });

  it("tapping the unpriced offer compares, and it waits while something else is working", async () => {
    confirm(MOVE);
    render(<WindingTimeline />);
    expect(state().comparison).toBeNull();
    await act(async () => {
      fireEvent.click(switchEnd());
    });
    expect(state().comparison).not.toBeNull();
    expect(state().evaluation).not.toBeNull();
  });

  it("the offer waits while something else is working", () => {
    render(<WindingTimeline />);
    act(() => useForkStore.setState((s) => ({ ui: { ...s.ui, busy: "simulating" } })));
    expect(screen.getByRole("button", { name: /Explore the 2024 RAV4/ })).toBeDisabled();
  });

  it("each end looks at its own future: tap one and its car is the one on the page, and it is the pressed one", async () => {
    render(<WindingTimeline />);
    await compare();
    const { keepId, replaceId } = state().comparison!;
    expect(state().activeScenarioId).toBe(replaceId);
    expect(switchEnd()).toHaveAttribute("aria-pressed", "true");
    expect(keepEnd()).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(keepEnd());
    expect(state().activeScenarioId).toBe(keepId);
    expect(keepEnd()).toHaveAttribute("aria-pressed", "true");
    expect(switchEnd()).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(switchEnd());
    expect(state().activeScenarioId).toBe(replaceId);
    expect(state().stage.transitionTo?.id).toBe(state().replacementVehicle!.id);
  });
});

describe("the paths of the fork", () => {
  it("before comparing: keeping is solid and bright, the offer is the only dashed path", () => {
    confirm(MOVE);
    render(<WindingTimeline />);
    const up = screen.getByTestId("path-up");
    const down = screen.getByTestId("path-down");
    expect(up).toHaveAttribute("data-dashed", "false");
    expect(down).toHaveAttribute("data-dashed", "true");
    expect(up.getAttribute("stroke-dasharray")).toBeNull();
    expect(down.getAttribute("stroke-dasharray")).not.toBeNull();
    expect(up.getAttribute("class")).toBe("stroke-ink");
    expect(up).toHaveAttribute("stroke-width", "3");
  });

  it("after comparing: both are solid, and the one you are looking at is brighter and thicker", async () => {
    confirm(MOVE);
    render(<WindingTimeline />);
    await compare(); // looking at the switch future
    const up = screen.getByTestId("path-up");
    const down = screen.getByTestId("path-down");
    expect(up).toHaveAttribute("data-dashed", "false");
    expect(down).toHaveAttribute("data-dashed", "false");
    expect(down.getAttribute("stroke-dasharray")).toBeNull();
    expect(down).toHaveAttribute("stroke-width", "3");
    expect(down.getAttribute("class")).toBe("stroke-ink");
    expect(up).toHaveAttribute("stroke-width", "2");
    expect(up.getAttribute("class")).toBe("stroke-ink/60");
    fireEvent.click(keepEnd());
    expect(screen.getByTestId("path-up")).toHaveAttribute("stroke-width", "3");
    expect(screen.getByTestId("path-down")).toHaveAttribute("stroke-width", "2");
  });

  it("leave the fork marker, not the last event", () => {
    confirm(MILES, MOVE);
    render(<WindingTimeline />);
    const fork = steps().at(-1)!;
    const forkX = px(fork.style.left) + NODE_R;
    const forkY = px(fork.style.top) + NODE_R;
    for (const id of ["path-up", "path-down"]) expect(screen.getByTestId(id).getAttribute("d")).toMatch(new RegExp(`^M ${forkX} ${forkY} `));
  });
});

describe("the fork's event area", () => {
  it("without a tradeoff it asks you to compare, and still says when the swap would happen", () => {
    confirm(MOVE);
    render(<WindingTimeline />);
    fireEvent.click(steps().at(-1)!);
    expect(part("Selected event")).toHaveTextContent("Your choice");
    expect(part("Selected event")).toHaveTextContent("A fork in the road");
    expect(part("Effect")).toHaveTextContent("Compare with the RAV4 to see the tradeoff.");
    expect(screen.queryByTestId("tradeoff-rows")).toBeNull();
    expect(part("Explanation")).toHaveTextContent("The swap is modeled in 1 yr in the Switch future.");
    expect(screen.getByTestId("step-count")).toHaveTextContent("Your choice");
  });

  it("with a tradeoff it lists the five priorities and who is ahead, in words", async () => {
    tradeoffNow.value = TRADEOFF;
    confirm(MOVE);
    render(<WindingTimeline />);
    await compare();
    fireEvent.click(steps().at(-1)!);
    const rows = [...within(part("Effect")).getByTestId("tradeoff-rows").querySelectorAll("li")];
    expect(rows.map((r) => [...r.querySelectorAll("span")].map((s) => s.textContent))).toEqual([
      ["Cost", "Keeping the Camry"],
      ["Fuel use", "The RAV4"],
      ["Life left", "The RAV4"],
      ["Family fit", "Level"],
      ["Comfort", "Keeping the Camry"],
    ]);
    expect(rows.map((r) => r.getAttribute("data-factor"))).toEqual(["cost", "fuel", "longevity", "family", "comfort"]);
    expect(part("Effect")).not.toHaveTextContent("Compare with the RAV4");
  });

  it("then the sentence, then the modeled swap timing with its source, in the explanation", async () => {
    tradeoffNow.value = TRADEOFF;
    confirm(MOVE);
    render(<WindingTimeline />);
    await compare();
    fireEvent.click(steps().at(-1)!);
    const explanation = part("Explanation");
    const text = explanation.textContent!;
    expect(text).toContain(TRADEOFF.sentence);
    expect(text.indexOf(TRADEOFF.sentence)).toBeLessThan(text.indexOf("The swap is modeled in 1 yr in the Switch future."));
    expect(within(explanation).getByTestId("swap-timing").querySelector("[data-source]")).not.toBeNull();
  });

  it("the big number slot holds a branch icon, not a number", () => {
    confirm(MOVE);
    render(<WindingTimeline />);
    fireEvent.click(steps().at(-1)!);
    const big = screen.getByTestId("step-detail").querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(big.querySelector("svg")).not.toBeNull();
    expect(big.textContent).toBe("");
  });

  it("the swap is not a step, and looking at the other car does not change the path", async () => {
    confirm(MILES, MOVE);
    render(<WindingTimeline />);
    const before = steps().map((s) => s.getAttribute("aria-label"));
    await compare(); // makes the replace future the one you are looking at
    expect(state().activeScenarioId).toBe(state().comparison!.replaceId);
    expect(steps().map((s) => s.getAttribute("aria-label"))).toEqual(before);
    expect(screen.queryByText(/Replace car/)).toBeNull();
  });
});

describe("what it never does", () => {
  it("renders nothing before there is a car", () => {
    resetForkStoreForTests();
    const { container } = render(<WindingTimeline />);
    expect(container).toBeEmptyDOMElement();
  });

  it("does not change what it reads: the store is the same after looking at every step", () => {
    confirm(MILES, MOVE, KID);
    const before = JSON.stringify({ explore: state().explore, results: state().results });
    render(<WindingTimeline />);
    for (const s of steps()) fireEvent.click(s);
    expect(JSON.stringify({ explore: state().explore, results: state().results })).toBe(before);
  });

  it("has no em dashes, and none of the build words, anywhere on it, at any step", async () => {
    tradeoffNow.value = TRADEOFF;
    confirm({ ...MILES, certainty: "inferred", assumptions: ["From your note"] }, MOVE, KID);
    const { container } = render(<WindingTimeline />);
    await compare();
    for (const s of steps()) {
      fireEvent.click(s);
      expect(container.textContent).not.toContain(EM_DASH);
      expect(container.textContent).not.toMatch(/demo|data/i);
      for (const el of container.querySelectorAll("[title],[aria-label]")) {
        expect(`${el.getAttribute("title")} ${el.getAttribute("aria-label")}`).not.toMatch(new RegExp(`demo|data|${EM_DASH}`, "i"));
      }
    }
  });

  it("wipes build words out of text that comes from another module", async () => {
    tradeoffNow.value = { ...TRADEOFF, sentence: "Built on demo data." };
    confirm({ ...MOVE, assumptions: ["Uses demo data for Denver"] });
    const { container } = render(<WindingTimeline />);
    await compare();
    fireEvent.click(steps()[1]);
    fireEvent.click(steps().at(-1)!);
    expect(container.textContent).not.toMatch(/demo|data/i);
  });

  it("every number on it carries a source", () => {
    confirm(MILES, MOVE);
    const { container } = render(<WindingTimeline />);
    const dollars = within(screen.getByTestId("step-detail")).getAllByText(/\$[\d,]+/);
    expect(dollars.length).toBeGreaterThan(0);
    for (const el of dollars) expect(el.querySelector("[data-source]")).not.toBeNull();
    expect(container.querySelectorAll('[data-slot="stat"]')).toHaveLength(0);
  });
});
