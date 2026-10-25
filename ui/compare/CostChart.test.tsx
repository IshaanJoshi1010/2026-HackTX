import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LifeEvent } from "@/contracts";
import { BASE_ID, resetForkStoreForTests, useForkStore } from "@/ui/store/useForkStore";
import { CostChart } from "./CostChart";
import { X_AXIS_TITLE, Y_AXIS_TITLE, chartFrame, plotWidth, seriesOf, xOf, yDomain, yOf } from "./costChartMath";

/** An em dash or an en dash, spelled by code so this file has none. */
const DASHES = new RegExp(`[${String.fromCharCode(0x2014, 0x2013)}]`);
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
const MILES = draft("mileage_change", 6, { annualMiles: 24000 }, "24,000 miles a year");
const MOVE = draft("relocation", 12, { location: "Denver" }, "moving to Denver next year");

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

const lineEls = () => screen.queryAllByTestId("cost-chart-line");
const lineEl = (kind: string) => lineEls().find((l) => l.getAttribute("data-line") === kind)!;
const kinds = () => lineEls().map((l) => l.getAttribute("data-line"));
/** The last x and y in an SVG path. */
const endOf = (d: string) => d.split(/ L /).pop()!.replace(/^M /, "").split(" ").map(Number);
const dollars = (t: string | null) => Number((t ?? "").replace(/[$,]/g, ""));

