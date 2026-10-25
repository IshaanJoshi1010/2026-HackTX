import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LifeEvent } from "@/contracts";
import { ai, data } from "@/ui/mocks";
import { usd } from "@/ui/profile/format";
import { resetForkStoreForTests, useForkStore } from "@/ui/store/useForkStore";
import { DecisionSummary } from "./DecisionSummary";

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

async function startWorkspace() {
  vi.spyOn(ai, "interpret").mockResolvedValue({ aiAvailable: false });
  await actions().startFromSample("camry-2022-se");
  actions().onRevealStage("done");
}

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

/** Alex end to end with no AI: the brain dump, the confirm, then the comparison. */
async function alexCompared() {
  await startWorkspace();
  await actions().submitDump(data.demo.brainDump);
  actions().confirmDrafts(state().explore.draftChanges.map((d) => d.id));
  await actions().openReplaceComparison();
}

async function compareWith(...drafts: Draft[]) {
  await startWorkspace();
  confirm(...drafts);
  await actions().openReplaceComparison();
}

/** What the sim says at month 60, rounded the way the page shows it. */
const net60 = (scenarioId: string) =>
  Math.round(state().results[scenarioId].points.find((p) => p.month === 60)!.netEconomicCost);

const text = (testId: string) => screen.getByTestId(testId).textContent ?? "";
const headline = () => screen.getByTestId("verdict-headline");

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  resetForkStoreForTests();
  useForkStore.setState({ hydrated: true });
  vi.spyOn(ai, "explain").mockRejectedValue(new Error("no words in this test"));
});

afterEach(() => cleanup());

