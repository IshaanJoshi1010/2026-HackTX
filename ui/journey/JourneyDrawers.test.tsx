import { act, cleanup, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTradeoff } from "@/ui/compare/useTradeoff";
import { ai, data } from "@/ui/mocks";
import { usd } from "@/ui/profile/format";
import { resetForkStoreForTests, useForkStore } from "@/ui/store/useForkStore";
import { journeyCompared, journeyOffer, journeySwitchSelected } from "./fixtures";
import { JourneyDrawers } from "./JourneyDrawers";
import type { Journey } from "./types";

// Built from the code point so this file has none itself.
const EM_DASH = String.fromCharCode(0x2014);
const state = () => useForkStore.getState();
const actions = () => useForkStore.getState().actions;

async function startAlex() {
  vi.spyOn(ai, "interpret").mockResolvedValue({ aiAvailable: false });
  await actions().startFromSample("camry-2022-se");
  actions().onRevealStage("done");
}

/** Alex's brain dump confirmed, then the keep vs replace comparison. */
async function compareAlex() {
  await startAlex();
  await actions().submitDump(data.demo.brainDump);
  actions().confirmDrafts(state().explore.draftChanges.map((d) => d.id));
  await actions().openReplaceComparison();
}

const engine = (id: string, month: number) => state().results[id].points.find((p) => p.month === month)!.netEconomicCost;

/** A compared journey whose dollars are the real simulation's month 60, rounded like the page rounds them. */
function realCompared(): Journey {
  const c = state().comparison!;
  const keep = Math.round(engine(c.keepId, 60));
  const sw = Math.round(engine(c.replaceId, 60));
  const amount = sw - keep;
  return {
    ...journeyCompared,
    keep: { ...journeyCompared.keep, scenarioId: c.keepId, fiveYearCost: keep },
    switch: { ...journeyCompared.switch!, scenarioId: c.replaceId, fiveYearCost: sw },
    difference: { amount, phrase: `Switching ${amount >= 0 ? "adds" : "saves"} ${usd(Math.abs(amount))}`, source: "illustrative" },
  };
}

function words(root: Element): string {
  const out = [root.textContent ?? ""];
  for (const el of root.querySelectorAll("*")) {
    for (const a of ["title", "aria-label", "aria-valuetext", "placeholder", "alt"]) {
      const v = el.getAttribute(a);
      if (v) out.push(v);
    }
  }
  return out.join(" ");
}

/** The drawers sit in a relative parent, as they do on the page. */
function renderDrawers(journey: Journey, explain: React.ReactNode = <p>The long explanation</p>) {
  return render(
    <div className="relative">
      <button type="button" onClick={() => actions().openDrawer("costs")}>
        Opener
      </button>
      <JourneyDrawers journey={journey} explain={explain} />
    </div>,
  );
}

const open = (id: "explain" | "costs" | "recommendation") => act(() => actions().openDrawer(id));
const dialogs = () => screen.queryAllByRole("dialog");
const readout = (kind: string) => screen.getAllByTestId("cost-readout-line").find((r) => r.getAttribute("data-line") === kind)!;
const titleOf = () => screen.getByRole("dialog").getAttribute("aria-label");

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  resetForkStoreForTests();
  useForkStore.setState({ hydrated: true });
  vi.spyOn(ai, "explain").mockRejectedValue(new Error("no words in this test"));
});

afterEach(() => cleanup());

describe("JourneyDrawers, shut", () => {
  it("shows nothing until the store opens one", async () => {
    await startAlex();
    renderDrawers(journeyOffer);
    expect(state().ui.drawer).toBeNull();
    expect(dialogs()).toHaveLength(0);
    expect(screen.queryByText("The long explanation")).toBeNull();
    expect(screen.queryByTestId("cost-chart")).toBeNull();
  });
});

