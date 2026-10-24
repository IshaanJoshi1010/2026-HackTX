import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LifeEvent } from "@/contracts";
import { ai } from "@/ui/mocks";
import { BASE_ID, resetForkStoreForTests, useForkStore } from "@/ui/store/useForkStore";
import { FutureTimeline } from "./FutureTimeline";

const state = () => useForkStore.getState();
const actions = () => useForkStore.getState().actions;

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

async function enterWorkspace() {
  await actions().startFromSample("camry-2022-se");
  actions().onRevealStage("done");
}

/** Baseline plus a confirmed Denver branch. */
async function withBranch() {
  await enterWorkspace();
  vi.spyOn(ai, "interpret").mockResolvedValue({ aiAvailable: true, intent: "CREATE_SCENARIO", proposals: [denver], profilePatches: [] });
  await actions().submitDump("moving to Denver");
  actions().confirmDrafts(["e-denver"]);
}

/** Baseline, Denver branch, and a replace branch off Denver. */
async function withReplace() {
  await withBranch();
  await actions().openReplaceComparison();
  actions().onTransitionComplete();
}

const markers = () => screen.queryAllByTestId("event-marker");
const paths = () => screen.queryAllByTestId("lane-path");

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  resetForkStoreForTests();
  useForkStore.setState({ hydrated: true });
});

afterEach(() => cleanup());

describe("baseline only", () => {
  it("stays a quiet hairline: one lane, no labels, no header, no values", async () => {
    await enterWorkspace();
    render(<FutureTimeline />);
    expect(paths()).toHaveLength(1);
    expect(screen.queryByText("Timeline")).toBeNull();
    expect(screen.queryByRole("button", { name: /Keep the Camry/ })).toBeNull();
    expect(document.querySelectorAll('[data-slot="lane-value"]')).toHaveLength(0);
    expect(screen.getByRole("slider", { name: "Month" })).toBeInTheDocument();
  });

  it("renders nothing before a baseline exists", () => {
    const { container } = render(<FutureTimeline />);
    expect(container).toBeEmptyDOMElement();
  });

  it("scrubbing writes the active month", async () => {
    await enterWorkspace();
    render(<FutureTimeline />);
    fireEvent.change(screen.getByRole("slider", { name: "Month" }), { target: { value: "30" } });
    expect(state().activeMonth).toBe(30);
    expect(screen.getByRole("slider", { name: "Month" })).toHaveAttribute("aria-valuetext", "2 yr 6 mo");
  });

  it("shows milestones from the projection as ticks", async () => {
    await enterWorkspace();
    render(<FutureTimeline />);
    const ticks = screen.getAllByTestId("milestone");
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks[0]).toHaveAttribute("aria-label", expect.stringMatching(/^Month \d+: /));
  });
});

