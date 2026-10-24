import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LifeEvent } from "@/contracts";
import { BASE_ID, resetForkStoreForTests, useForkStore } from "@/ui/store/useForkStore";
import { Road } from "./Road";

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

const MOVE = draft("relocation", 12, { location: "Denver" }, "moving to Denver next year");
const MILES = draft("mileage_change", 12, { annualMiles: 24000 }, "24,000 miles a year");
const KID = draft("family_change", 36, { childrenDelta: 1 }, "second child");

async function enterWorkspace() {
  await actions().startFromSample("camry-2022-se");
  actions().onRevealStage("done");
}

/** Confirms the given decisions as one new future, branching from whatever is active. */
function branch(...drafts: Draft[]) {
  act(() => {
    const ids = drafts.map((d) => {
      actions().addDraft(d);
      const all = state().explore.draftChanges;
      return all[all.length - 1].id;
    });
    actions().confirmDrafts(ids);
  });
}

const roadD = () => screen.getByTestId("road-active").getAttribute("d")!;
const ys = (d: string) => [...d.matchAll(/[ML] [\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
const baselineY = () => Number(screen.getByTestId("road-baseline").getAttribute("y1"));
const markers = () => screen.queryAllByTestId("event-marker");

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  resetForkStoreForTests();
  useForkStore.setState({ hydrated: true });
});

afterEach(() => cleanup());

describe("a road with nothing on it", () => {
  it("is straight, says why, and shows no effect", async () => {
    await enterWorkspace();
    actions().setView("future");
    render(<Road />);
    expect(new Set(ys(roadD())).size).toBe(1); // every point on one line
    expect(screen.getByTestId("road-empty")).toHaveTextContent("nothing has changed yet");
    expect(screen.queryByTestId("road-baseline")).toBeNull(); // the road IS the baseline
    expect(screen.queryByTestId("road-effect")).toBeNull();
    expect(screen.queryByText("Saves money")).toBeNull();
    expect(markers()).toHaveLength(0);
  });

  it("renders nothing before there is a baseline", () => {
    const { container } = render(<Road />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("how decisions bend the road", () => {
  it("a decision that costs money bends the road down, below the 'if nothing changes' line", async () => {
    await enterWorkspace();
    branch(MOVE, MILES);
    render(<Road />);
    const flat = baselineY();
    const path = ys(roadD());
    expect(path[0]).toBeCloseTo(flat, 1); // every road starts from the same place
    expect(path.at(-1)!).toBeGreaterThan(flat + 5); // and ends lower: it costs more
    expect(screen.getByText("Costs more")).toBeInTheDocument();
  });

  it("is straight until the decision happens, then bends", async () => {
    await enterWorkspace();
    branch(MILES); // month 12
    render(<Road />);
    const flat = baselineY();
    const path = ys(roadD());
    // months 0 to 11 are on the line; later months are not
    expect(path.slice(0, 12).every((y) => Math.abs(y - flat) < 0.01)).toBe(true);
    expect(path.at(-1)!).toBeGreaterThan(flat + 5);
  });

  it("a decision that changes no cost leaves the road straight", async () => {
    await enterWorkspace();
    branch(MOVE); // relocation and a new child do not change cost in the stand-in sim
    render(<Road />);
    expect(Math.abs(ys(roadD()).at(-1)! - baselineY())).toBeLessThan(0.01);
    expect(screen.getByTestId("road-effect")).toHaveTextContent("$0");
    expect(screen.getByTestId("road-effect")).toHaveTextContent("same as if nothing changed");
  });

  it("says the effect at the playhead in dollars, with a source", async () => {
    await enterWorkspace();
    branch(MOVE, MILES);
    actions().setActiveMonth(60);
    render(<Road />);
    const pill = screen.getByTestId("road-effect");
    expect(pill.textContent).toMatch(/^\+\$[\d,]+/);
    expect(pill).toHaveTextContent("vs. if nothing changes");
    expect(pill.querySelector("[data-source]")).not.toBeNull();
  });

  it("the effect follows the playhead: smaller earlier, zero before the decision", async () => {
    await enterWorkspace();
    branch(MILES);
    render(<Road />);
    const amount = () => Number(screen.getByTestId("road-effect").textContent!.match(/\+\$([\d,]+)/)?.[1]?.replace(/,/g, "") ?? "0");
    act(() => actions().setActiveMonth(60));
    const late = amount();
    act(() => actions().setActiveMonth(24));
    const early = amount();
    expect(late).toBeGreaterThan(early);
    expect(early).toBeGreaterThan(0);
    act(() => actions().setActiveMonth(6));
    expect(screen.getByTestId("road-effect")).toHaveTextContent("$0");
  });

  it("scrubbing with the slider writes the month and moves the label", async () => {
    await enterWorkspace();
    branch(MILES);
    render(<Road />);
    fireEvent.change(screen.getByRole("slider", { name: "Month" }), { target: { value: "30" } });
    expect(state().activeMonth).toBe(30);
    expect(screen.getByRole("slider", { name: "Month" })).toHaveAttribute("aria-valuetext", "2 yr 6 mo");
    expect(screen.getAllByText("2 yr 6 mo").length).toBeGreaterThan(0);
  });

  it("gives screen readers the same sentence the picture says", async () => {
    await enterWorkspace();
    branch(MILES);
    actions().setActiveMonth(60);
    const { container } = render(<Road />);
    expect(container.querySelector(".sr-only")?.textContent).toMatch(/^Your road at 5 yr costs \+\$[\d,]+ compared with if nothing changes\.$/);
  });
});

describe("signposts", () => {
  it("every decision in the future is a signpost, named, with when it happens", async () => {
    await enterWorkspace();
    branch(MOVE, MILES, KID);
    render(<Road />);
    expect(markers()).toHaveLength(3);
    const labels = screen.getAllByTestId("decision-label").map((l) => l.textContent);
    expect(labels).toEqual(expect.arrayContaining(["Move to Denverin 1 yr", "24,000 miles a yearin 1 yr", "New childin 3 yr"]));
  });

  it("never draws a proposal", async () => {
    await enterWorkspace();
    act(() => actions().addDraft(MOVE));
    render(<Road />);
    expect(markers()).toHaveLength(0);
  });

  it("two decisions in the same month sit side by side and their labels do not share a spot", async () => {
    await enterWorkspace();
    branch(MOVE, MILES); // both month 12
    render(<Road />);
    const lefts = markers().map((m) => parseFloat((m.parentElement as HTMLElement).style.left));
    expect(new Set(lefts).size).toBe(2);
    expect(Math.abs(lefts[0] - lefts[1])).toBeGreaterThanOrEqual(40);
    const tops = screen.getAllByTestId("decision-label").map((l) => l.style.top);
    expect(new Set(tops).size).toBe(2); // one above the road, one below
  });

  it("a signpost sits on the road, at the height the road is at that month", async () => {
    await enterWorkspace();
    branch(MILES, KID);
    render(<Road />);
    const kid = markers().find((m) => m.getAttribute("data-event-id") === state().explore.scenarios[1].events.find((e) => e.type === "family_change")!.id)!;
    const top = parseFloat((kid.parentElement as HTMLElement).style.top);
    const path = ys(roadD());
    expect(top).toBeCloseTo(path[36], 0); // month 36
  });

  it("hovering a signpost shows the decision, when, and your own words", async () => {
    await enterWorkspace();
    branch(MOVE);
    render(<Road />);
    const tip = within(markers()[0].parentElement!).getByRole("tooltip");
    expect(tip).toHaveTextContent("Move to Denver");
    expect(tip).toHaveTextContent("1 yr");
    expect(tip).toHaveTextContent("moving to Denver next year");
  });

  it("clicking a signpost puts the playhead on its month", async () => {
    await enterWorkspace();
    branch(KID);
    render(<Road />);
    fireEvent.pointerDown(markers()[0], { clientX: 100, pointerId: 1 });
    fireEvent.pointerUp(markers()[0], { clientX: 101, pointerId: 1 });
    fireEvent.click(markers()[0]);
    expect(state().activeMonth).toBe(36);
  });

  it("arrow keys move a decision, shift moves six months, and the road reshapes", async () => {
    await enterWorkspace();
    branch(MILES);
    render(<Road />);
    const id = markers()[0].getAttribute("data-event-id")!;
    const monthOf = () => state().explore.scenarios.find((s) => s.id === state().activeScenarioId)!.events.find((e) => e.id === id)!.month;
    const before = roadD();

    fireEvent.keyDown(markers()[0], { key: "ArrowRight" });
    expect(monthOf()).toBe(13);
    fireEvent.keyDown(markers()[0], { key: "ArrowLeft", shiftKey: true });
    expect(monthOf()).toBe(7);
    expect(roadD()).not.toBe(before); // earlier means more months of extra cost
  });

  it("will not move a decision off the ends of the 60 month road", async () => {
    await enterWorkspace();
    branch(MILES);
    render(<Road />);
    const id = markers()[0].getAttribute("data-event-id")!;
    for (let i = 0; i < 20; i++) fireEvent.keyDown(markers()[0], { key: "ArrowLeft", shiftKey: true });
    expect(state().explore.scenarios.find((s) => s.id === state().activeScenarioId)!.events.find((e) => e.id === id)!.month).toBe(0);
  });

  it("dragging a signpost moves it once, on release, and does not also move the playhead", async () => {
    await enterWorkspace();
    branch(MILES);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, right: 960, bottom: 360, width: 960, height: 360, x: 0, y: 0, toJSON: () => ({}),
    });
    const moveSpy = vi.spyOn(state().actions, "moveEvent");
    render(<Road />);
    const marker = markers()[0];
    const id = marker.getAttribute("data-event-id")!;

    fireEvent.pointerDown(marker, { clientX: 192, pointerId: 1 });
    fireEvent.pointerMove(marker, { clientX: 480, pointerId: 1 }); // 480 of 960 = month 30
    expect(moveSpy).not.toHaveBeenCalled();
    fireEvent.pointerUp(marker, { clientX: 480, pointerId: 1 });
    fireEvent.click(marker); // the click after a drag is ignored

    expect(moveSpy).toHaveBeenCalledTimes(1);
    expect(moveSpy).toHaveBeenCalledWith(state().activeScenarioId, id, 30);
    expect(state().activeMonth).toBe(0);
  });

  it("decisions inherited from an earlier future are read-only, and the future that owns them can still move them", async () => {
    await enterWorkspace();
    branch(MILES); // Denver future, owns the mileage decision
    const denverId = state().activeScenarioId;
    branch(KID); // a child future inherits it
    render(<Road />);

    const inherited = markers().find((m) => m.getAttribute("data-locked") === "true")!;
    expect(inherited).toBeDefined();
    expect(inherited).toHaveAccessibleName(/From an earlier future/);
    const before = state().explore.scenarios;
    fireEvent.keyDown(inherited, { key: "ArrowRight" });
    expect(state().explore.scenarios).toBe(before);
    expect(within(inherited.parentElement!).getByRole("tooltip")).toHaveTextContent("Move it there");

    const own = markers().find((m) => m.getAttribute("data-locked") === "false")!;
    fireEvent.keyDown(own, { key: "ArrowRight" });
    expect(state().explore.scenarios).not.toBe(before);

    act(() => actions().setActiveScenario(denverId)); // on its own future it is the owner
    expect(markers().every((m) => m.getAttribute("data-locked") === "false")).toBe(true);
  });

  it("shows milestones from the projection as small marks on the road", async () => {
    await enterWorkspace();
    branch(MILES);
    render(<Road />);
    const marks = screen.getAllByTestId("milestone");
    expect(marks.length).toBeGreaterThan(0);
    expect(marks[0]).toHaveAttribute("aria-label", expect.stringMatching(/^Month \d+: /));
  });
});

describe("other futures, only when asked", () => {
  it("are hidden by default: one road, no names, no other roads", async () => {
    await enterWorkspace();
    branch(MILES);
    branch(KID);
    render(<Road />);
    expect(screen.queryAllByTestId("road-future")).toHaveLength(0);
    expect(screen.queryAllByTestId("road-other")).toHaveLength(0);
    expect(screen.getAllByTestId("road-active")).toHaveLength(1);
    expect(screen.getByText("If nothing changes")).toBeInTheDocument();
  });

  it("appear on the same road with their names and where they end up, once you ask", async () => {
    await enterWorkspace();
    branch(MILES);
    branch(KID);
    act(() => actions().setFutureCompare(true));
    render(<Road />);
    const names = screen.getAllByTestId("road-future");
    expect(names).toHaveLength(state().explore.scenarios.length);
    expect(screen.getAllByTestId("road-other")).toHaveLength(state().explore.scenarios.length - 2); // not the active road, not the baseline
    expect(names.filter((n) => n.getAttribute("aria-current") === "true")).toHaveLength(1);
    expect(screen.getByText("if nothing changes")).toBeInTheDocument();
    expect(names[1].textContent).toMatch(/by 5 yr/);
  });

  it("their names never overlap, even when the roads end close together", async () => {
    await enterWorkspace();
    branch(MOVE); // no cost change: ends on the same line as the baseline
    branch(KID); // same again
    act(() => actions().setFutureCompare(true));
    render(<Road />);
    const tops = screen.getAllByTestId("road-future").map((n) => parseFloat(n.style.top)).sort((a, b) => a - b);
    for (let i = 1; i < tops.length; i++) expect(tops[i] - tops[i - 1]).toBeGreaterThanOrEqual(50);
  });

  it("clicking a name switches the road you are looking at", async () => {
    await enterWorkspace();
    branch(MILES);
    act(() => actions().setFutureCompare(true));
    render(<Road />);
    fireEvent.click(screen.getByRole("button", { name: /Keep the Camry/ }));
    expect(state().activeScenarioId).toBe(BASE_ID);
    expect(screen.getByRole("button", { name: /Keep the Camry/ })).toHaveAttribute("aria-current", "true");
    // on the baseline the road itself is the straight line, and the other futures bend away from it
    expect(screen.queryByTestId("road-baseline")).toBeNull();
    expect(screen.getAllByTestId("road-other").length).toBeGreaterThan(0);
  });

  it("with one future there is nothing to compare, so no names appear even if asked", async () => {
    await enterWorkspace();
    act(() => actions().setFutureCompare(true));
    render(<Road />);
    expect(screen.queryAllByTestId("road-future")).toHaveLength(0);
  });
});

describe("the slider", () => {
  it("is off outside the workspace", async () => {
    await enterWorkspace();
    render(<Road />);
    act(() => actions().replayReveal());
    expect(screen.getByRole("slider", { name: "Month" })).toBeDisabled();
  });

  it("every control has an accessible name", async () => {
    await enterWorkspace();
    branch(MILES, KID);
    act(() => actions().setFutureCompare(true));
    render(<Road />);
    screen.getAllByRole("button").forEach((b) => expect(b).toHaveAccessibleName());
  });
});