/** Every word a person could read or hear inside the chart: text, labels, tooltips. */
function words(root: Element): string {
  const out = [root.textContent ?? ""];
  for (const el of root.querySelectorAll("*")) {
    for (const a of ["title", "aria-label", "aria-valuetext", "data-end-value"]) {
      const v = el.getAttribute(a);
      if (v) out.push(v);
    }
  }
  return out.join(" ");
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

describe("what is drawn", () => {
  it("draws just your own future when nothing has changed: one solid line, no baseline", () => {
    render(<CostChart />);
    expect(screen.getByTestId("cost-chart")).toBeInTheDocument();
    expect(kinds()).toEqual(["keep"]);
    expect(lineEl("keep")).not.toHaveAttribute("stroke-dasharray");
    expect(screen.getByTestId("cost-chart-endlabel")).toHaveTextContent("Keep your Camry");
  });

  it("adds a thin gray 'If nothing changes' line once your future differs from it", () => {
    confirm(MILES, MOVE);
    render(<CostChart />);
    expect(state().activeScenarioId).not.toBe(BASE_ID);
    expect(kinds().sort()).toEqual(["baseline", "keep"]);
    const base = lineEl("baseline");
    expect(base.getAttribute("class")).toContain("stroke-ink/40");
    expect(Number(base.getAttribute("stroke-width"))).toBe(1);
    expect(Number(lineEl("keep").getAttribute("stroke-width"))).toBe(2);
    expect(lineEl("keep").getAttribute("class")).toBe("stroke-ink");
    expect(lineEl("baseline").getAttribute("data-scenario")).toBe(BASE_ID);
    expect(lineEl("keep").getAttribute("data-scenario")).toBe(state().activeScenarioId);
  });

  it("with a comparison: keep solid, switch dashed, and the baseline, each named at its end and in the legend", async () => {
    confirm(MILES, MOVE);
    await compare();
    render(<CostChart />);
    expect(state().comparison).not.toBeNull();
    expect(kinds().sort()).toEqual(["baseline", "keep", "switch"]);
    const { keepId, replaceId } = state().comparison!;
    expect(lineEl("keep").getAttribute("data-scenario")).toBe(keepId);
    expect(lineEl("switch").getAttribute("data-scenario")).toBe(replaceId);
    expect(lineEl("keep")).not.toHaveAttribute("stroke-dasharray");
    expect(lineEl("switch").getAttribute("stroke-dasharray")).toMatch(/^\d+ \d+$/);
    expect(lineEl("switch").getAttribute("class")).toBe("stroke-ink");

    const ends = screen.getAllByTestId("cost-chart-endlabel").map((l) => [l.getAttribute("data-line"), l.textContent]);
    expect(ends).toEqual([
      ["keep", "Keep your Camry"],
      ["switch", "Switch to RAV4"],
      ["baseline", "If nothing changes"],
    ]);
    const legend = screen.getByTestId("cost-chart-legend");
    for (const name of ["Keep your Camry", "Switch to RAV4", "If nothing changes"]) expect(within(legend).getByText(name)).toBeInTheDocument();
  });

  it("charts the comparison's two futures, not whichever one is active", async () => {
    confirm(MILES);
    await compare();
    render(<CostChart />);
    const { keepId, replaceId } = state().comparison!;
    act(() => actions().setActiveScenario(keepId));
    expect(lineEl("keep").getAttribute("data-scenario")).toBe(keepId);
    expect(lineEl("switch").getAttribute("data-scenario")).toBe(replaceId);
  });

  it("leaves the baseline out when the kept future is the baseline", async () => {
    await compare();
    render(<CostChart />);
    expect(state().comparison!.keepId).toBe(BASE_ID);
    expect(kinds().sort()).toEqual(["keep", "switch"]);
  });

  it("draws no color: only ink, canvas and ink at an opacity", () => {
    confirm(MILES);
    render(<CostChart />);
    const svg = screen.getByRole("img");
    for (const el of svg.querySelectorAll("*")) {
      expect(el.getAttribute("stroke") ?? "").toBe("");
      expect(el.getAttribute("fill") === null || el.getAttribute("fill") === "none").toBe(true);
      const cls = el.getAttribute("class") ?? "";
      expect(cls).not.toMatch(/\b(?:stroke|fill)-(?:red|green|blue|yellow|orange|purple|pink|emerald|sky|amber|rose|indigo|teal|cyan|lime|violet|fuchsia)/);
    }
  });
});

describe("the axes", () => {
  it("labels time in years, 0 to 5, in order, left to right, with the title 'Years from now'", () => {
    confirm(MILES);
    render(<CostChart />);
    const ticks = screen.getAllByTestId("cost-chart-xtick");
    expect(ticks.map((t) => t.textContent)).toEqual(["0", "1", "2", "3", "4", "5"]);
    const xs = ticks.map((t) => Number(t.getAttribute("x")));
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(new Set(xs).size).toBe(6);
    expect(screen.getByTestId("cost-chart-xtitle")).toHaveTextContent(X_AXIS_TITLE);
    expect(X_AXIS_TITLE).toBe("Years from now");
  });

  it("labels dollars in round steps, $0 at the bottom up to a tick that covers the biggest cost, titled 'Net cost'", async () => {
    confirm(MILES, MOVE);
    await compare();
    render(<CostChart />);
    const ticks = screen.getAllByTestId("cost-chart-ytick");
    const labels = ticks.map((t) => t.textContent!);
    expect(labels[0]).toBe("$0");
    expect(labels.every((l) => /^\$\d{1,3}(,\d{3})*$/.test(l))).toBe(true);
    const values = labels.map(dollars);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
    const step = values[1] - values[0];
    values.forEach((v, i) => expect(v).toBe(i * step));
    // higher dollars sit higher on the screen (smaller y)
    const ys = ticks.map((t) => Number(t.getAttribute("y")));
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeLessThan(ys[i - 1]);
    // and the scale covers every number drawn
    const biggest = Math.max(...lineEls().map((l) => Number(l.getAttribute("data-end-value"))));
    expect(values[values.length - 1]).toBeGreaterThanOrEqual(biggest);
    expect(values.length).toBeGreaterThanOrEqual(3);
    expect(screen.getByTestId("cost-chart-ytitle")).toHaveTextContent(Y_AXIS_TITLE);
    expect(Y_AXIS_TITLE).toBe("Net cost");
  });

  it("draws light gridlines, one for each tick", () => {
    confirm(MILES);
    render(<CostChart />);
    const grid = screen.getByTestId("cost-chart-grid");
    const lines = [...grid.querySelectorAll("line")];
    expect(lines).toHaveLength(screen.getAllByTestId("cost-chart-ytick").length + 6);
    lines.forEach((l) => expect(l.getAttribute("class")).toBe("stroke-ink/10"));
  });
});

describe("the numbers on the lines", () => {
  it("ends each line exactly at the engine's net cost for month 60, on the dollar scale", async () => {
    confirm(MILES, MOVE);
    await compare();
    render(<CostChart />);
    const { results, comparison } = state();
    const expected = {
      keep: results[comparison!.keepId].points.find((p) => p.month === 60)!.netEconomicCost,
      switch: results[comparison!.replaceId].points.find((p) => p.month === 60)!.netEconomicCost,
      baseline: results[BASE_ID].points.find((p) => p.month === 60)!.netEconomicCost,
    };
    const frame = chartFrame(960, 340); // the size it assumes where there is no layout
    const domain = yDomain([keepSeries(comparison!.keepId), keepSeries(comparison!.replaceId), keepSeries(BASE_ID)]);
    for (const kind of ["keep", "switch", "baseline"] as const) {
      const el = lineEl(kind);
      expect(Number(el.getAttribute("data-end-value"))).toBe(expected[kind]);
      expect(Number(el.getAttribute("data-end-month"))).toBe(60);
      const [x, y] = endOf(el.getAttribute("d")!);
      expect(x).toBeCloseTo(xOf(60, frame), 1);
      expect(y).toBeCloseTo(yOf(expected[kind], domain, frame), 1);
    }
  });

  it("starts every line at $0 at month 0, and draws all 61 points", async () => {
    confirm(MILES);
    await compare();
    render(<CostChart />);
    const frame = chartFrame(960, 340);
    const domain = yDomain([keepSeries(state().comparison!.keepId), keepSeries(state().comparison!.replaceId), keepSeries(BASE_ID)]);
    for (const el of lineEls()) {
      const d = el.getAttribute("d")!;
      expect(d.startsWith(`M ${frame.left} ${yOf(0, domain, frame)}`)).toBe(true);
      expect(d.match(/ L /g)).toHaveLength(60);
    }
  });

  it("puts a vertical marker and a dot on each line at the chosen month, and moves them when the month moves", async () => {
    confirm(MILES);
    await compare();
    render(<CostChart />);
    const frame = chartFrame(960, 340);
    const domain = yDomain([keepSeries(state().comparison!.keepId), keepSeries(state().comparison!.replaceId), keepSeries(BASE_ID)]);

    // the store starts at 0, which shows the end of the five years
    expect(screen.getByTestId("cost-chart-marker")).toHaveAttribute("data-month", "60");
    expect(Number(screen.getByTestId("cost-chart-marker").getAttribute("x1"))).toBeCloseTo(xOf(60, frame), 1);
    expect(screen.getAllByTestId("cost-chart-dot")).toHaveLength(3);

    act(() => actions().setActiveMonth(30));
    const marker = screen.getByTestId("cost-chart-marker");
    expect(marker).toHaveAttribute("data-month", "30");
    expect(Number(marker.getAttribute("x1"))).toBeCloseTo(xOf(30, frame), 1);
    expect(Number(marker.getAttribute("x1"))).toBeCloseTo(frame.left + plotWidth(frame) / 2, 1);
    const dots = screen.getAllByTestId("cost-chart-dot");
    expect(dots).toHaveLength(3);
    const { results, comparison } = state();
    const idOf = { keep: comparison!.keepId, switch: comparison!.replaceId, baseline: BASE_ID } as const;
    for (const dot of dots) {
      const kind = dot.getAttribute("data-line") as keyof typeof idOf;
      const value = results[idOf[kind]].points.find((p) => p.month === 30)!.netEconomicCost;
      expect(Number(dot.getAttribute("cx"))).toBeCloseTo(xOf(30, frame), 1);
      expect(Number(dot.getAttribute("cy"))).toBeCloseTo(yOf(value, domain, frame), 1);
    }
  });
});

describe("when there is nothing to draw", () => {
  it("says so in a sentence, with no chart and no NaN", () => {
    useForkStore.setState({ results: {} });
    render(<CostChart />);
    expect(screen.getByTestId("cost-chart-empty")).toHaveTextContent(/nothing to chart yet/i);
    expect(screen.queryByTestId("cost-chart")).toBeNull();
    expect(screen.queryByTestId("cost-chart-line")).toBeNull();
    expect(document.body.textContent).not.toMatch(/NaN|undefined|Infinity/);
  });

  it("says so before there is a car at all", () => {
    resetForkStoreForTests();
    render(<CostChart />);
    expect(screen.getByTestId("cost-chart-empty")).toBeInTheDocument();
  });

  it("skips a line whose result is missing and draws the rest", async () => {
    confirm(MILES);
    await compare();
    const { replaceId } = state().comparison!;
    const { [replaceId]: _gone, ...rest } = state().results;
    void _gone;
    useForkStore.setState({ results: rest });
    render(<CostChart />);
    expect(kinds().sort()).toEqual(["baseline", "keep"]);
    expect(document.body.textContent).not.toMatch(/NaN|undefined|Infinity/);
  });

  it("never prints NaN or Infinity when a point is broken", async () => {
    confirm(MILES);
    const id = state().activeScenarioId;
    const r = state().results[id];
    const broken = { ...r, points: r.points.map((p) => (p.month === 20 ? { ...p, netEconomicCost: Number.NaN } : p.month === 21 ? { ...p, netEconomicCost: Infinity } : p)) };
    useForkStore.setState({ results: { ...state().results, [id]: broken } });
    const { container } = render(<CostChart />);
    expect(container.innerHTML).not.toMatch(/NaN|Infinity|undefined/);
    expect(lineEl("keep").getAttribute("d")!.match(/ L /g)).toHaveLength(58);
  });
});

describe("size", () => {
  it("measures itself and drops the end labels on a narrow screen, leaving the legend to name the lines", async () => {
    class FakeObserver {
      constructor(private cb: () => void) {}
      observe() {
        this.cb();
      }
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal("ResizeObserver", FakeObserver);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ width: 400, height: 300, top: 0, left: 0, right: 400, bottom: 300, x: 0, y: 0, toJSON() {} });
    confirm(MILES);
    await compare();
    render(<CostChart />);
    const svg = screen.getByRole("img");
    expect(svg.getAttribute("viewBox")).toBe("0 0 400 280");
    expect(screen.queryAllByTestId("cost-chart-endlabel")).toHaveLength(0);
    const legend = screen.getByTestId("cost-chart-legend");
    expect(within(legend).getByText("Keep your Camry")).toBeInTheDocument();
    expect(within(legend).getByText("Switch to RAV4")).toBeInTheDocument();
    expect(screen.getAllByTestId("cost-chart-xtick")).toHaveLength(6);
  });
});

describe("words", () => {
  it("every source label is a real one, the chart has a name for a screen reader, and the words are clean", async () => {
    confirm(MILES, MOVE);
    await compare();
    const { container } = render(<CostChart />);
    const svg = screen.getByRole("img");
    expect(svg.getAttribute("aria-label")).toMatch(/^Net cost over five years for Keep your Camry, Switch to RAV4, If nothing changes\./);
    const badge = within(screen.getByTestId("cost-chart-legend")).getByText(/your input|sourced|listing|estimated|illustrative|no source/);
    expect(badge).toBeInTheDocument();
    const all = words(container);
    expect(all).not.toMatch(/NaN|undefined|Infinity|null/);
    expect(all).not.toMatch(DASHES); // no em or en dash
    expect(all).not.toMatch(/demo|data/i);
  });

  it("no text in the chart is smaller than 12px", () => {
    confirm(MILES);
    const { container } = render(<CostChart />);
    for (const t of container.querySelectorAll("text")) {
      const cls = t.getAttribute("class") ?? "";
      expect(cls).toMatch(/\btext-xs\b/);
      expect(cls).not.toMatch(/text-\[\d+px\]/);
    }
  });
});

function keepSeries(id: string) {
  return { points: seriesOf(state().results[id]) };
}
