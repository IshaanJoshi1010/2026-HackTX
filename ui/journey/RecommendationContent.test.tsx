import { act, cleanup, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DriverProfile } from "@/contracts";
import type { TradeoffRow } from "@/ui/compare/tradeoff";
import { useTradeoff } from "@/ui/compare/useTradeoff";
import { ai, data } from "@/ui/mocks";
import { usd } from "@/ui/profile/format";
import { resetForkStoreForTests, useForkStore } from "@/ui/store/useForkStore";
import { journeyCompared, journeyOffer } from "./fixtures";
import { RecommendationContent, balanceSentence, prioritiesInWords } from "./RecommendationContent";
import type { Journey } from "./types";

// Built from the code point so this file has none itself.
const EM_DASH = String.fromCharCode(0x2014);
const state = () => useForkStore.getState();
const actions = () => useForkStore.getState().actions;

const weights = (w: Partial<DriverProfile["priorities"]>): DriverProfile["priorities"] => ({
  cost: 0.2,
  family: 0.2,
  longevity: 0.2,
  fuel: 0.2,
  comfort: 0.2,
  ...w,
});

describe("prioritiesInWords", () => {
  it("says so when everything counts the same", () => {
    expect(prioritiesInWords(weights({}))).toBe("You weighted all five equally.");
    expect(prioritiesInWords(weights({ cost: 0.21, comfort: 0.19 }))).toBe("You weighted all five equally.");
  });

  it("names what matters most, and what matters least when that is a clear few", () => {
    expect(prioritiesInWords(weights({ cost: 0.4, family: 0.25, fuel: 0.2, longevity: 0.1, comfort: 0.05 }))).toBe("Cost matters most. Comfort matters least.");
    expect(prioritiesInWords(weights({ cost: 0.3, family: 0.3, fuel: 0.2, longevity: 0.1, comfort: 0.1 }))).toBe(
      "Cost and family fit matter most. Life left and comfort matter least.",
    );
  });

  it("says the rest count about the same when they do", () => {
    expect(prioritiesInWords(weights({ cost: 0.35, family: 0.35, fuel: 0.1, longevity: 0.1, comfort: 0.1 }))).toBe(
      "Cost and family fit matter most. The rest count about the same.",
    );
  });

  it("leaves out the bottom line when it would be a long list", () => {
    expect(prioritiesInWords(weights({ cost: 0.4, family: 0.3, fuel: 0.1, longevity: 0.1, comfort: 0.1 }))).toBe("Cost matters most.");
  });

  it("is only words: no percentages and no digits", () => {
    for (const w of [weights({}), weights({ cost: 0.4, family: 0.1 }), weights({ fuel: 0.5, comfort: 0 })]) {
      expect(prioritiesInWords(w)).not.toMatch(/[0-9%]/);
    }
  });
});

describe("balanceSentence", () => {
  const rows = (leaders: Partial<Record<TradeoffRow["key"], TradeoffRow["leader"]>>): TradeoffRow[] => [
    { key: "cost", label: "Cost", leader: leaders.cost ?? "level" },
    { key: "fuel", label: "Fuel use", leader: leaders.fuel ?? "level" },
    { key: "longevity", label: "Life left", leader: leaders.longevity ?? "level" },
    { key: "family", label: "Family fit", leader: leaders.family ?? "level" },
    { key: "comfort", label: "Comfort", leader: leaders.comfort ?? "level" },
  ];
  const base = { closeCall: true, keepName: "the Camry", switchName: "the RAV4" };

  it("says what balances a cheaper car in a close call, from the rows", () => {
    expect(balanceSentence({ ...base, differenceAmount: 4575, rows: rows({ cost: "keep", fuel: "switch", longevity: "switch" }) })).toBe(
      "The Camry costs less over five years, but the RAV4 is ahead on fuel use and life left, so the other factors balance it out.",
    );
  });

  it("works the other way round when switching is the cheaper one", () => {
    expect(balanceSentence({ ...base, differenceAmount: -800, rows: rows({ cost: "switch", comfort: "keep" }) })).toBe(
      "The RAV4 costs less over five years, but the Camry is ahead on comfort, so the other factors balance it out.",
    );
  });

  it("says nothing it cannot back up", () => {
    // not a close call
    expect(balanceSentence({ ...base, closeCall: false, differenceAmount: 4575, rows: rows({ fuel: "switch" }) })).toBeNull();
    // no cost gap to speak of
    expect(balanceSentence({ ...base, differenceAmount: 0, rows: rows({ fuel: "switch" }) })).toBeNull();
    expect(balanceSentence({ ...base, differenceAmount: null, rows: rows({ fuel: "switch" }) })).toBeNull();
    // the dearer car is not ahead on anything else
    expect(balanceSentence({ ...base, differenceAmount: 4575, rows: rows({ cost: "keep" }) })).toBeNull();
    // the cheaper car leads the others too, so nothing balances it
    expect(balanceSentence({ ...base, differenceAmount: 4575, rows: rows({ cost: "keep", fuel: "keep" }) })).toBeNull();
  });
});

