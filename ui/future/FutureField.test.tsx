import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LifeEvent } from "@/contracts";
import { resetForkStoreForTests, useForkStore } from "@/ui/store/useForkStore";
import { FutureField } from "./FutureField";

const state = () => useForkStore.getState();
const actions = () => useForkStore.getState().actions;

type Draft = Omit<LifeEvent, "id" | "status">;
const draft = (type: LifeEvent["type"], month: number, payload: LifeEvent["payload"]): Draft => ({ type, month, payload, source: "user", assumptions: [], certainty: "clear" });
const MOVE = draft("relocation", 12, { location: "Denver" });
const MILES = draft("mileage_change", 0, { annualMiles: 30000 });
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

/** A canvas that counts what it draws, and a frame clock the test turns by hand. */
function stage() {
  const arcs: Array<{ x: number; y: number }> = [];
  let current: { x: number; y: number } | null = null;
  const ctx = {
    fillStyle: "", strokeStyle: "", lineWidth: 1,
    setTransform: vi.fn(), clearRect: vi.fn(),
    beginPath: () => { current = null; },
    arc: (x: number, y: number) => { current = { x, y }; },
    fill: () => { if (current) arcs.push(current); },
    stroke: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  return { arcs, ctx, frames, tick: (t: number) => act(() => { const cb = frames.shift(); cb?.(t); }) };
}

beforeEach(async () => {
  vi.restoreAllMocks();
  localStorage.clear();
  resetForkStoreForTests();
  useForkStore.setState({ hydrated: true });
  await actions().startFromSample("camry-2022-se");
  actions().onRevealStage("done");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const tags = () => screen.queryAllByTestId("field-tag");

describe("what is on the field", () => {
  it("starts as one stream, if nothing changes, with the other car offered as a choice", () => {
    stage();
    render(<FutureField />);
    expect(tags().map((t) => t.textContent)).toEqual([expect.stringContaining("If nothing changes")]);
    expect(screen.getByRole("button", { name: /If nothing changes/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("field-offer")).toHaveTextContent("Switch to a 2024 RAV4 Hybrid XLE?");
    expect(screen.getByTestId("field-offer")).toHaveTextContent("Tap to see how it compares");
    expect(screen.queryAllByTestId("field-decision")).toHaveLength(0);
  });

  it("splits where you told Fork something, names the future, and puts each change on it", () => {
    stage();
    confirm(MILES, MOVE, KID);
    render(<FutureField />);
    expect(tags()).toHaveLength(2);
    expect(within(screen.getByRole("button", { name: /30,000 miles a year \+ 2 more/ })).getByText(/costs more than if nothing changed/)).toBeInTheDocument();
    const pills = screen.getAllByTestId("field-decision").map((p) => p.textContent);
    expect(pills).toEqual(expect.arrayContaining([expect.stringContaining("30,000 miles a year"), expect.stringContaining("Move to Denver"), expect.stringContaining("Second child")]));
    expect(pills).toHaveLength(3);
  });

  it("says nothing in numbers: no dollars anywhere on it", () => {
    stage();
    confirm(MILES, MOVE);
    render(<FutureField />);
    expect(screen.getByTestId("future-field").textContent).not.toMatch(/\$/);
  });

  it("a change that costs nothing is the same cost as if nothing changed, in words", () => {
    stage();
    confirm(MOVE);
    render(<FutureField />);
    expect(within(screen.getByRole("button", { name: /Move to Denver/ })).getByText(/costs the same as if nothing changed/)).toBeInTheDocument();
  });

  it("has a plain sentence for a screen reader, since the particles are only a picture", () => {
    stage();
    confirm(MILES);
    render(<FutureField />);
    expect(screen.getByTestId("future-canvas")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByTestId("future-field").querySelector(".sr-only")).toHaveTextContent(/If nothing changes\..*costs more than if nothing changed/);
  });

  it("has no em dashes", () => {
    stage();
    confirm(MILES, MOVE);
    render(<FutureField />);
    expect(screen.getByTestId("future-field").textContent).not.toContain("—");
  });
});

describe("what the buttons do", () => {
  it("every future stays on the field, so tapping one never hides the others", () => {
    stage();
    confirm(MILES);
    render(<FutureField />);
    fireEvent.click(screen.getByRole("button", { name: /If nothing changes/ }));
    expect(tags()).toHaveLength(2);
    fireEvent.click(tags()[1]);
    expect(tags()).toHaveLength(2);
  });

  it("tapping a name looks at that future", () => {
    stage();
    confirm(MILES);
    render(<FutureField />);
    const branch = state().activeScenarioId;
    fireEvent.click(screen.getByRole("button", { name: /If nothing changes/ }));
    expect(state().activeScenarioId).toBe("base");
    expect(screen.getByRole("button", { name: /If nothing changes/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(tags()[1]);
    expect(state().activeScenarioId).toBe(branch);
  });

  it("the offer really compares, and is gone once it has", async () => {
    stage();
    render(<FutureField />);
    expect(state().comparison).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByTestId("field-offer"));
    });
    expect(state().comparison).not.toBeNull();
    expect(state().evaluation).not.toBeNull();
    expect(screen.queryByTestId("field-offer")).toBeNull();
    expect(tags().map((t) => t.textContent)).toEqual([expect.stringContaining("Keep your Camry"), expect.stringContaining("Switch to the RAV4")]);
  });

  it("after comparing, each future says what it costs against the other, and the engine's pick is marked once, or not at all", async () => {
    stage();
    await act(async () => {
      await actions().openReplaceComparison();
    });
    render(<FutureField />);
    const [keep, replace] = tags();
    expect(keep.textContent).toMatch(/costs (more|less) than switching|costs the same as switching/);
    expect(replace.textContent).toMatch(/costs (more|less) than keeping|costs the same as keeping/);
    const preferred = state().evaluation!.preferredScenarioId;
    const picks = screen.queryAllByText("Fork's pick");
    expect(picks).toHaveLength(preferred === "inconclusive" ? 0 : 1); // a close call is not dressed up as a pick
  });

  it("while it is busy, the offer waits", () => {
    stage();
    useForkStore.setState((s) => ({ ui: { ...s.ui, busy: "simulating" } }));
    render(<FutureField />);
    expect(screen.getByTestId("field-offer")).toBeDisabled();
  });
});

describe("what is drawn", () => {
  it("particles on the canvas, moving, inside it", () => {
    const s = stage();
    confirm(MILES);
    render(<FutureField />);
    expect(s.ctx.setTransform).toHaveBeenCalled();
    s.tick(1000);
    const first = s.arcs.length;
    expect(first).toBeGreaterThan(150);
    s.tick(1500);
    expect(s.arcs.length).toBeGreaterThan(first); // and a next frame was asked for and drawn
    for (const a of s.arcs) {
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.x).toBeLessThanOrEqual(960);
      expect(a.y).toBeGreaterThan(0);
      expect(a.y).toBeLessThan(380);
    }
  });

  it("reduced motion draws one still picture and asks for no frames", () => {
    const s = stage();
    useForkStore.setState((st) => ({ ui: { ...st.ui, reducedMotion: true } }));
    confirm(MILES);
    render(<FutureField />);
    expect(s.frames).toHaveLength(0);
    expect(s.arcs.length).toBeGreaterThan(50);
  });

  it("a slow machine draws fewer particles", () => {
    const normal = stage();
    confirm(MILES);
    const { unmount } = render(<FutureField />);
    normal.tick(1000);
    const full = normal.arcs.length;
    unmount();
    vi.restoreAllMocks();
    const slow = stage();
    useForkStore.setState((st) => ({ ui: { ...st.ui, lowPerformance: true } }));
    render(<FutureField />);
    slow.tick(1000);
    expect(slow.arcs.length).toBeLessThan(full * 0.6);
  });

  it("stops when it goes away", () => {
    const s = stage();
    const { unmount } = render(<FutureField />);
    unmount();
    expect(globalThis.cancelAnimationFrame).toHaveBeenCalled();
    void s;
  });

  it("draws nothing and does not break where there is no canvas", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    render(<FutureField />);
    expect(tags()).toHaveLength(1); // the names and the offer are still there
  });

  it("renders nothing before there is a car", () => {
    resetForkStoreForTests();
    const { container } = render(<FutureField />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("quiet labels", () => {
  it("a change on a stream is its name and nothing more: where it sits and the year marks say when", () => {
    stage();
    confirm(MOVE, KID);
    render(<FutureField />);
    const pills = screen.getAllByTestId("field-decision").map((p) => p.textContent);
    expect(pills).toEqual(expect.arrayContaining(["Move to Denver", "Second child"]));
    for (const text of pills) expect(text).not.toMatch(/\bin \d|\bnow\b|\d yr/);
    expect(screen.getAllByText(/^\d yr$/).length).toBeGreaterThan(0); // the marks along the bottom are still there
  });
});
