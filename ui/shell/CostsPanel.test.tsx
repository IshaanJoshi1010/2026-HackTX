import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LifeEvent } from "@/contracts";
import { monthLabel, usd } from "@/ui/profile/format";
import { BASE_ID, resetForkStoreForTests, useForkStore } from "@/ui/store/useForkStore";
import { CostsPanel } from "./CostsPanel";

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

const slider = () => screen.getByRole("slider", { name: "Month" }) as HTMLInputElement;
const scrubTo = (month: number) => fireEvent.change(slider(), { target: { value: String(month) } });
const rows = () => screen.getAllByTestId("cost-readout-line");
const row = (kind: string) => rows().find((r) => r.getAttribute("data-line") === kind)!;
const stats = () => [...document.querySelectorAll('[data-slot="stat"]')] as HTMLElement[];
const statValue = (label: string) => stats().find((s) => s.textContent!.includes(label))!.firstElementChild!.textContent;

/** The net cost the engine produced for a future at a month. */
const engine = (id: string, month: number) => state().results[id].points.find((p) => p.month === month)!.netEconomicCost;

/** Everything a person could read or hear: text, tooltips, labels, placeholders. */
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

beforeEach(async () => {
  vi.restoreAllMocks();
  localStorage.clear();
  resetForkStoreForTests();
  useForkStore.setState({ hydrated: true });
  await actions().startFromSample("camry-2022-se");
  actions().onRevealStage("done");
});

afterEach(() => cleanup());

