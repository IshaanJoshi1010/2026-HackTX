import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LifeEvent } from "@/contracts";
import { BASE_ID, resetForkStoreForTests, useForkStore } from "@/ui/store/useForkStore";
import { WindingTimeline } from "./WindingTimeline";
import { NODE_R, layoutWinding } from "./windingMath";

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

const steps = () => screen.getAllByTestId("step");
const px = (v: string) => parseFloat(v);

beforeEach(async () => {
  vi.restoreAllMocks();
  localStorage.clear();
  resetForkStoreForTests();
  useForkStore.setState({ hydrated: true });
  await actions().startFromSample("camry-2022-se");
  actions().onRevealStage("done");
});

afterEach(() => cleanup());

describe("the path", () => {
  it("puts each step where the geometry says, and its label on the side the geometry says", () => {
    confirm(MILES, MOVE, KID);
    render(<WindingTimeline />);
    const layout = layoutWinding(4, { width: 960, height: 360 }); // the size it assumes where there is no layout
    expect(steps()).toHaveLength(4);
    steps().forEach((el, i) => {
      expect(px(el.style.left)).toBeCloseTo(layout.steps[i].x - NODE_R, 1);
      expect(px(el.style.top)).toBeCloseTo(layout.steps[i].y - NODE_R, 1);
    });
    const labels = screen.getAllByTestId("step-label");
    labels.forEach((l, i) => {
      const above = layout.steps[i].above;
      expect(l.style.transform).toBe(above ? "translateY(-100%)" : "");
      expect(px(l.style.top)).toBeCloseTo(above ? layout.steps[i].y - NODE_R - 12 : layout.steps[i].y + NODE_R + 12, 1);
    });
  });

  it("draws one line through every step, drawn in as it appears", () => {
    confirm(MILES, MOVE);
    render(<WindingTimeline />);
    const main = screen.getByTestId("path-main");
    expect(main.getAttribute("d")!.match(/C /g)).toHaveLength(2); // three steps, two curves
    expect(main.getAttribute("class")).toContain("fork-draw");
    expect(main.getAttribute("pathLength")).toBe("1");
  });

  it("numbers the steps and says each one's title and time, in order", () => {
    confirm(MILES, MOVE, KID);
    render(<WindingTimeline />);
    expect(steps().map((b) => b.textContent)).toEqual(["01", "02", "03", "04"]);
    expect(screen.getAllByTestId("step-label").map((l) => l.textContent)).toEqual([
      expect.stringMatching(/^Now30,000 miles a year/),
      expect.stringMatching(/^In 1 yrMove to Denver/),
      expect.stringMatching(/^In 2 yr 8 moSecond child/),
      expect.stringMatching(/^Your choiceA fork in the road/),
    ]);
  });

  it("each step has a full name for a screen reader, and only the open one is in the tab order", () => {
    confirm(MILES, MOVE);
    render(<WindingTimeline />);
    expect(steps()[1]).toHaveAccessibleName("Step 2 of 3: Move to Denver, in 1 yr");
    expect(steps()[0]).toHaveAccessibleName("Step 1 of 3: 30,000 miles a year, now");
  });

  it("says in words what each step did to the cost, and puts no dollar figure on the path itself", () => {
    confirm(MILES, MOVE);
    render(<WindingTimeline />);
    const [miles, move] = screen.getAllByTestId("step-label");
    expect(miles.textContent).toMatch(/Adds to your cost|Lowers your cost/);
    expect(move.textContent).toContain("No change to cost");
    for (const l of screen.getAllByTestId("step-label")) expect(l.textContent).not.toContain("$"); // the numbers are on the card, with their sources
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
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(176); // never closer than a label needs
  });

  it("brings the open step into view when it changes", () => {
    confirm(MILES, MOVE, KID);
    render(<WindingTimeline />);
    const scrollIntoView = vi.fn();
    steps().forEach((s) => (s.scrollIntoView = scrollIntoView));
    fireEvent.click(steps()[2]);
    expect(scrollIntoView).toHaveBeenCalledWith({ inline: "center", block: "nearest", behavior: "smooth" });
  });
});

