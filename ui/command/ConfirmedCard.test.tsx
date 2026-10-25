import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LifeEvent } from "@/contracts";
import { resetForkStoreForTests, useForkStore } from "@/ui/store/useForkStore";
import { CommandBox } from "./CommandBox";
import { ConfirmedCard } from "./ConfirmedCard";

const state = () => useForkStore.getState();
const actions = () => useForkStore.getState().actions;

type Draft = Omit<LifeEvent, "id" | "status">;
const draft = (type: LifeEvent["type"], month: number, payload: LifeEvent["payload"]): Draft => ({
  type, month, payload, source: "user", assumptions: [], certainty: "clear",
});
const MOVE = draft("relocation", 12, { location: "Denver" });
const MILES = draft("mileage_change", 12, { annualMiles: 30000 });
const KID = draft("family_change", 30, { childrenDelta: 1 }); // children only: a hand-built no-cost event

function stage(...drafts: Draft[]): string[] {
  return drafts.map((d) => {
    actions().addDraft(d);
    const all = state().explore.draftChanges;
    return all[all.length - 1].id;
  });
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

describe("the confirm card after confirming", () => {
  it("shows nothing before anything is confirmed, and proposals do not count", () => {
    stage(MOVE);
    render(<ConfirmedCard />);
    expect(screen.queryByTestId("confirmed-card")).toBeNull();
    expect(state().receipt).toBeNull();
  });

  it("says no change to cost for a move and for a child, and shows dollars for a driving change", () => {
    const ids = stage(MOVE, MILES, KID);
    act(() => actions().confirmDrafts(ids));
    render(<ConfirmedCard />);

    const rows = screen.getAllByTestId(/^confirmed-row-/);
    expect(rows).toHaveLength(3);
    const byText = (t: string) => rows.find((r) => r.textContent?.includes(t))!;

    const move = byText("Move to Denver");
    expect(within(move).getByTestId("no-cost-note")).toHaveTextContent("No change to cost.");
    expect(within(move).queryByTestId("confirmed-cost")).toBeNull();

    const kid = byText("New child");
    expect(within(kid).getByTestId("no-cost-note")).toHaveTextContent("No change to cost.");
    expect(within(kid).getByTestId("no-cost-note")).toHaveTextContent(/Household goes from \d+ to \d+ people/);

    const miles = byText("30,000 miles a year");
    expect(within(miles).queryByTestId("no-cost-note")).toBeNull();
    expect(within(miles).getByTestId("confirmed-cost")).toHaveTextContent(/^(Adds|Saves) \$[\d,]+/);
    expect(within(miles).getByTestId("confirmed-cost").querySelector("[data-source]") ?? within(miles).getByTestId("confirmed-cost").children[1]).toBeTruthy(); // the source badge sits under the amount
  });

  it("the dollars match what the future really costs: the amount is the real difference", () => {
    const ids = stage(MILES);
    act(() => actions().confirmDrafts(ids));
    const child = state().explore.scenarios[1];
    const without = state().results[child.id].summary.netCost; // with it
    render(<ConfirmedCard />);
    const text = screen.getByTestId("confirmed-cost").textContent!;
    const shown = Number(/\$([\d,]+)/.exec(text)![1].replace(/,/g, ""));
    const base = state().results["base"].summary.netCost;
    expect(shown).toBe(Math.abs(Math.round(without - base)));
  });

  it("is dismissed by its own button, and a new sentence clears it", async () => {
    act(() => actions().confirmDrafts(stage(MOVE)));
    render(<ConfirmedCard />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(state().receipt).toBeNull();
    expect(screen.queryByTestId("confirmed-card")).toBeNull();

    act(() => actions().confirmDrafts(stage(KID)));
    expect(state().receipt).not.toBeNull();
    await act(async () => {
      await actions().submitDump("hello there");
    });
    expect(state().receipt).toBeNull();
  });

  it("goes away when another future is picked, and stays when the same one is", () => {
    act(() => actions().confirmDrafts(stage(MOVE)));
    const child = state().activeScenarioId;
    act(() => actions().setActiveScenario(child));
    expect(state().receipt).not.toBeNull();
    act(() => actions().setActiveScenario("base"));
    expect(state().receipt).toBeNull();
  });

  it("appears in the command box after Branch timeline, and not while proposals wait", () => {
    stage(MOVE);
    render(<CommandBox />);
    expect(screen.queryByTestId("confirmed-card")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /branch timeline/i }));
    expect(screen.getByTestId("confirmed-card")).toHaveTextContent("1 change added");
    expect(screen.queryByTestId("confirm-proposal-card")).toBeNull();
  });
});