describe("nothing to show without a car", () => {
  it("renders nothing", () => {
    const { container } = render(<DecisionSummary />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("before you compare", () => {
  beforeEach(async () => {
    await startWorkspace();
  });

  it("introduces the page, then says what this is about", () => {
    render(<DecisionSummary />);
    const section = screen.getByRole("region", { name: "Keep or replace" });
    expect(section).toBe(screen.getByTestId("verdict"));
    expect(section).toHaveTextContent("Life takes turns.");
    expect(headline()).toHaveTextContent("Your next five years");
    expect(screen.getByText("Modeled net cost over five years")).toBeInTheDocument();
  });

  it("shows the car you have at month 60 with its source, and not a made-up number for the other car", () => {
    render(<DecisionSummary />);
    const keep = screen.getByTestId("cost-keep");
    expect(keep).toHaveTextContent("Keep your Camry");
    expect(keep).toHaveTextContent(usd(net60(state().activeScenarioId)));
    expect(keep.querySelectorAll("[data-source]")).toHaveLength(1);
    expect(keep.querySelector('[data-source="none"]')).toBeNull();

    const swap = screen.getByTestId("cost-switch");
    expect(swap).toHaveTextContent("Switch to the RAV4");
    expect(swap.textContent).not.toMatch(/\$\d/);
    expect(swap.querySelector("[data-source]")).toBeNull();

    const diff = screen.getByTestId("cost-difference");
    expect(diff).toHaveTextContent("Difference");
    expect(diff).toHaveTextContent("Not compared yet");
    expect(diff.textContent).not.toMatch(/\$\d/);
  });

  it("asks for the comparison in one line and shows no next step yet", () => {
    render(<DecisionSummary />);
    expect(screen.getByTestId("why-sentence")).toHaveTextContent("Compare with the RAV4 to see whether switching makes sense.");
    expect(screen.queryByTestId("next-step")).toBeNull();
    expect(screen.queryByTestId("verdict-robustness")).toBeNull();
  });

  it("the compare button names the other car and runs the comparison", async () => {
    render(<DecisionSummary />);
    const button = screen.getByRole("button", { name: "Compare with the 2024 RAV4 Hybrid XLE" });
    expect(button).toBeEnabled();
    expect(state().comparison).toBeNull();

    fireEvent.click(button);
    await waitFor(() => expect(state().comparison).not.toBeNull());
    expect(state().evaluation).not.toBeNull();

    // the page answers the click: a verdict, two numbers, a next step, and no button any more
    expect(headline().textContent).not.toBe("Your next five years");
    expect(screen.getByTestId("cost-switch")).toHaveTextContent(usd(net60(state().comparison!.replaceId)));
    expect(screen.getByTestId("next-step")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Compare with/ })).toBeNull();
  });

  it("the compare button waits while Fork is busy, and when there is no result to compare", () => {
    render(<DecisionSummary />);
    const button = screen.getByRole("button", { name: "Compare with the 2024 RAV4 Hybrid XLE" });
    act(() => useForkStore.setState((s) => ({ ui: { ...s.ui, busy: "simulating" } })));
    expect(button).toBeDisabled();
    act(() => useForkStore.setState((s) => ({ ui: { ...s.ui, busy: "interpreting" } })));
    expect(button).toBeDisabled();
    act(() => useForkStore.setState((s) => ({ ui: { ...s.ui, busy: "idle" } })));
    expect(button).toBeEnabled();

    act(() => useForkStore.setState({ results: {} }));
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(state().comparison).toBeNull();
  });

  it("names the other car from the sample list when the car is the RAV4", async () => {
    resetForkStoreForTests();
    useForkStore.setState({ hydrated: true });
    await actions().startFromSample("rav4-2024-hybrid-xle");
    actions().onRevealStage("done");
    render(<DecisionSummary />);
    expect(screen.getByTestId("cost-keep")).toHaveTextContent("Keep your RAV4");
    expect(screen.getByRole("button", { name: "Compare with the 2022 Camry SE" })).toBeInTheDocument();
  });
});

describe("a close call", () => {
  beforeEach(async () => {
    await alexCompared();
  });

  it("says Close call as the heading", () => {
    render(<DecisionSummary />);
    expect(state().evaluation?.preferredScenarioId).toBe("inconclusive");
    expect(headline()).toHaveTextContent("Close call");
    expect(headline().tagName).toBe("H2");
  });

  it("shows keep, switch and the difference, each the sim's month 60 number, each with its source", () => {
    render(<DecisionSummary />);
    const { keepId, replaceId } = state().comparison!;
    const keep = net60(keepId);
    const swap = net60(replaceId);

    expect(screen.getByTestId("cost-keep")).toHaveTextContent("Keep your Camry");
    expect(screen.getByTestId("cost-keep")).toHaveTextContent(usd(keep));
    expect(screen.getByTestId("cost-switch")).toHaveTextContent("Switch to the RAV4");
    expect(screen.getByTestId("cost-switch")).toHaveTextContent(usd(swap));
    expect(swap).toBeGreaterThan(keep); // for Alex, switching costs more
    expect(screen.getByTestId("cost-difference")).toHaveTextContent(`Switching adds ${usd(swap - keep)}`);

    for (const id of ["cost-keep", "cost-switch", "cost-difference"]) {
      const column = screen.getByTestId(id);
      expect(column.querySelectorAll("[data-source]"), id).toHaveLength(1);
      expect(column.querySelector('[data-source="none"]'), id).toBeNull();
    }
  });

  it("the difference is the difference between the two numbers beside it, to the dollar", () => {
    render(<DecisionSummary />);
    const { keepId, replaceId } = state().comparison!;
    // "Switch to the RAV4$35,862" has a 4 in RAV4, so read the dollar figure
    const dollars = (id: string) => Number(/\$([\d,]+)/.exec(text(id))![1].replace(/,/g, ""));
    expect(dollars("cost-keep")).toBe(net60(keepId));
    expect(dollars("cost-switch")).toBe(net60(replaceId));
    expect(dollars("cost-difference")).toBe(dollars("cost-switch") - dollars("cost-keep"));
  });

  it("explains why in words from the engine's scores, with the next step right under it", () => {
    render(<DecisionSummary />);
    expect(screen.getByTestId("why-sentence")).toHaveTextContent(
      "Keeping the Camry is ahead on cost. The RAV4 is ahead on fuel use and life left. " +
        "Weighted by what you said matters, they balance out within Fork's margin, so neither car clearly leads.",
    );
    const sentence = screen.getByTestId("why-sentence");
    const next = screen.getByTestId("next-step");
    expect(sentence.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("verdict")).toContainElement(next);
    expect(screen.getByTestId("next-step-label").textContent).toBe(state().evaluation!.nextAction.label);
  });

  it("keeps the order: intro, heading, costs, why, next step", () => {
    render(<DecisionSummary />);
    const order = ["Life takes turns.", "verdict-headline", "cost-keep", "cost-switch", "cost-difference", "why-sentence", "next-step"].map((k) =>
      k.includes("-") ? screen.getByTestId(k) : screen.getByText(k),
    );
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING, `${i}`).toBeTruthy();
    }
  });

  it("does not show the held-in-tested-cases line or a recommendation tag", () => {
    render(<DecisionSummary />);
    expect(screen.getByTestId("verdict").textContent).not.toMatch(/held in|tested case|\d of \d/i);
    expect(screen.queryByTestId("verdict-robustness")).toBeNull();
    expect(screen.queryByText("Recommended")).toBeNull();
    expect(screen.queryByText("Alternative")).toBeNull();
  });
});

describe("when the engine picks a car", () => {
  it("the other car: heading and words say switch, and the numbers are still the sim's", async () => {
    await compareWith(draft("mileage_change", 0, { annualMiles: 30000 }, "30,000 miles a year"));
    render(<DecisionSummary />);
    const { keepId, replaceId } = state().comparison!;
    expect(state().evaluation?.preferredScenarioId).toBe(replaceId);
    expect(headline()).toHaveTextContent("Switch to the RAV4");
    expect(screen.getByTestId("cost-keep")).toHaveTextContent(usd(net60(keepId)));
    expect(screen.getByTestId("cost-switch")).toHaveTextContent(usd(net60(replaceId)));
    expect(screen.getByTestId("why-sentence").textContent).toMatch(/so the RAV4 comes out ahead by more than Fork's margin\.$/);
    // the verdict is about priorities, not only dollars: the RAV4 can win and still cost more
    expect(net60(replaceId)).toBeGreaterThan(net60(keepId));
    expect(screen.getByTestId("cost-difference")).toHaveTextContent(`Switching adds ${usd(net60(replaceId) - net60(keepId))}`);
  });

  it("keeping: heading says keep your car", async () => {
    await compareWith(draft("mileage_change", 0, { annualMiles: 8000 }, "8,000 miles a year"));
    render(<DecisionSummary />);
    expect(state().evaluation?.preferredScenarioId).toBe(state().comparison!.keepId);
    expect(headline()).toHaveTextContent("Keep your Camry");
    expect(screen.getByTestId("why-sentence").textContent).toMatch(/so keeping the Camry comes out ahead by more than Fork's margin\.$/);
    expect(screen.getByTestId("next-step")).toBeInTheDocument();
  });

  it("switching can save money, and then the difference says saves", async () => {
    await compareWith(
      draft("mileage_change", 0, { annualMiles: 60000 }, "60,000 miles a year"),
      draft("fuel_price_change", 0, { fuelPricePerGal: 8 }, "gas at $8"),
    );
    render(<DecisionSummary />);
    const { keepId, replaceId } = state().comparison!;
    const keep = net60(keepId);
    const swap = net60(replaceId);
    expect(swap).toBeLessThan(keep);
    expect(screen.getByTestId("cost-difference")).toHaveTextContent(`Switching saves ${usd(keep - swap)}`);
    expect(screen.getByTestId("cost-difference").textContent).not.toMatch(/adds/);
  });

  it("two equal numbers say no difference", async () => {
    await alexCompared();
    const { keepId, replaceId } = state().comparison!;
    useForkStore.setState((s) => {
      const keepEnd = s.results[keepId].points.find((p) => p.month === 60)!;
      const replace = s.results[replaceId];
      return {
        results: {
          ...s.results,
          [replaceId]: { ...replace, points: replace.points.map((p) => (p.month === 60 ? { ...p, netEconomicCost: keepEnd.netEconomicCost } : p)) },
        },
      };
    });
    render(<DecisionSummary />);
    expect(screen.getByTestId("cost-difference")).toHaveTextContent("No difference");
    expect(screen.getByTestId("cost-difference").textContent).not.toMatch(/adds|saves/);
    expect(screen.getByTestId("cost-difference").querySelector("[data-source]")).not.toBeNull();
  });

  it("a hard limit is explained in plain words under the heading", async () => {
    await compareWith(draft("family_change", 12, { householdSize: 6 }, "six of us"));
    render(<DecisionSummary />);
    expect(screen.getByTestId("why-sentence")).toHaveTextContent("A hard limit rules out both cars: each one doesn't have enough seats for your household.");
    expect(headline()).toHaveTextContent("Close call");
  });
});

describe("it follows the store", () => {
  it("new priorities change the heading, the words and the next step together, and never the numbers", async () => {
    await alexCompared();
    render(<DecisionSummary />);
    const { keepId, replaceId } = state().comparison!;
    const before = { keep: net60(keepId), swap: net60(replaceId) };
    expect(headline()).toHaveTextContent("Close call");

    act(() => actions().pickTradeoff({ pairId: "cost_vs_cargo", choice: "B" }));
    expect(headline()).toHaveTextContent("Switch to the RAV4");
    expect(screen.getByTestId("why-sentence").textContent).toMatch(/so the RAV4 comes out ahead/);

    act(() => actions().pickTradeoff({ pairId: "cost_vs_cargo", choice: "A" }));
    expect(headline()).toHaveTextContent("Keep your Camry");
    expect(screen.getByTestId("why-sentence").textContent).toMatch(/so keeping the Camry comes out ahead/);

    expect(net60(keepId)).toBe(before.keep);
    expect(net60(replaceId)).toBe(before.swap);
    expect(screen.getByTestId("cost-keep")).toHaveTextContent(usd(before.keep));
    expect(screen.getByTestId("cost-switch")).toHaveTextContent(usd(before.swap));
  });

  it("scrubbing time does not move the five year numbers", async () => {
    await alexCompared();
    render(<DecisionSummary />);
    const before = text("cost-keep") + text("cost-switch") + text("cost-difference");
    act(() => actions().setActiveMonth(18));
    expect(text("cost-keep") + text("cost-switch") + text("cost-difference")).toBe(before);
  });
});

describe("words and controls", () => {
  const everything = (root: HTMLElement) =>
    [root.textContent ?? "", ...[...root.querySelectorAll("[aria-label],[title],[placeholder]")].flatMap((el) => [
      el.getAttribute("aria-label") ?? "",
      el.getAttribute("title") ?? "",
      el.getAttribute("placeholder") ?? "",
    ])].join("\n");

  it("never says demo or data, and has no em dash, before or after comparing", async () => {
    await startWorkspace();
    const { container } = render(<DecisionSummary />);
    const check = () => {
      const all = everything(container);
      expect(all).not.toMatch(/\bdemo\b/i);
      expect(all).not.toMatch(/\bdata\b/i);
      expect(all).not.toMatch(/[\u2014\u2013]/);
    };
    check();
    await act(async () => {
      await actions().openReplaceComparison();
    });
    check();
  });

  it("has only the one control, and it is the compare button", async () => {
    await startWorkspace();
    render(<DecisionSummary />);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Compare with the 2024 RAV4 Hybrid XLE"]);
    await act(async () => {
      await actions().openReplaceComparison();
    });
    expect(screen.queryAllByRole("button").map((b) => b.textContent)).toEqual([]);
  });

  it("gives the compare button the shared focus ring", async () => {
    await startWorkspace();
    render(<DecisionSummary />);
    const classes = screen.getByRole("button").className;
    expect(classes).toContain("focus-visible:outline-2");
    expect(classes).toContain("focus-visible:outline-offset-2");
    expect(classes).toContain("focus-visible:outline-ink");
  });
});
