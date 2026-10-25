import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ai, data } from "@/ui/mocks";
import { resetForkStoreForTests, useForkStore } from "@/ui/store/useForkStore";
import { ComparisonSection } from "./ComparisonSection";

const state = () => useForkStore.getState();
const actions = () => useForkStore.getState().actions;

/** The demo, end to end with no AI: the sentence, the offline rules, the confirm, the comparison. */
async function demoToComparison() {
  vi.spyOn(ai, "interpret").mockResolvedValue({ aiAvailable: false });
  await actions().startFromSample("camry-2022-se");
  actions().onRevealStage("done");
  expect(await actions().submitDump(data.demo.brainDump)).toMatchObject({ kind: "proposed" });
  actions().confirmDrafts(state().explore.draftChanges.map((d) => d.id));
  await actions().submitDump("Would switching to a RAV4 Hybrid make more sense?");
}

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  resetForkStoreForTests();
  useForkStore.setState({ hydrated: true });
  vi.spyOn(ai, "explain").mockRejectedValue(new Error("no words in this test"));
});

afterEach(() => cleanup());

describe("nothing to show before you compare", () => {
  it("renders nothing", () => {
    const { container } = render(<ComparisonSection />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("demo story A on screen", () => {
  it("step 4: a close call, said plainly, with the robustness count and a next step", async () => {
    await demoToComparison();
    render(<ComparisonSection />);
    expect(screen.getByTestId("verdict-headline")).toHaveTextContent("Close call");
    expect(screen.getByTestId("verdict")).toHaveTextContent("Neither car clearly leads on your priorities.");
    expect(screen.getByTestId("verdict-robustness")).toHaveTextContent("Held in 9 of 9 tested cases");
    expect(screen.getByTestId("next-step")).toBeInTheDocument();
    expect(screen.queryByText("Inconclusive")).toBeNull(); // the engine's word, not ours
  });

  it("the offline rules gave the pinned events, so the verdict is the pinned verdict", async () => {
    await demoToComparison();
    const { evaluation, results, comparison } = state();
    expect(evaluation?.preferredScenarioId).toBe("inconclusive");
    // sim/DEMO.md: keeping about $31.3k, replacing about $35.9k over five years
    expect(Math.round(results[comparison!.keepId].summary.netCost)).toBe(31287);
    expect(Math.round(results[comparison!.replaceId].summary.netCost)).toBe(35862);
  });

  it("step 5: 'what would change it' shows the threshold, where you are, and both sides of it", async () => {
    await demoToComparison();
    render(<ComparisonSection />);
    expect(screen.queryByTestId("break-even")).toBeNull(); // nothing until it is asked for

    await act(async () => {
      await actions().submitDump("What would have to change for keeping the Camry to be the better option?");
    });
    const viz = screen.getByTestId("break-even");
    expect(within(viz).getByTestId("break-even-headline")).toHaveTextContent("Keeping the Camry wins below 14,434 mi/yr");
    expect(within(viz).getByTestId("break-even-threshold")).toHaveTextContent("14,434 mi/yr");
    expect(within(viz).getByTestId("break-even-today")).toHaveTextContent("You");
    expect(viz).toHaveTextContent("In this plan: 20,000 mi/yr");

    const rows = within(viz).getAllByTestId("break-even-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("just below");
    expect(rows[0]).toHaveTextContent("Keeping the Camry leads");
    expect(rows[1]).toHaveTextContent("just above");
    expect(rows[1]).toHaveTextContent("No clear winner");
    // the checked costs are the engine's, in dollars
    expect(rows[0]).toHaveTextContent(/Keep \$[\d,]+ · Replace \$[\d,]+/);
  });

  it("step 6: the next step names the threshold", async () => {
    await demoToComparison();
    render(<ComparisonSection />);
    await act(async () => {
      state().actions.runBreakEven("annualMiles");
    });
    expect(screen.getByTestId("next-step-label")).toHaveTextContent("Reevaluate if your driving drops below 14,434 mi/yr");
    expect(screen.getByTestId("next-step")).toHaveTextContent(/modeled break-even/i);
  });

  it("the toggle runs the break-even the first time, and hides and shows it after that", async () => {
    await demoToComparison();
    render(<ComparisonSection />);
    const toggle = screen.getByRole("button", { name: "What would change it" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(toggle);
    expect(state().breakEven).not.toBeNull();
    expect(screen.getByTestId("break-even")).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(toggle);
    expect(screen.queryByTestId("break-even")).toBeNull();
    expect(state().breakEven).not.toBeNull(); // hidden, not thrown away
    fireEvent.click(toggle);
    expect(screen.getByTestId("break-even")).toBeInTheDocument();
  });

  it("what you open scrolls into view, so it never opens out of sight under the road", async () => {
    const scrolls: string[] = [];
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolls.push(this.querySelector("[data-testid]")?.getAttribute("data-testid") ?? "?");
    };
    try {
      await demoToComparison();
      render(<ComparisonSection />);
      fireEvent.click(screen.getByRole("button", { name: "What would change it" }));
      expect(scrolls).toEqual(["break-even"]);
      fireEvent.click(screen.getByRole("button", { name: "Why" }));
      expect(scrolls).toEqual(["break-even", "why"]);
      // closing and reopening scrolls again; a plain re-render does not
      fireEvent.click(screen.getByRole("button", { name: "Why" }));
      fireEvent.click(screen.getByRole("button", { name: "Why" }));
      expect(scrolls).toEqual(["break-even", "why", "why"]);
    } finally {
      // @ts-expect-error jsdom has no scrollIntoView; remove what this test added
      delete Element.prototype.scrollIntoView;
    }
  });

  it("every number on the page sits next to a source label, and none is missing one", async () => {
    await demoToComparison();
    render(<ComparisonSection />);
    fireEvent.click(screen.getByRole("button", { name: "What would change it" }));
    fireEvent.click(screen.getByRole("button", { name: "Why" }));
    const section = screen.getByTestId("comparison");
    expect(section.querySelectorAll("[data-source]").length).toBeGreaterThanOrEqual(5);
    expect(section.querySelector('[data-source="none"]')).toBeNull();
  });

  it("never shows a probability or a confidence", async () => {
    await demoToComparison();
    render(<ComparisonSection />);
    fireEvent.click(screen.getByRole("button", { name: "What would change it" }));
    fireEvent.click(screen.getByRole("button", { name: "Why" }));
    expect(screen.getByTestId("comparison").textContent).not.toMatch(/\d\s?%|probab|confiden|likel/i);
  });

  it("changing an input takes the old threshold away instead of showing a stale one", async () => {
    await demoToComparison();
    render(<ComparisonSection />);
    fireEvent.click(screen.getByRole("button", { name: "What would change it" }));
    expect(screen.getByTestId("break-even")).toBeInTheDocument();
    act(() => actions().answerQuestion("annualMiles", 16000));
    expect(screen.queryByTestId("break-even")).toBeNull();
    expect(screen.getByRole("button", { name: "What would change it" })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("the Why panel", () => {
  it("leads with the AI summary when AI wrote one, and says where it came from", async () => {
    await demoToComparison();
    vi.mocked(ai.explain).mockResolvedValue({ text: "Keeping and replacing are close.", usedFallback: false });
    act(() => actions().setAssumption("insurancePerMonth", 140)); // new numbers, so new words are asked for
    render(<ComparisonSection />);
    fireEvent.click(screen.getByRole("button", { name: "Why" }));
    expect(await screen.findByTestId("why-summary")).toHaveTextContent("Keeping and replacing are close.");
    expect(screen.getByTestId("why-origin")).toHaveTextContent("Written by AI");
    expect(screen.getByTestId("why-origin")).toHaveTextContent("computed values only");
  });

  it("does not show a template-written summary: it only repeats the engine's lines", async () => {
    await demoToComparison();
    vi.mocked(ai.explain).mockResolvedValue({ text: "Template text that repeats every engine line.", usedFallback: true });
    act(() => actions().setAssumption("insurancePerMonth", 140));
    render(<ComparisonSection />);
    fireEvent.click(screen.getByRole("button", { name: "Why" }));
    await vi.waitFor(() => expect(state().explanation?.usedFallback).toBe(true));
    expect(screen.queryByTestId("why-summary")).toBeNull();
    expect(screen.queryByText(/Template text/)).toBeNull();
    expect(screen.getByTestId("why-origin")).toHaveTextContent("No AI summary");
  });

  it("still shows the engine's own lines when no summary could be written", async () => {
    await demoToComparison();
    render(<ComparisonSection />);
    fireEvent.click(screen.getByRole("button", { name: "Why" }));
    expect(screen.queryByTestId("why-summary")).toBeNull();
    expect(screen.getByTestId("why")).toHaveTextContent(/Net economic cost over 60 months/);
    expect(screen.getByTestId("why").querySelectorAll("li").length).toBeGreaterThanOrEqual(5);
  });
});

describe("when nothing flips", () => {
  it("says so plainly, with the range that was tested", async () => {
    await demoToComparison();
    useForkStore.setState({
      breakEven: { found: false, parameter: "annualMiles", reason: "no_threshold_within_bounds", testedBounds: [5000, 40000] },
      breakEvenCheck: null,
    });
    useForkStore.setState((s) => ({ ui: { ...s.ui, futureBreakEven: true } }));
    render(<ComparisonSection />);
    expect(screen.getByTestId("break-even-headline")).toHaveTextContent("Nothing between 5,000 mi/yr and 40,000 mi/yr changes the answer");
    expect(screen.queryByTestId("break-even-track")).toBeNull();
    expect(screen.queryAllByTestId("break-even-row")).toHaveLength(0);
  });
});

describe("editing the purchase and insurance terms, through the real comparison", () => {
  const netAt60 = (id: string) => useForkStore.getState().results[id].points.find((p) => p.month === 60)!.netEconomicCost;
  const open = () => fireEvent.click(screen.getByRole("button", { name: "Edit terms" }));

  it("shows what the sim is really using now, with its own labels, and a down payment above the price in use is refused", async () => {
    await demoToComparison();
    render(<ComparisonSection />);
    open();
    const form = screen.getByTestId("terms-review");
    expect(form).toHaveTextContent(/Now \$130 a month/); // insurance, from the sim's own report
    expect(form).toHaveTextContent(/Now 60 months/);
    expect(form.querySelector('[data-source="none"]')).toBeNull();
    fireEvent.change(screen.getByLabelText(/Down payment/), { target: { value: "9999999" } });
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.getByTestId("terms-problem")).toHaveTextContent(/more than the purchase price in use/);
  });

  it("nothing changes until the confirm; then every future carries the terms and the numbers move", async () => {
    await demoToComparison();
    render(<ComparisonSection />);
    const { keepId, replaceId } = useForkStore.getState().comparison!;
    const before = { keep: netAt60(keepId), replace: netAt60(replaceId) };
    const profileBefore = structuredClone(useForkStore.getState().explore.confirmedProfile);

    open();
    fireEvent.change(screen.getByLabelText(/Insurance per month/), { target: { value: "400" } });
    fireEvent.change(screen.getByLabelText(/Replacement purchase price/), { target: { value: "45000" } });
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.getByTestId("terms-review-step")).toBeInTheDocument();
    expect(netAt60(keepId)).toBe(before.keep); // reviewing changes nothing
    expect(useForkStore.getState().explore.scenarios.every((s) => s.assumptions.insurancePerMonth === undefined)).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    const scenarios = useForkStore.getState().explore.scenarios;
    expect(scenarios.every((s) => s.assumptions.insurancePerMonth === 400)).toBe(true);
    expect(netAt60(keepId)).toBeGreaterThan(before.keep);
    expect(netAt60(replaceId)).toBeGreaterThan(before.replace);
    expect(useForkStore.getState().explore.confirmedProfile).toEqual(profileBefore); // exploring is not changing
    expect(screen.getByTestId("terms-in-effect")).toHaveTextContent(/Insurance per month \$400 a month/);
    expect(screen.getByTestId("terms-in-effect")).toHaveTextContent(/Replacement purchase price \$45,000/);
  });

  it("back to estimates puts the numbers back where they were", async () => {
    await demoToComparison();
    render(<ComparisonSection />);
    const { keepId } = useForkStore.getState().comparison!;
    const before = netAt60(keepId);
    open();
    fireEvent.change(screen.getByLabelText(/Insurance per month/), { target: { value: "400" } });
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(netAt60(keepId)).not.toBeCloseTo(before, 6);
    fireEvent.click(screen.getByRole("button", { name: "Back to estimates" }));
    expect(netAt60(keepId)).toBeCloseTo(before, 6);
    expect(screen.queryByTestId("terms-in-effect")).toBeNull();
  });

  it("changing the terms clears a stale threshold and re-runs the verdict", async () => {
    await demoToComparison();
    render(<ComparisonSection />);
    fireEvent.click(screen.getByRole("button", { name: "What would change it" }));
    expect(screen.getByTestId("break-even")).toBeInTheDocument();
    open();
    fireEvent.change(screen.getByLabelText(/Insurance per month/), { target: { value: "400" } });
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.queryByTestId("break-even")).toBeNull(); // the old threshold was about the old numbers
    expect(screen.getByTestId("verdict")).toBeInTheDocument();
  });
});
