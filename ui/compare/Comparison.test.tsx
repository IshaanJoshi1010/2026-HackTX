import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecommendationContent } from "@/ui/journey/RecommendationContent";
import { useJourney } from "@/ui/journey/useJourney";
import { ai, data } from "@/ui/mocks";
import { resetForkStoreForTests, useForkStore } from "@/ui/store/useForkStore";
import { ComparisonChange, TermsSection } from "./ComparisonSection";
import { robustnessLine, verdictHeadline } from "./Verdict";

const state = () => useForkStore.getState();
const actions = () => useForkStore.getState().actions;

/** The body of the recommendation drawer, on the real store. */
function Recommendation() {
  const journey = useJourney();
  return journey ? <RecommendationContent journey={journey} /> : null;
}

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
  it("the break-even part renders nothing", () => {
    const { container } = render(<ComparisonChange />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("demo story A on screen", () => {
  it("step 4: a close call, said plainly, with the robustness count and a next step", async () => {
    await demoToComparison();
    const { evaluation, comparison, twin, replacementVehicle } = state();
    expect(
      verdictHeadline({
        evaluation: evaluation!,
        keepId: comparison!.keepId,
        replaceId: comparison!.replaceId,
        keepModel: twin!.vehicle.model,
        replaceModel: replacementVehicle!.model,
      }),
    ).toEqual({ headline: "Close call", line: "Neither car clearly leads on your priorities." });
    expect(robustnessLine(evaluation!)).toBe("Held in 9 of 9 tested cases");
    expect(evaluation!.nextAction.label.length).toBeGreaterThan(0);

    render(<Recommendation />);
    expect(screen.getByTestId("recommendation-line")).toHaveTextContent("Neither car clearly leads on your priorities.");
    expect(screen.getByTestId("recommendation-robustness")).toHaveTextContent("Held in 9 of 9 tested cases");
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
    render(<ComparisonChange />);
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
    await act(async () => {
      state().actions.runBreakEven("annualMiles");
    });
    const next = state().evaluation!.nextAction;
    expect(next.label).toBe("Reevaluate if your driving drops below 14,434 mi/yr");
    expect(`${next.label} ${next.detail}`).toMatch(/modeled break-even/i);
    // the page the person reads leads with it
    render(<Recommendation />);
    expect(screen.getByTestId("break-even-headline")).toHaveTextContent("14,434 mi/yr");
  });

  it("the recommendation's button runs the break-even for real, and hides nothing it already ran", async () => {
    await demoToComparison();
    render(<Recommendation />);
    expect(screen.queryByTestId("break-even")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show what would change it" }));
    expect(state().breakEven).not.toBeNull();
    expect(screen.getByTestId("break-even")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show what would change it" })).toBeNull();
  });

  it("every number in the recommendation sits next to a source label, and none is missing one", async () => {
    await demoToComparison();
    act(() => actions().runBreakEven("annualMiles"));
    render(<Recommendation />);
    const body = screen.getByTestId("recommendation-content");
    expect(body.querySelectorAll("[data-source]").length).toBeGreaterThanOrEqual(5);
    expect(body.querySelector('[data-source="none"]')).toBeNull();
  });

  it("never shows a probability or a confidence", async () => {
    await demoToComparison();
    act(() => actions().runBreakEven("annualMiles"));
    render(<Recommendation />);
    expect(screen.getByTestId("recommendation-content").textContent).not.toMatch(/\d\s?%|probab|confiden|likel/i);
  });

  it("changing an input takes the old threshold away instead of showing a stale one", async () => {
    await demoToComparison();
    render(<ComparisonChange />);
    act(() => actions().runBreakEven("annualMiles"));
    expect(screen.getByTestId("break-even")).toBeInTheDocument();
    act(() => actions().answerQuestion("annualMiles", 16000));
    expect(screen.queryByTestId("break-even")).toBeNull();
    expect(state().breakEven).toBeNull();
  });
});

describe("the Why panel", () => {
  it("leads with the AI summary when AI wrote one, and says where it came from", async () => {
    await demoToComparison();
    vi.mocked(ai.explain).mockResolvedValue({ text: "Keeping and replacing are close.", usedFallback: false });
    act(() => actions().setAssumption("insurancePerMonth", 140)); // new numbers, so new words are asked for
    render(<Recommendation />);
    expect(await screen.findByTestId("why-summary")).toHaveTextContent("Keeping and replacing are close.");
    expect(screen.getByTestId("why-origin")).toHaveTextContent("Written by AI");
    expect(screen.getByTestId("why-origin")).toHaveTextContent("computed values only");
  });

  it("does not show a template-written summary: it only repeats the engine's lines", async () => {
    await demoToComparison();
    vi.mocked(ai.explain).mockResolvedValue({ text: "Template text that repeats every engine line.", usedFallback: true });
    act(() => actions().setAssumption("insurancePerMonth", 140));
    render(<Recommendation />);
    await vi.waitFor(() => expect(state().explanation?.usedFallback).toBe(true));
    expect(screen.queryByTestId("why-summary")).toBeNull();
    expect(screen.queryByText(/Template text/)).toBeNull();
    expect(screen.getByTestId("why-origin")).toHaveTextContent("No AI summary");
  });

  it("still shows the engine's own lines when no summary could be written", async () => {
    await demoToComparison();
    render(<Recommendation />);
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
    render(<ComparisonChange />);
    expect(screen.getByTestId("break-even-headline")).toHaveTextContent("Nothing between 5,000 mi/yr and 40,000 mi/yr changes the answer");
    expect(screen.queryByTestId("break-even-track")).toBeNull();
    expect(screen.queryAllByTestId("break-even-row")).toHaveLength(0);
  });
});

describe("editing the purchase and insurance terms, through the real comparison", () => {
  const netAt60 = (id: string) => useForkStore.getState().results[id].points.find((p) => p.month === 60)!.netEconomicCost;

  it("shows what the sim is really using now, with its own labels, and a down payment above the price in use is refused", async () => {
    await demoToComparison();
    render(<TermsSection />);
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
    render(<TermsSection />);
    const { keepId, replaceId } = useForkStore.getState().comparison!;
    const before = { keep: netAt60(keepId), replace: netAt60(replaceId) };
    const profileBefore = structuredClone(useForkStore.getState().explore.confirmedProfile);

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
    render(<TermsSection />);
    const { keepId } = useForkStore.getState().comparison!;
    const before = netAt60(keepId);
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
    render(
      <>
        <ComparisonChange />
        <TermsSection />
      </>,
    );
    act(() => actions().runBreakEven("annualMiles"));
    expect(screen.getByTestId("break-even")).toBeInTheDocument();
    const verdictBefore = state().evaluation;
    fireEvent.change(screen.getByLabelText(/Insurance per month/), { target: { value: "400" } });
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.queryByTestId("break-even")).toBeNull(); // the old threshold was about the old numbers
    expect(state().breakEven).toBeNull();
    expect(state().evaluation).not.toBeNull();
    expect(state().evaluation).not.toBe(verdictBefore); // it was worked out again on the new terms
  });
});