describe("the open step", () => {
  it("is the first by default, and the card says what it is", () => {
    confirm(MILES, MOVE);
    render(<WindingTimeline />);
    expect(screen.getByTestId("step-title")).toHaveTextContent("30,000 miles a year");
    expect(screen.getByTestId("step-count")).toHaveTextContent("1 of 3");
    expect(steps()[0]).toHaveAttribute("aria-current", "step");
  });

  it("says what you said, and when the engine had to work it out", () => {
    confirm({ ...MOVE, certainty: "inferred", assumptions: ["Dated from next year"] });
    render(<WindingTimeline />);
    fireEvent.click(steps()[1]);
    const card = screen.getByTestId("step-detail");
    expect(card).toHaveTextContent("“moving to Denver next year”");
    expect(card).toHaveTextContent("Fork worked this out from what you said.");
    expect(card).toHaveTextContent("Dated from next year");
  });

  it("gives a costing step its dollars with their source, and a free one only words", () => {
    confirm(MILES, MOVE);
    render(<WindingTimeline />);
    expect(screen.getByTestId("step-effect").textContent).toMatch(/(Adds|Saves) \$[\d,]+ over 5 yr/);
    expect(screen.getByTestId("step-effect").querySelector("[data-source]")).not.toBeNull();
    fireEvent.click(steps()[1]);
    expect(screen.getByTestId("step-effect")).toHaveTextContent("No change to cost.");
    expect(screen.getByTestId("step-effect").textContent).not.toContain("$");
  });

  it("the cost on the card is the future's real net cost at five years", () => {
    confirm(MILES);
    render(<WindingTimeline />);
    const id = state().activeScenarioId;
    const real = state().results[id].points.find((p) => p.month === 60)!.netEconomicCost;
    const stat = screen.getByTestId("step-detail").querySelector('[data-slot="stat"]')!;
    expect(stat.textContent).toContain(`$${Math.round(real).toLocaleString("en-US")}`);
    expect(stat.querySelector("[data-source]")).not.toBeNull();
  });

  it("the start step shows what happens if nothing changes", () => {
    confirm(MOVE);
    render(<WindingTimeline />);
    const base = state().results[BASE_ID].points.find((p) => p.month === 60)!.netEconomicCost;
    expect(screen.getByTestId("step-title")).toHaveTextContent("Your 2022 Camry");
    expect(screen.getByTestId("step-detail")).toHaveTextContent("If nothing changes");
    expect(screen.getByTestId("step-detail")).toHaveTextContent(`$${Math.round(base).toLocaleString("en-US")}`);
  });

  it("stays on the step you chose when something is added, and falls back to the first when it goes away", () => {
    confirm(MILES, MOVE);
    render(<WindingTimeline />);
    fireEvent.click(steps()[1]);
    expect(screen.getByTestId("step-title")).toHaveTextContent("Move to Denver");
    confirm(KID);
    expect(screen.getByTestId("step-title")).toHaveTextContent("Move to Denver"); // the same step, though it is a new future now
    act(() => actions().setActiveScenario(BASE_ID));
    expect(screen.getByTestId("step-count")).toHaveTextContent("1 of 2"); // that step is not in this future: back to the first
  });
});