describe("the layout", () => {
  it("stacks the chart, the month slider, the readout and then the breakdown, in that order", async () => {
    confirm(MILES, MOVE);
    await compare();
    render(<CostsPanel />);
    const panel = screen.getByTestId("costs-panel");
    const order = [screen.getByTestId("cost-chart"), slider(), screen.getByTestId("cost-readout"), screen.getByTestId("future-details")];
    order.forEach((el) => expect(panel).toContainElement(el));
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("does not use the old road", () => {
    confirm(MILES);
    render(<CostsPanel />);
    expect(screen.queryByTestId("road")).toBeNull();
    expect(screen.getAllByRole("slider")).toHaveLength(1);
  });
});

describe("the month slider", () => {
  it("is named Month, runs through the five years, and starts at the end of them when nothing was scrubbed", () => {
    confirm(MILES);
    render(<CostsPanel />);
    expect(state().activeMonth).toBe(0);
    expect(slider().type).toBe("range");
    expect(slider().max).toBe("60");
    expect(Number(slider().min)).toBeLessThanOrEqual(1);
    expect(slider().value).toBe("60");
    expect(slider()).toHaveAttribute("aria-valuetext", "5 yr");
  });

  it("writes the store's active month, and says the time in words", () => {
    confirm(MILES);
    render(<CostsPanel />);
    scrubTo(27);
    expect(state().activeMonth).toBe(27);
    expect(slider().value).toBe("27");
    expect(slider()).toHaveAttribute("aria-valuetext", "2 yr 3 mo");
    scrubTo(12);
    expect(state().activeMonth).toBe(12);
    expect(slider()).toHaveAttribute("aria-valuetext", "1 yr");
    scrubTo(5);
    expect(slider()).toHaveAttribute("aria-valuetext", "5 mo");
  });

  it("follows the store when something else moves the month", () => {
    confirm(MILES);
    render(<CostsPanel />);
    act(() => actions().setActiveMonth(40));
    expect(slider().value).toBe("40");
    expect(slider()).toHaveAttribute("aria-valuetext", monthLabel(40));
  });

  it("moves the chart's marker and the readout together", async () => {
    confirm(MILES, MOVE);
    await compare();
    render(<CostsPanel />);
    scrubTo(18);
    expect(screen.getByTestId("cost-chart-marker")).toHaveAttribute("data-month", "18");
    expect(screen.getByTestId("cost-readout")).toHaveTextContent("Net cost at 1 yr 6 mo");
  });

  it("has a focus ring like every other control", () => {
    render(<CostsPanel />);
    for (const cls of ["focus-visible:outline-2", "focus-visible:outline-offset-2", "focus-visible:outline-ink"]) {
      expect(slider().className).toContain(cls);
    }
  });
});

describe("the readout", () => {
  it("gives each line's net cost at the month, straight from the engine, with a source label on each", async () => {
    confirm(MILES, MOVE);
    await compare();
    render(<CostsPanel />);
    const { keepId, replaceId } = state().comparison!;
    for (const month of [60, 24, 7, 1]) {
      scrubTo(month);
      expect(screen.getByTestId("cost-readout")).toHaveTextContent(`Net cost at ${monthLabel(month)}`);
      expect(row("keep")).toHaveTextContent("Keep your Camry");
      expect(row("keep")).toHaveTextContent(usd(engine(keepId, month)));
      expect(row("switch")).toHaveTextContent("Switch to RAV4");
      expect(row("switch")).toHaveTextContent(usd(engine(replaceId, month)));
      expect(row("baseline")).toHaveTextContent("If nothing changes");
      expect(row("baseline")).toHaveTextContent(usd(engine(BASE_ID, month)));
      for (const r of rows()) expect(r.querySelector("[data-source]")).not.toBeNull();
    }
  });

  it("reads the end of the five years at first, which is what the lines end at", async () => {
    confirm(MILES);
    await compare();
    render(<CostsPanel />);
    const { keepId, replaceId } = state().comparison!;
    expect(screen.getByTestId("cost-readout")).toHaveTextContent("Net cost at 5 yr");
    expect(row("keep")).toHaveTextContent(usd(engine(keepId, 60)));
    expect(row("switch")).toHaveTextContent(usd(engine(replaceId, 60)));
    const chartEnd = (kind: string) => Number(screen.getAllByTestId("cost-chart-line").find((l) => l.getAttribute("data-line") === kind)!.getAttribute("data-end-value"));
    expect(usd(chartEnd("keep"))).toBe(usd(engine(keepId, 60)));
    expect(usd(chartEnd("switch"))).toBe(usd(engine(replaceId, 60)));
  });

  it("lists only the lines on the chart: just your future when nothing has changed", () => {
    render(<CostsPanel />);
    expect(rows().map((r) => r.getAttribute("data-line"))).toEqual(["keep"]);
    expect(row("keep")).toHaveTextContent(usd(engine(BASE_ID, 60)));
  });

  it("the source label is a real label, never a gap", async () => {
    confirm(MILES, MOVE);
    await compare();
    render(<CostsPanel />);
    for (const r of rows()) {
      const badge = r.querySelector("[data-source]")!;
      expect(badge.getAttribute("data-source")).toMatch(/^(sourced|listing|user|estimated|illustrative|synthetic)$/);
    }
  });
});

describe("the breakdown underneath", () => {
  it("lists what each change did to cost, each with a source label, and the four supporting numbers", () => {
    confirm(MILES, MOVE);
    render(<CostsPanel />);
    const effects = screen.getAllByTestId("decision-effect");
    expect(effects).toHaveLength(2);
    const byTitle = (t: string) => effects.find((r) => r.textContent!.includes(t))!;
    expect(byTitle("24,000 miles a year").textContent).toMatch(/Adds \$[\d,]+|Saves \$[\d,]+|No change in cost/);
    expect(byTitle("Move to Denver")).toBeInTheDocument();
    effects.forEach((r) => expect(r.querySelector("[data-source]")).not.toBeNull());

    const details = screen.getByTestId("future-details");
    for (const label of ["Odometer", "Fuel so far", "Upkeep so far", "Resale value"]) {
      expect(within(details).getByText(label)).toBeInTheDocument();
    }
    expect(stats()).toHaveLength(4);
    stats().forEach((st) => expect(st.querySelector("[data-source]")).not.toBeNull());
  });

  it("says plainly that nothing has changed when nothing has", () => {
    render(<CostsPanel />);
    expect(screen.getByTestId("future-details")).toHaveTextContent("No decisions yet, so nothing has changed.");
    expect(screen.queryAllByTestId("decision-effect")).toHaveLength(0);
  });

  it("follows the month: the same numbers the slider is on, not the end of the five years", () => {
    confirm(MILES, MOVE);
    render(<CostsPanel />);
    const atEnd = statValue("Odometer");
    scrubTo(12);
    expect(screen.getByTestId("future-details")).toHaveTextContent("by 1 yr");
    expect(statValue("Odometer")).not.toBe(atEnd);
    const point = state().results[state().activeScenarioId].points.find((p) => p.month === 12)!;
    expect(statValue("Odometer")).toBe(`${Math.round(point.mileage).toLocaleString("en-US")} mi`);
    expect(statValue("Resale value")).toBe(usd(point.vehicleValue));
  });

  it("shows the supporting numbers even before anyone has scrubbed", () => {
    confirm(MILES);
    render(<CostsPanel />);
    expect(state().activeMonth).toBe(0);
    expect(stats()).toHaveLength(4);
    expect(screen.getByTestId("future-details")).toHaveTextContent("by 5 yr");
  });

  it("names the future it is about, and that follows the active future", async () => {
    confirm(MILES, MOVE);
    await compare();
    render(<CostsPanel />);
    const active = state().explore.scenarios.find((s) => s.id === state().activeScenarioId)!;
    expect(screen.getByTestId("future-details")).toHaveTextContent(active.name);
    act(() => actions().setActiveScenario(state().comparison!.keepId));
    expect(screen.getAllByTestId("decision-effect").length).toBeGreaterThan(0);
  });
});

describe("when there is nothing to show", () => {
  it("shows a sentence instead of a chart, and a slider that is switched off, and no NaN", () => {
    useForkStore.setState({ results: {} });
    render(<CostsPanel />);
    expect(screen.getByTestId("cost-chart-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("cost-readout")).toBeNull();
    expect(slider()).toBeDisabled();
    expect(screen.queryAllByTestId("decision-effect")).toHaveLength(0);
    expect(stats()).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/NaN|undefined|Infinity/);
  });

  it("does not crash before there is a car", () => {
    resetForkStoreForTests();
    render(<CostsPanel />);
    expect(screen.getByTestId("costs-panel")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/NaN|undefined|Infinity/);
  });
});

describe("words and numbers", () => {
  it("every number has a source label, and nothing reads NaN, undefined or Infinity, at any month", async () => {
    confirm(MILES, MOVE);
    await compare();
    const { container } = render(<CostsPanel />);
    for (const month of [60, 1, 2, 11, 12, 13, 30, 59]) {
      scrubTo(month);
      expect(container.textContent).not.toMatch(/NaN|undefined|Infinity/);
      expect(container.innerHTML).not.toMatch(/NaN|undefined|Infinity/);
      // each place a dollar figure or a mileage is printed has a source label in the same row or tile
      for (const r of rows()) expect(r.querySelector("[data-source]")).not.toBeNull();
      for (const st of stats()) expect(st.querySelector("[data-source]")).not.toBeNull();
      for (const e of screen.queryAllByTestId("decision-effect")) expect(e.querySelector("[data-source]")).not.toBeNull();
    }
  });

  it("uses no em dash, no en dash, and never says demo or data", async () => {
    confirm(MILES, MOVE);
    await compare();
    const { container } = render(<CostsPanel />);
    for (const month of [60, 33]) {
      scrubTo(month);
      const all = words(container);
      expect(all).not.toMatch(DASHES);
      expect(all).not.toMatch(/demo|data/i);
    }
  });

  it("keeps text at 12px or bigger (the shared source label sets its own size)", () => {
    confirm(MILES);
    const { container } = render(<CostsPanel />);
    const mine = [...container.querySelectorAll("[class]")].filter((el) => !el.closest("[data-source]"));
    const sizes = mine.flatMap((el) => (el.getAttribute("class") ?? "").match(/text-\[(\d+)px\]/g) ?? []).map((c) => Number(/\d+/.exec(c)![0]));
    for (const px of sizes) expect(px).toBeGreaterThanOrEqual(12);
    expect(mine.some((el) => /\btext-(xs|sm|base|lg|xl)\b/.test(el.getAttribute("class") ?? ""))).toBe(true);
    for (const t of container.querySelectorAll("svg text")) expect(t.getAttribute("class")).toContain("text-xs");
    expect(mine.map((el) => el.getAttribute("class") ?? "").join(" ")).not.toMatch(/text-\[(?:[0-9]|1[01])px\]/);
  });
});
