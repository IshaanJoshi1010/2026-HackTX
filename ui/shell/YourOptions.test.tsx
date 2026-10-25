import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LifeEvent } from "@/contracts";
import { usd } from "@/ui/profile/format";
import { BASE_ID, resetForkStoreForTests, useForkStore } from "@/ui/store/useForkStore";
import { DecisionList } from "./DecisionList";
import { YourOptions } from "./YourOptions";

const state = () => useForkStore.getState();
const actions = () => useForkStore.getState().actions;

type Draft = Omit<LifeEvent, "id" | "status">;
const draft = (type: LifeEvent["type"], month: number, payload: LifeEvent["payload"]): Draft => ({ type, month, payload, source: "user", assumptions: [], certainty: "clear" });
const MOVE = draft("relocation", 12, { location: "Denver" });
const MILES = draft("mileage_change", 12, { annualMiles: 30000 });

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

const net = (id: string, month = 60) => state().results[id].points.find((p) => p.month === month)!.netEconomicCost;

beforeEach(async () => {
  vi.restoreAllMocks();
  localStorage.clear();
  resetForkStoreForTests();
  useForkStore.setState({ hydrated: true });
  await actions().startFromSample("camry-2022-se");
  actions().onRevealStage("done");
});

afterEach(() => cleanup());

describe("your options, before you compare", () => {
  it("shows keeping, priced, and the other car as an offer you can take", () => {
    render(<YourOptions />);
    const keep = screen.getByTestId("option-keep");
    expect(keep).toHaveTextContent("Keep your 2022 Camry");
    expect(keep).toHaveTextContent("If nothing changes");
    expect(keep).toHaveTextContent(usd(net(BASE_ID)));
    expect(keep).toHaveTextContent("Net cost, 5 yr");
    expect(keep.querySelector("[data-source]")).not.toBeNull(); // the number says where it came from

    const other = screen.getByTestId("option-replace");
    expect(other).toHaveTextContent("Switch to a 2024 RAV4 Hybrid XLE");
    expect(other).toHaveTextContent("Not priced yet");
    expect(within(other).getByRole("button", { name: "Compare with a 2024 RAV4 Hybrid XLE" })).toBeEnabled();
    expect(other.textContent).not.toMatch(/\$\d/); // no price is made up for a car nobody has priced
    expect(screen.queryByText("Fork's pick")).toBeNull();
  });

  it("the compare button really compares", async () => {
    render(<YourOptions />);
    expect(state().comparison).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Compare with a 2024 RAV4/ }));
    });
    expect(state().comparison).not.toBeNull();
    expect(state().evaluation).not.toBeNull();
  });

  it("names the branch you are looking at, and follows the month you scrub to", () => {
    confirm(MOVE, MILES);
    render(<YourOptions />);
    const keep = screen.getByTestId("option-keep");
    expect(keep).toHaveTextContent("Move to Denver + 1 more");
    expect(keep).toHaveTextContent(usd(net(state().activeScenarioId)));
    act(() => actions().setActiveMonth(24));
    expect(keep).toHaveTextContent("Net cost, 2 yr");
    expect(keep).toHaveTextContent(usd(net(state().activeScenarioId, 24)));
  });
});

describe("your options, side by side", () => {
  it("both are priced, the difference is the real one, and each number has its source", async () => {
    await compare();
    render(<YourOptions />);
    const { keepId, replaceId } = state().comparison!;
    const keep = screen.getByTestId("option-keep");
    const replace = screen.getByTestId("option-replace");
    expect(keep).toHaveTextContent(usd(net(keepId)));
    expect(replace).toHaveTextContent(usd(net(replaceId)));
    expect(replace).toHaveTextContent("Switch to a 2024 RAV4 Hybrid XLE");
    expect(replace).toHaveTextContent(/Swap (now|in \d)/);

    const diff = net(replaceId) - net(keepId);
    const text = within(replace).getByTestId("option-difference").textContent!;
    expect(text).toContain(diff >= 0 ? `Adds ${usd(Math.round(diff))}` : `Saves ${usd(Math.round(-diff))}`);
    expect(text).toContain("vs keeping");
    for (const card of [keep, replace]) expect(card.querySelector("[data-source]")).not.toBeNull();
    // the offer is gone once it is priced
    expect(screen.queryByRole("button", { name: /Compare with a/ })).toBeNull();
  });

  it("marks the engine's pick, and only that", async () => {
    await compare();
    render(<YourOptions />);
    const preferred = state().evaluation!.preferredScenarioId;
    const picks = screen.queryAllByText("Fork's pick");
    if (preferred === "inconclusive") {
      expect(picks).toHaveLength(0); // a close call is not dressed up as a pick
    } else {
      expect(picks).toHaveLength(1);
      const card = screen.getByTestId(preferred === state().comparison!.keepId ? "option-keep" : "option-replace");
      expect(card).toHaveTextContent("Fork's pick");
    }
  });

  it("looks at the option you pick, so the road and the car follow", async () => {
    await compare();
    render(<YourOptions />);
    const { keepId, replaceId } = state().comparison!;
    const keepCard = screen.getByTestId("option-keep"), replaceCard = screen.getByTestId("option-replace");
    expect(within(replaceCard).getByRole("button", { pressed: true })).toBeInTheDocument(); // compare makes the replace future active
    fireEvent.click(within(keepCard).getByRole("button"));
    expect(state().activeScenarioId).toBe(keepId);
    expect(within(keepCard).getByRole("button")).toHaveAttribute("aria-pressed", "true");
    expect(within(replaceCard).getByRole("button")).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(within(replaceCard).getByRole("button"));
    expect(state().activeScenarioId).toBe(replaceId);
    // the car on stage morphs to the car in that option
    expect(state().stage.phase).toBe("transition");
    expect(state().stage.transitionTo?.id).toBe(state().replacementVehicle!.id);
  });

  it("does not read a price off a month with no projection", async () => {
    await compare();
    render(<YourOptions />);
    act(() => useForkStore.setState({ activeMonth: 0 })); // today: the cards measure the whole five years
    expect(screen.getByTestId("option-keep")).toHaveTextContent("Net cost, 5 yr");
  });
});

describe("what you told Fork", () => {
  it("starts empty and tells you how to fill it", () => {
    render(<DecisionList />);
    expect(screen.getByTestId("decision-list")).toHaveTextContent("Nothing yet, so nothing has changed.");
    expect(screen.queryAllByTestId("decision-effect")).toHaveLength(0);
  });

  it("lists each change, with dollars where it costs and a plain note where it does not", () => {
    confirm(MOVE, MILES);
    render(<DecisionList />);
    const rows = screen.getAllByTestId("decision-effect");
    expect(rows).toHaveLength(2);
    const move = rows.find((r) => r.textContent!.includes("Move to Denver"))!;
    const miles = rows.find((r) => r.textContent!.includes("30,000 miles a year"))!;
    expect(within(move).getByTestId("no-cost-note")).toHaveTextContent("No change to cost.");
    expect(move.querySelector("[data-source]")).toBeNull(); // no number, so nothing to label
    expect(miles.textContent).toMatch(/(Adds|Saves) \$[\d,]+/);
    expect(miles.querySelector("[data-source]")).not.toBeNull();
    expect(screen.getByTestId("decision-list")).toHaveTextContent("by 5 yr");
  });

  it("has no em dashes anywhere on the options or the list", async () => {
    confirm(MOVE, MILES);
    await compare();
    const { container } = render(
      <>
        <DecisionList />
        <YourOptions />
      </>,
    );
    expect(container.textContent).not.toContain("—");
  });
});