describe("JourneyDrawers, explain", () => {
  it("is titled with the selected moment and holds the body it is given", async () => {
    await startAlex();
    renderDrawers(journeySwitchSelected);
    open("explain");
    expect(screen.getByRole("dialog", { name: "Second child" })).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByText("The long explanation")).toBeInTheDocument();
  });

  it("says This moment when nothing is selected", async () => {
    await startAlex();
    renderDrawers(journeyCompared);
    open("explain");
    expect(screen.getByRole("dialog", { name: "This moment" })).toBeInTheDocument();
  });
});

describe("JourneyDrawers, costs", () => {
  it("is Compare costs, with totals and a readout equal to the simulation at month 60", async () => {
    await compareAlex();
    const journey = realCompared();
    renderDrawers(journey);
    open("costs");
    const dialog = screen.getByRole("dialog", { name: "Compare costs" });
    const c = state().comparison!;
    expect(state().activeMonth).toBe(0); // not scrubbed: the readout speaks about month 60
    expect(within(dialog).getByTestId("five-year-keep")).toHaveTextContent(usd(engine(c.keepId, 60)));
    expect(within(dialog).getByTestId("five-year-switch")).toHaveTextContent(usd(engine(c.replaceId, 60)));
    expect(readout("keep")).toHaveTextContent(usd(engine(c.keepId, 60)));
    expect(readout("switch")).toHaveTextContent(usd(engine(c.replaceId, 60)));
  });

  it("has no road graphic", async () => {
    await compareAlex();
    renderDrawers(realCompared());
    open("costs");
    const dialog = screen.getByRole("dialog");
    expect(screen.queryByTestId("road")).toBeNull();
    const ids = [...dialog.querySelectorAll("[data-testid]")].map((el) => el.getAttribute("data-testid")!);
    expect(ids.filter((id) => /road|timeline/i.test(id))).toEqual([]);
    expect(within(dialog).getByTestId("cost-chart")).toBeInTheDocument();
  });

  it("scrubbing its slider moves the shared month and not the five year totals", async () => {
    await compareAlex();
    renderDrawers(realCompared());
    open("costs");
    const total = screen.getByTestId("five-year-keep").textContent;
    fireEvent.change(screen.getByRole("slider", { name: "Month" }), { target: { value: "24" } });
    expect(state().activeMonth).toBe(24);
    expect(screen.getByTestId("five-year-keep")).toHaveTextContent(total!);
    expect(readout("keep")).toHaveTextContent(usd(engine(state().comparison!.keepId, 24)));
  });
});