async function startAlex() {
  vi.spyOn(ai, "interpret").mockResolvedValue({ aiAvailable: false });
  await actions().startFromSample("camry-2022-se");
  actions().onRevealStage("done");
}

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

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  resetForkStoreForTests();
  useForkStore.setState({ hydrated: true });
  vi.spyOn(ai, "explain").mockRejectedValue(new Error("no words in this test"));
});

afterEach(() => cleanup());

const rowsShown = () =>
  screen.getAllByTestId("tradeoff-row").map((li) => ({
    key: li.getAttribute("data-factor"),
    label: li.firstElementChild!.textContent,
    who: li.lastElementChild!.textContent,
  }));

describe("RecommendationContent, compared", () => {
  beforeEach(async () => {
    await compareAlex();
  });

  it("leads with the engine's line and the difference over five years, with its source", () => {
    render(<RecommendationContent journey={realCompared()} />);
    expect(state().evaluation?.preferredScenarioId).toBe("inconclusive");
    expect(screen.getByTestId("recommendation-line")).toHaveTextContent("Neither car clearly leads on your priorities.");
    const diff = screen.getByTestId("recommendation-difference");
    expect(diff).toHaveTextContent(/^Switching adds \$[\d,]+ over five years\./);
    expect(diff.querySelectorAll("[data-source]")).toHaveLength(1);
  });

  it("ends with the one concrete next step, in the engine's words, with its detail and its official link", () => {
    render(<RecommendationContent journey={realCompared()} />);
    const action = state().evaluation!.nextAction;
    const section = screen.getByTestId("recommendation-next-step");
    expect(within(section).getByRole("heading", { name: "What to do next" })).toBeInTheDocument();
    expect(within(section).getByTestId("next-step-label")).toHaveTextContent(action.label.replace(/\bdemo\b/gi, "").trim().slice(0, 20));
    expect(within(section).getByTestId("next-step-detail").textContent!.length).toBeGreaterThan(10);
    const link = within(section).queryByRole("link", { name: "Open the official page" });
    if (action.officialLink) {
      expect(link).toHaveAttribute("href", action.officialLink);
      expect(link).toHaveAttribute("rel", "noreferrer");
    } else expect(link).toBeNull();
    expect(section.querySelectorAll("[data-source]")).toHaveLength(1);
  });

  it("lists the five priorities, in order, with who is ahead as the engine scored it", () => {
    render(<RecommendationContent journey={realCompared()} />);
    const { result } = renderHook(() => useTradeoff());
    const tradeoff = result.current!;
    const shown = rowsShown();
    expect(shown.map((r) => r.label)).toEqual(["Cost", "Fuel use", "Life left", "Family fit", "Comfort"]);
    expect(shown.map((r) => r.key)).toEqual(tradeoff.rows.map((r) => r.key));
    for (const [i, row] of tradeoff.rows.entries()) {
      expect(shown[i].who).toBe(row.leader === "keep" ? "The Camry is ahead" : row.leader === "switch" ? "The RAV4 is ahead" : "About level");
    }
    // for Alex: keeping is cheaper; the RAV4 is ahead on fuel use and life left
    expect(shown.find((r) => r.key === "cost")!.who).toBe("The Camry is ahead");
    expect(shown.find((r) => r.key === "fuel")!.who).toBe("The RAV4 is ahead");
    expect(shown.find((r) => r.key === "longevity")!.who).toBe("The RAV4 is ahead");
  });

  it("explains the engine's sentence under the rows", () => {
    render(<RecommendationContent journey={realCompared()} />);
    const { result } = renderHook(() => useTradeoff());
    expect(screen.getByTestId("tradeoff-sentence")).toHaveTextContent(result.current!.sentence);
  });

  it("says the cheaper car is balanced by the other factors in a close call, using the rows", () => {
    render(<RecommendationContent journey={realCompared()} />);
    expect(screen.getByTestId("recommendation-balance")).toHaveTextContent(
      "The Camry costs less over five years, but the RAV4 is ahead on fuel use and life left, so the other factors balance it out.",
    );
  });

  it("says what matters to you in words, with no percentages", () => {
    render(<RecommendationContent journey={realCompared()} />);
    expect(screen.getByRole("heading", { name: "What matters to you" })).toBeInTheDocument();
    expect(screen.getByTestId("priorities-words")).toHaveTextContent("You weighted all five equally.");
    expect(screen.getByTestId("recommendation-content").textContent).not.toMatch(/\d+\s?%/);
  });

  it("follows the priorities you pick, and the verdict that comes with them", () => {
    act(() => actions().pickTradeoff({ pairId: "cost_vs_cargo", choice: "A" }));
    render(<RecommendationContent journey={realCompared()} />);
    expect(screen.getByTestId("priorities-words")).toHaveTextContent("Cost matters most. Family fit matters least.");
    expect(screen.getByTestId("recommendation-line")).toHaveTextContent("Keeping it fits your priorities best.");
    expect(screen.queryByTestId("recommendation-balance")).toBeNull(); // no longer a close call
  });

  it("shows the robustness line once, with a source", () => {
    render(<RecommendationContent journey={realCompared()} />);
    const line = screen.getByTestId("recommendation-robustness");
    expect(line).toHaveTextContent("Held in 9 of 9 tested cases");
    expect(line.querySelectorAll("[data-source]")).toHaveLength(1);
    expect(screen.getAllByText(/Held in 9 of 9 tested cases/)).toHaveLength(1);
  });

  it("keeps the robustness line even when the engine gave no per priority scores", () => {
    act(() => useForkStore.setState({ scores: [] }));
    render(<RecommendationContent journey={realCompared()} />);
    expect(screen.queryByTestId("tradeoff-rows")).toBeNull();
    expect(screen.queryByTestId("recommendation-balance")).toBeNull();
    expect(screen.getByTestId("recommendation-robustness")).toHaveTextContent("Held in 9 of 9 tested cases");
    expect(screen.getByTestId("priorities-words")).toBeInTheDocument();
  });

  it("lists the engine's own rationale lines", () => {
    render(<RecommendationContent journey={realCompared()} />);
    const why = screen.getByTestId("why");
    for (const line of state().evaluation!.rationale.filter((l) => !/^Held in/.test(l))) {
      expect(within(why).getByText(line)).toBeInTheDocument();
    }
  });

  it("puts the AI's words first when there are some", () => {
    act(() => useForkStore.setState({ explanation: { text: "It is close. Fuel use favors the RAV4.", usedFallback: false } }));
    render(<RecommendationContent journey={realCompared()} />);
    expect(screen.getByTestId("why-summary")).toHaveTextContent("It is close. Fuel use favors the RAV4.");
  });

  it("asks before it runs the break-even, then runs it for real", () => {
    render(<RecommendationContent journey={realCompared()} />);
    expect(state().breakEven).toBeNull();
    expect(screen.queryByTestId("change-panel")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show what would change it" }));
    expect(state().breakEven).not.toBeNull();
    expect(state().breakEven!.parameter).toBe("annualMiles");
    expect(screen.getByTestId("change-panel")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show what would change it" })).toBeNull();
  });

  it("shows the break-even straight away when it has already been run", () => {
    act(() => actions().runBreakEven("annualMiles"));
    render(<RecommendationContent journey={realCompared()} />);
    expect(screen.getByTestId("change-panel")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show what would change it" })).toBeNull();
  });

  it("has no em dash, and never says demo or data", () => {
    const { container } = render(<RecommendationContent journey={realCompared()} />);
    fireEvent.click(screen.getByRole("button", { name: "Show what would change it" }));
    const text = words(container);
    expect(text).not.toContain(EM_DASH);
    expect(text).not.toMatch(/demo|data/i);
  });
});

describe("RecommendationContent, before comparing", () => {
  beforeEach(async () => {
    await startAlex();
  });

  it("explains in a line and offers the comparison", () => {
    render(<RecommendationContent journey={journeyOffer} />);
    expect(screen.getByTestId("recommendation-empty")).toHaveTextContent("Compare the two cars and Fork weighs them on what matters to you, or calls it close.");
    expect(screen.queryByTestId("tradeoff-rows")).toBeNull();
    expect(screen.queryByRole("button", { name: "Show what would change it" })).toBeNull();
  });

  it("compares for real from its button", async () => {
    render(<RecommendationContent journey={journeyOffer} />);
    expect(state().comparison).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Compare with the RAV4" }));
    });
    expect(state().comparison).not.toBeNull();
    // and now the same component explains the result
    expect(screen.getAllByTestId("tradeoff-row")).toHaveLength(5);
  });

  it("has no button when there is no other car", () => {
    render(<RecommendationContent journey={{ ...journeyOffer, switch: null }} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