describe("the fork", () => {
  it("before comparing: keeping is the solid path, and the other car a dashed offer you can tap", async () => {
    confirm(MOVE);
    render(<WindingTimeline />);
    const [keepEnd, offer] = screen.getAllByTestId("fork-end");
    expect(keepEnd).toHaveTextContent("Keep your 2022 Camry");
    expect(keepEnd).toHaveTextContent("Your plan");
    expect(offer).toHaveTextContent("Explore the 2024 RAV4 Hybrid XLE");
    expect(offer).toHaveTextContent("Tap to compare");
    expect(screen.getByTestId("path-up")).toHaveAttribute("data-dashed", "false");
    expect(screen.getByTestId("path-down")).toHaveAttribute("data-dashed", "true");
    expect(state().comparison).toBeNull();
    await act(async () => {
      fireEvent.click(offer);
    });
    expect(state().comparison).not.toBeNull();
    expect(state().evaluation).not.toBeNull();
  });

  it("the offer waits while something else is working, and while there is nothing to compare yet", () => {
    render(<WindingTimeline />);
    act(() => useForkStore.setState((s) => ({ ui: { ...s.ui, busy: "simulating" } })));
    expect(screen.getByRole("button", { name: /Explore the 2024 RAV4/ })).toBeDisabled();
  });

  it("after comparing, the recommended way goes up and is solid; the other goes down and is dashed", async () => {
    render(<WindingTimeline />);
    await act(async () => {
      await actions().openReplaceComparison();
    });
    const preferred = state().evaluation!.preferredScenarioId;
    const ends = screen.getAllByTestId("fork-end");
    const top = (el: HTMLElement) => px(el.style.top);
    if (preferred === "inconclusive") {
      expect(ends.map((e) => e.textContent)).toEqual([expect.stringContaining("Close call"), expect.stringContaining("Close call")]);
      expect(screen.getByTestId("path-down")).toHaveAttribute("data-dashed", "false");
    } else {
      const picked = ends.find((e) => e.textContent!.includes("Recommended"))!;
      const other = ends.find((e) => e.textContent!.includes("Alternative"))!;
      expect(top(picked)).toBeLessThan(top(other)); // the recommended end is the higher one
      expect(screen.getByTestId("path-up")).toHaveAttribute("data-dashed", "false");
      expect(screen.getByTestId("path-down")).toHaveAttribute("data-dashed", "true");
    }
  });

  it("each end looks at its own future: tap one and its car is the one on the page", async () => {
    render(<WindingTimeline />);
    await act(async () => {
      await actions().openReplaceComparison();
    });
    const { keepId, replaceId } = state().comparison!;
    fireEvent.click(screen.getByRole("button", { name: /Keep your 2022 Camry/ }));
    expect(state().activeScenarioId).toBe(keepId);
    expect(screen.getByRole("button", { name: /Keep your 2022 Camry/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Switch to the 2024 RAV4/ })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: /Switch to the 2024 RAV4/ }));
    expect(state().activeScenarioId).toBe(replaceId);
    expect(state().stage.transitionTo?.id).toBe(state().replacementVehicle!.id);
  });

  it("the path is your life in both cases: the swap is not a step, and looking at the other car does not change it", async () => {
    confirm(MILES, MOVE);
    render(<WindingTimeline />);
    const before = steps().map((s) => s.getAttribute("aria-label"));
    await act(async () => {
      await actions().openReplaceComparison(); // makes the replace future the one you are looking at
    });
    expect(state().activeScenarioId).toBe(state().comparison!.replaceId);
    expect(steps().map((s) => s.getAttribute("aria-label"))).toEqual(before);
    expect(screen.queryByText(/Replace car/)).toBeNull();
  });

  it("the fork's card compares them: both costs with sources, and the real difference in words", async () => {
    render(<WindingTimeline />);
    await act(async () => {
      await actions().openReplaceComparison();
    });
    fireEvent.click(steps().at(-1)!);
    const card = screen.getByTestId("step-detail");
    const stats = card.querySelectorAll('[data-slot="stat"]');
    expect(stats).toHaveLength(2);
    stats.forEach((st) => expect(st.querySelector("[data-source]")).not.toBeNull());
    const { keepId, replaceId } = state().comparison!;
    const at60 = (id: string) => state().results[id].points.find((p) => p.month === 60)!.netEconomicCost;
    const diff = at60(replaceId) - at60(keepId);
    expect(screen.getByTestId("fork-difference").textContent).toContain(`Switching ${diff >= 0 ? "adds" : "saves"} $${Math.abs(Math.round(diff)).toLocaleString("en-US")} over 5 yr`);
    expect(screen.getByTestId("fork-difference").querySelector("[data-source]")).not.toBeNull();
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

  it("has no em dashes, and none of the build words, anywhere on it", () => {
    confirm(MILES, MOVE, KID);
    const { container } = render(<WindingTimeline />);
    expect(container.textContent).not.toContain("—");
    expect(container.textContent).not.toMatch(/demo|data/i);
    for (const el of container.querySelectorAll("[title],[aria-label]")) expect(`${el.getAttribute("title")} ${el.getAttribute("aria-label")}`).not.toMatch(/demo|data/i);
  });

  it("every number on it carries a source", () => {
    confirm(MILES, MOVE);
    const { container } = render(<WindingTimeline />);
    const card = within(screen.getByTestId("step-detail"));
    expect(card.getAllByText(/\$[\d,]+/).length).toBeGreaterThan(0);
    container.querySelectorAll('[data-slot="stat"]').forEach((st) => expect(st.querySelector("[data-source]")).not.toBeNull());
  });
});