describe("JourneyDrawers, recommendation", () => {
  it("is titled with the engine's headline and lists the five tradeoff rows from the engine", async () => {
    await compareAlex();
    renderDrawers(realCompared());
    open("recommendation");
    const dialog = screen.getByRole("dialog", { name: "Close call" });
    const { result } = renderHook(() => useTradeoff());
    const rows = within(dialog).getAllByTestId("tradeoff-row");
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.getAttribute("data-factor"))).toEqual(result.current!.rows.map((r) => r.key));
    expect(rows.map((r) => r.getAttribute("data-leader"))).toEqual(result.current!.rows.map((r) => r.leader));
    expect(within(dialog).getByTestId("recommendation-robustness")).toHaveTextContent("Held in 9 of 9 tested cases");
  });

  it("is titled with the pick when the engine picks: keep, then switch", async () => {
    await compareAlex();
    renderDrawers(realCompared());
    open("recommendation");
    act(() => actions().pickTradeoff({ pairId: "cost_vs_cargo", choice: "A" }));
    expect(titleOf()).toBe("Keep your Camry");
    act(() => actions().pickTradeoff({ pairId: "cost_vs_cargo", choice: "B" }));
    expect(titleOf()).toBe("Switch to the RAV4");
  });

  it("stays a close call when you look at either future", async () => {
    await compareAlex();
    renderDrawers(realCompared());
    open("recommendation");
    const c = state().comparison!;
    const before = state().evaluation;
    expect(titleOf()).toBe("Close call");
    for (const id of [c.replaceId, c.keepId, c.replaceId]) {
      act(() => actions().setActiveScenario(id));
      expect(state().activeScenarioId).toBe(id);
      expect(state().evaluation).toBe(before);
      expect(state().evaluation?.preferredScenarioId).toBe("inconclusive");
      expect(titleOf()).toBe("Close call");
      expect(screen.getAllByTestId("tradeoff-row")).toHaveLength(5);
    }
    for (const id of [c.keepId, c.replaceId]) {
      act(() => actions().selectFuture(id));
      expect(state().evaluation?.preferredScenarioId).toBe("inconclusive");
      expect(titleOf()).toBe("Close call");
    }
  });

  it("explains the missing comparison in a line, with a compare button that works", async () => {
    await startAlex();
    renderDrawers(journeyOffer);
    open("recommendation");
    expect(screen.getByRole("dialog", { name: "Keep or switch?" })).toBeInTheDocument();
    expect(screen.getByTestId("recommendation-empty")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Compare with the RAV4" }));
    });
    expect(state().comparison).not.toBeNull();
    // with nothing changing in Alex's life, keeping is what the engine picks, and the title says so
    expect(state().evaluation?.preferredScenarioId).toBe(state().comparison!.keepId);
    expect(titleOf()).toBe("Keep your Camry");
    expect(screen.getAllByTestId("tradeoff-row")).toHaveLength(5);
  });

  it("runs the break-even from its button", async () => {
    await compareAlex();
    renderDrawers(realCompared());
    open("recommendation");
    fireEvent.click(screen.getByRole("button", { name: "Show what would change it" }));
    expect(state().breakEven).not.toBeNull();
    expect(screen.getByTestId("change-panel")).toBeInTheDocument();
  });
});

describe("JourneyDrawers, one at a time", () => {
  it("swaps content when another opens, and never stacks a second panel", async () => {
    await compareAlex();
    renderDrawers(realCompared());
    open("recommendation");
    expect(dialogs()).toHaveLength(1);
    expect(titleOf()).toBe("Close call");

    open("costs");
    expect(state().ui.drawer).toBe("costs");
    expect(dialogs()).toHaveLength(1);
    expect(titleOf()).toBe("Compare costs");
    expect(screen.queryByTestId("recommendation-content")).toBeNull();
    expect(screen.getByTestId("costs-content")).toBeInTheDocument();

    open("explain");
    expect(dialogs()).toHaveLength(1);
    expect(titleOf()).toBe("This moment");
    expect(screen.queryByTestId("costs-content")).toBeNull();
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1); // the closed ones do not linger either
  });
});

describe("JourneyDrawers, closing", () => {
  it("closes through the store from the Close button", async () => {
    await compareAlex();
    renderDrawers(realCompared());
    open("costs");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(state().ui.drawer).toBeNull();
    expect(dialogs()).toHaveLength(0);
  });

  it("closes through the store from the dim layer and from Escape", async () => {
    await compareAlex();
    renderDrawers(realCompared());
    open("recommendation");
    fireEvent.click(screen.getByTestId("drawer-dim"));
    expect(state().ui.drawer).toBeNull();
    open("costs");
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(state().ui.drawer).toBeNull();
  });

  it("gives focus back to what opened it", async () => {
    await compareAlex();
    renderDrawers(realCompared());
    const opener = screen.getByRole("button", { name: "Opener" });
    opener.focus();
    fireEvent.click(opener);
    expect(state().ui.drawer).toBe("costs");
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(opener).toHaveFocus();
  });
});

describe("JourneyDrawers, words", () => {
  it("has no em dash, and never says demo or data, in any drawer", async () => {
    await compareAlex();
    const { container } = renderDrawers(realCompared());
    for (const id of ["explain", "costs", "recommendation"] as const) {
      open(id);
      const text = words(container);
      expect(text, id).not.toContain(EM_DASH);
      expect(text, id).not.toMatch(/demo|data/i);
    }
  });
});
