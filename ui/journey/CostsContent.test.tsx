import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ai, data } from "@/ui/mocks";
import { usd } from "@/ui/profile/format";
import { resetForkStoreForTests, useForkStore } from "@/ui/store/useForkStore";
import { CostsContent } from "./CostsContent";
import { journeyCompared, journeyOffer } from "./fixtures";
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

/** Alex end to end with no AI: his brain dump confirmed. */
async function confirmAlex() {
  await startAlex();
  await actions().submitDump(data.demo.brainDump);
  actions().confirmDrafts(state().explore.draftChanges.map((d) => d.id));
}

/** The engine's net cost for a future at a month. */
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

/** Every word a person could read or hear inside: text, tooltips, labels. */
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

const readout = (kind: string) => screen.getAllByTestId("cost-readout-line").find((r) => r.getAttribute("data-line") === kind)!;
const slider = () => screen.getByRole("slider", { name: "Month" });

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  resetForkStoreForTests();
  useForkStore.setState({ hydrated: true });
  vi.spyOn(ai, "explain").mockRejectedValue(new Error("no words in this test"));
});

afterEach(() => cleanup());

describe("CostsContent, compared", () => {
  beforeEach(async () => {
    await confirmAlex();
    await actions().openReplaceComparison();
  });

  it("starts with a three column table of modeled net cost over five years", () => {
    const journey = realCompared();
    render(<CostsContent journey={journey} />);
    expect(screen.getByRole("heading", { name: "Modeled net cost over five years" })).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Keep", "Switch", "Difference"]);
    expect(within(table).getAllByRole("cell")).toHaveLength(3);
  });

  it("shows the five year totals and the difference phrase from the journey, equal to the engine at month 60", () => {
    const journey = realCompared();
    render(<CostsContent journey={journey} />);
    const c = state().comparison!;
    expect(screen.getByTestId("five-year-keep")).toHaveTextContent(usd(Math.round(engine(c.keepId, 60))));
    expect(screen.getByTestId("five-year-switch")).toHaveTextContent(usd(Math.round(engine(c.replaceId, 60))));
    expect(screen.getByTestId("five-year-difference")).toHaveTextContent(journey.difference!.phrase);
  });

  it("matches the readout under the chart, which speaks about month 60 until you scrub", () => {
    const journey = realCompared();
    render(<CostsContent journey={journey} />);
    expect(state().activeMonth).toBe(0);
    expect(readout("keep")).toHaveTextContent(screen.getByTestId("five-year-keep").textContent!);
    expect(readout("switch")).toHaveTextContent(screen.getByTestId("five-year-switch").textContent!);
  });

  it("has one source label for the group", () => {
    render(<CostsContent journey={realCompared()} />);
    const group = screen.getByRole("heading", { name: "Modeled net cost over five years" }).closest("section")!;
    expect(group.querySelectorAll("[data-source]")).toHaveLength(1);
    expect(group.querySelector("[data-source]")).toHaveAttribute("data-source", "illustrative");
  });

  it("holds the five year totals still while you scrub; only the readout moves", () => {
    render(<CostsContent journey={realCompared()} />);
    const c = state().comparison!;
    const keepTotal = screen.getByTestId("five-year-keep").textContent;
    const switchTotal = screen.getByTestId("five-year-switch").textContent;
    fireEvent.change(slider(), { target: { value: "12" } });
    expect(state().activeMonth).toBe(12);
    expect(screen.getByTestId("five-year-keep")).toHaveTextContent(keepTotal!);
    expect(screen.getByTestId("five-year-switch")).toHaveTextContent(switchTotal!);
    expect(readout("keep")).toHaveTextContent(usd(engine(c.keepId, 12)));
    expect(readout("switch")).toHaveTextContent(usd(engine(c.replaceId, 12)));
  });

  it("has the chart, its month slider, the readout and the breakdown, and no road", () => {
    const { container } = render(<CostsContent journey={realCompared()} />);
    expect(screen.getByTestId("cost-chart")).toBeInTheDocument();
    expect(screen.getAllByRole("slider")).toHaveLength(1);
    expect(screen.getByTestId("cost-readout")).toBeInTheDocument();
    expect(screen.getByTestId("future-details")).toBeInTheDocument();
    expect(screen.queryByTestId("road")).toBeNull();
    const ids = [...container.querySelectorAll("[data-testid]")].map((el) => el.getAttribute("data-testid")!);
    expect(ids.filter((id) => /road|timeline/i.test(id))).toEqual([]);
    // labeled axes come with the chart
    expect(screen.getByTestId("cost-chart-xtitle")).toBeInTheDocument();
    expect(screen.getByTestId("cost-chart-ytitle")).toBeInTheDocument();
  });

  it("offers no compare button once the switch is priced", () => {
    render(<CostsContent journey={realCompared()} />);
    expect(screen.queryByRole("button", { name: /^Compare/ })).toBeNull();
    expect(screen.queryByTestId("costs-unpriced")).toBeNull();
  });

  it("has no em dash, and never says demo or data", () => {
    const { container } = render(<CostsContent journey={realCompared()} />);
    const text = words(container);
    expect(text).not.toContain(EM_DASH);
    expect(text).not.toMatch(/demo|data/i);
  });
});

describe("CostsContent, before comparing", () => {
  beforeEach(async () => {
    await confirmAlex();
  });

  const offer = (): Journey => {
    const keepId = state().activeScenarioId;
    return { ...journeyOffer, keep: { ...journeyOffer.keep, scenarioId: keepId, fiveYearCost: Math.round(engine(keepId, 60)) } };
  };

  it("prices only keeping, and says the switch is not priced yet", () => {
    render(<CostsContent journey={offer()} />);
    expect(within(screen.getByRole("table")).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Keep"]);
    expect(screen.getByTestId("five-year-keep")).toHaveTextContent(usd(Math.round(engine(state().activeScenarioId, 60))));
    expect(screen.queryByTestId("five-year-switch")).toBeNull();
    expect(screen.queryByTestId("five-year-difference")).toBeNull();
    expect(screen.getByTestId("costs-unpriced")).toHaveTextContent("The switch isn't priced yet.");
  });

  it("still shows the chart for keeping", () => {
    render(<CostsContent journey={offer()} />);
    expect(screen.getByTestId("cost-chart")).toBeInTheDocument();
    expect(readout("keep")).toBeInTheDocument();
  });

  it("compares for real from its button", async () => {
    render(<CostsContent journey={offer()} />);
    expect(state().comparison).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Compare with the RAV4" }));
    });
    expect(state().comparison).not.toBeNull();
    expect(state().evaluation).not.toBeNull();
  });

  it("has no compare button when there is no other car", () => {
    render(<CostsContent journey={{ ...offer(), switch: null }} />);
    expect(screen.queryByRole("button", { name: /^Compare/ })).toBeNull();
    expect(screen.queryByTestId("costs-unpriced")).toBeNull();
  });

  it("has one source label for the group here too", () => {
    render(<CostsContent journey={offer()} />);
    const group = screen.getByRole("heading", { name: "Modeled net cost over five years" }).closest("section")!;
    expect(group.querySelectorAll("[data-source]")).toHaveLength(1);
  });
});