describe("lanes", () => {
  it("draws one lane per scenario, each a real scenario, with the active one marked", async () => {
    await withBranch();
    render(<FutureTimeline />);
    const ids = state().explore.scenarios.map((s) => s.id);
    expect(paths().map((p) => p.getAttribute("data-lane-id")).sort()).toEqual([...ids].sort());
    expect(paths().filter((p) => p.getAttribute("data-active") === "true")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Keep the Camry" })).not.toHaveAttribute("aria-current");
    // exact name: the event marker is also called "Move to Denver, month 12..."
    expect(screen.getByRole("button", { name: "Move to Denver" })).toHaveAttribute("aria-current", "true");
  });

  it("keeps four lanes readable and separate", async () => {
    await withReplace();
    // a fourth future: fork again from the current one
    vi.spyOn(ai, "interpret").mockResolvedValue({
      aiAvailable: true,
      intent: "CREATE_SCENARIO",
      proposals: [{ ...denver, id: "e-kid", type: "family_change", month: 30, payload: {}, quote: "second child" }],
      profilePatches: [],
    });
    await actions().submitDump("second child");
    actions().confirmDrafts(["e-kid"]);
    render(<FutureTimeline />);
    expect(state().explore.scenarios).toHaveLength(4);
    expect(paths()).toHaveLength(4);
    expect(screen.getAllByRole("button", { name: /Keep|Move|Replace|Family/ }).length).toBeGreaterThanOrEqual(4);
  });

  it("clicking a lane label switches the future and the numbers follow", async () => {
    await withBranch();
    render(<FutureTimeline />);
    fireEvent.click(screen.getByRole("button", { name: "Keep the Camry" }));
    expect(state().activeScenarioId).toBe(BASE_ID);
    expect(screen.getByRole("button", { name: "Keep the Camry" })).toHaveAttribute("aria-current", "true");
  });

  it("each lane shows its net cost at the playhead, with a source", async () => {
    await withBranch();
    actions().setActiveMonth(36);
    render(<FutureTimeline />);
    const values = document.querySelectorAll('[data-slot="lane-value"]');
    expect(values).toHaveLength(2);
    values.forEach((v) => {
      expect(v.textContent).toMatch(/\$[\d.,]+k?/);
      expect(v.querySelector("[data-source]")).not.toBeNull();
    });
  });

  it("shows no value at a month with no projection instead of inventing one", async () => {
    await withBranch();
    const id = state().activeScenarioId;
    useForkStore.setState((s) => ({
      results: { ...s.results, [id]: { ...s.results[id], points: s.results[id].points.filter((p) => p.month !== 0) } },
      activeMonth: 0,
    }));
    render(<FutureTimeline />);
    const values = [...document.querySelectorAll('[data-slot="lane-value"]')];
    expect(values.some((v) => v.textContent === "")).toBe(true);
  });

  it("focus mode shows only the active future, and the toggle is a real store control", async () => {
    await withBranch();
    render(<FutureTimeline />);
    const toggle = screen.getByRole("button", { name: "Focus on this future" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    expect(state().ui.timelineExpanded).toBe(false);
    expect(paths()).toHaveLength(1);
    expect(paths()[0].getAttribute("data-lane-id")).toBe(state().activeScenarioId);
    fireEvent.click(screen.getByRole("button", { name: "Show all futures" }));
    expect(paths()).toHaveLength(2);
  });
});

describe("event markers", () => {
  it("never shows a proposal that has not been confirmed", async () => {
    await enterWorkspace();
    vi.spyOn(ai, "interpret").mockResolvedValue({ aiAvailable: true, intent: "CREATE_SCENARIO", proposals: [denver], profilePatches: [] });
    await actions().submitDump("moving to Denver");
    expect(state().explore.draftChanges).toHaveLength(1);
    render(<FutureTimeline />);
    expect(markers()).toHaveLength(0);
  });

  it("shows a confirmed event on the lane that owns it", async () => {
    await withBranch();
    render(<FutureTimeline />);
    expect(markers()).toHaveLength(1);
    expect(markers()[0]).toHaveAttribute("data-event-id", "e-denver");
    expect(markers()[0]).toHaveAccessibleName(/Move to Denver, month 12/);
  });

  it("draws an inherited event once, not again on every child lane", async () => {
    await withReplace();
    render(<FutureTimeline />);
    const ids = markers().map((m) => m.getAttribute("data-event-id"));
    expect(ids.filter((id) => id === "e-denver")).toHaveLength(1);
    expect(ids.some((id) => id?.startsWith("replace-"))).toBe(true);
    expect(ids).toHaveLength(2);
  });

  it("explains an event on hover with its title, month and your own words", async () => {
    await withBranch();
    render(<FutureTimeline />);
    const tip = within(markers()[0].parentElement!).getByRole("tooltip");
    expect(tip).toHaveTextContent("Move to Denver");
    expect(tip).toHaveTextContent("1 yr");
    expect(tip).toHaveTextContent("moving to Denver next year");
  });

  it("arrow keys move an event, shift moves six months, and the future is re-simulated", async () => {
    await withBranch();
    render(<FutureTimeline />);
    const id = state().activeScenarioId;
    const before = state().results[id];

    fireEvent.keyDown(markers()[0], { key: "ArrowRight" });
    expect(state().explore.scenarios.find((s) => s.id === id)!.events.find((e) => e.id === "e-denver")!.month).toBe(13);
    fireEvent.keyDown(markers()[0], { key: "ArrowLeft", shiftKey: true });
    expect(state().explore.scenarios.find((s) => s.id === id)!.events.find((e) => e.id === "e-denver")!.month).toBe(7);
    expect(state().results[id]).not.toBe(before);
  });

  it("will not move an event past the ends of the 60 month axis", async () => {
    await withBranch();
    render(<FutureTimeline />);
    const id = state().activeScenarioId;
    for (let i = 0; i < 20; i++) fireEvent.keyDown(markers()[0], { key: "ArrowLeft", shiftKey: true });
    expect(state().explore.scenarios.find((s) => s.id === id)!.events.find((e) => e.id === "e-denver")!.month).toBe(0);
  });

  it("dragging an event moves it once, on release", async () => {
    await withBranch();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, right: 600, bottom: 40, width: 600, height: 40, x: 0, y: 0, toJSON: () => ({}),
    });
    const moveSpy = vi.spyOn(state().actions, "moveEvent");
    render(<FutureTimeline />);
    const marker = markers()[0];

    fireEvent.pointerDown(marker, { clientX: 120, pointerId: 1 });
    fireEvent.pointerMove(marker, { clientX: 300, pointerId: 1 }); // x 300 of 600 = month 30
    expect(moveSpy).not.toHaveBeenCalled();
    fireEvent.pointerUp(marker, { clientX: 300, pointerId: 1 });
    fireEvent.click(marker); // the click that follows a drag is ignored

    expect(moveSpy).toHaveBeenCalledTimes(1);
    expect(moveSpy).toHaveBeenCalledWith(state().activeScenarioId, "e-denver", 30);
    expect(state().activeMonth).toBe(0); // a drag does not also jump the playhead
  });

  it("clicking an event jumps the playhead to it and selects its future", async () => {
    await withReplace();
    actions().setActiveScenario(BASE_ID);
    actions().onTransitionComplete();
    render(<FutureTimeline />);
    const denverMarker = markers().find((m) => m.getAttribute("data-event-id") === "e-denver")!;
    fireEvent.pointerDown(denverMarker, { clientX: 100, pointerId: 1 });
    fireEvent.pointerUp(denverMarker, { clientX: 101, pointerId: 1 });
    fireEvent.click(denverMarker);
    expect(state().activeMonth).toBe(12);
    expect(state().activeScenarioId).not.toBe(BASE_ID);
  });

  it("locks an inherited event in focus mode so it cannot be moved on the wrong future", async () => {
    await withReplace();
    actions().setTimelineExpanded(false); // focus on the replace future, which inherited the Denver move
    render(<FutureTimeline />);
    const inherited = markers().find((m) => m.getAttribute("data-event-id") === "e-denver")!;
    expect(inherited).toHaveAccessibleName(/Inherited/);

    const scenarioBefore = state().explore.scenarios;
    fireEvent.keyDown(inherited, { key: "ArrowRight" });
    expect(state().explore.scenarios).toBe(scenarioBefore);
    expect(within(inherited.parentElement!).getByRole("tooltip")).toHaveTextContent("Move it there");
  });
});

describe("a11y and sources", () => {
  it("every control has an accessible name", async () => {
    await withReplace();
    render(<FutureTimeline />);
    screen.getAllByRole("button").forEach((b) => expect(b).toHaveAccessibleName());
    expect(screen.getByRole("slider", { name: "Month" })).toBeInTheDocument();
  });

  it("the scrubber stays disabled outside the workspace", async () => {
    await enterWorkspace();
    render(<FutureTimeline />);
    act(() => actions().replayReveal());
    expect(screen.getByRole("slider", { name: "Month" })).toBeDisabled();
  });
});
