import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LifeEvent } from "@/contracts";
import { BASE_ID, resetForkStoreForTests, useForkStore } from "@/ui/store/useForkStore";
import { FutureSelector } from "./FutureSelector";

const state = () => useForkStore.getState();
const actions = () => useForkStore.getState().actions;

type Draft = Omit<LifeEvent, "id" | "status">;
const draft = (type: LifeEvent["type"], month: number, payload: LifeEvent["payload"]): Draft => ({ type, month, payload, source: "user", assumptions: [], certainty: "clear" });
function confirm(d: Draft) {
  act(() => {
    actions().addDraft(d);
    actions().confirmDrafts([state().explore.draftChanges.at(-1)!.id]);
  });
}
const select = () => screen.getByTestId("future-selector") as HTMLSelectElement;
const optionTexts = () => [...select().options].map((o) => o.textContent);

beforeEach(async () => {
  vi.restoreAllMocks();
  localStorage.clear();
  resetForkStoreForTests();
  useForkStore.setState({ hydrated: true });
  await actions().startFromSample("camry-2022-se");
  actions().onRevealStage("done");
});
afterEach(() => cleanup());

describe("the future selector", () => {
  it("is not there while there is only one future to look at", () => {
    const { container } = render(<FutureSelector />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists each life you have made, by name, and the plain baseline as 'If nothing changes'", () => {
    confirm(draft("relocation", 12, { location: "Denver" }));
    render(<FutureSelector />);
    expect(optionTexts()).toEqual(["If nothing changes", "Move to Denver"]);
    expect(screen.getByLabelText("Future")).toBe(select());
    expect(select().value).toBe(state().activeScenarioId);
  });

  it("never lists the other car as a future: that is the fork's choice, not a life", async () => {
    confirm(draft("relocation", 12, { location: "Denver" }));
    await act(async () => {
      await actions().openReplaceComparison();
    });
    render(<FutureSelector />);
    expect(optionTexts()).toEqual(["If nothing changes", "Move to Denver"]);
    expect(optionTexts().join(" ")).not.toMatch(/RAV4|Replace/);
    // looking at the RAV4 future still shows the life it belongs to
    expect(state().activeScenarioId).toBe(state().comparison!.replaceId);
    expect(select().value).toBe(state().comparison!.keepId);
  });

  it("choosing a life looks at it", () => {
    confirm(draft("relocation", 12, { location: "Denver" }));
    render(<FutureSelector />);
    fireEvent.change(select(), { target: { value: BASE_ID } });
    expect(state().activeScenarioId).toBe(BASE_ID);
    expect(select().value).toBe(BASE_ID);
  });

  it("with a comparison open, the comparison moves to the life you choose, so the verdict stays about what you are looking at", async () => {
    confirm(draft("relocation", 12, { location: "Denver" }));
    await act(async () => {
      await actions().openReplaceComparison();
    });
    const before = state().comparison!;
    render(<FutureSelector />);
    fireEvent.change(select(), { target: { value: BASE_ID } });
    const after = state().comparison!;
    expect(after.keepId).toBe(BASE_ID);
    expect(after.keepId).not.toBe(before.keepId);
    expect(state().explore.scenarios.some((s) => s.id === after.replaceId)).toBe(true);
    expect(state().evaluation!.scenarioIds).toEqual([after.keepId, after.replaceId]);
    expect(state().activeScenarioId).toBe(BASE_ID);
    // and the numbers are fresh, not carried over from the other life
    expect(state().results[after.replaceId]).toBeDefined();
    expect(new Set(state().explore.scenarios.map((s) => s.id)).size).toBe(state().explore.scenarios.length);
  });

  it("waits while something else is working", () => {
    confirm(draft("relocation", 12, { location: "Denver" }));
    render(<FutureSelector />);
    act(() => useForkStore.setState((s) => ({ ui: { ...s.ui, busy: "simulating" } })));
    expect(select()).toBeDisabled();
  });

  it("has no em dashes and no build words", () => {
    confirm(draft("relocation", 12, { location: "Denver" }));
    const { container } = render(<FutureSelector />);
    expect(container.textContent).not.toMatch(new RegExp(`demo|data|${String.fromCharCode(0x2014)}`, "i"));
  });
});
