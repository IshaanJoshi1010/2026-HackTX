import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LifeEvent } from "@/contracts";
import { resetForkStoreForTests, useForkStore } from "@/ui/store/useForkStore";
import { CommandBox } from "./CommandBox";
import { STARTER_PROMPT, starterPrompt } from "./StarterChips";

const state = () => useForkStore.getState();
const actions = () => useForkStore.getState().actions;

const camry = { model: "Camry" };
const rav4 = { model: "RAV4", powertrain: "hybrid" as const };
const MOVE: Omit<LifeEvent, "id" | "status"> = { type: "relocation", month: 12, payload: { location: "Denver" }, source: "user", assumptions: [], certainty: "clear" };

beforeEach(async () => {
  vi.restoreAllMocks();
  localStorage.clear();
  resetForkStoreForTests();
  useForkStore.setState({ hydrated: true });
  await actions().startFromSample("camry-2022-se");
  actions().onRevealStage("done");
});

afterEach(() => cleanup());

describe("starterPrompt", () => {
  it("starts with the demo sentence, then the next question, then what would flip it", () => {
    expect(starterPrompt({ futures: 1, compared: false, current: camry, other: rav4 })).toBe(STARTER_PROMPT);
    expect(starterPrompt({ futures: 2, compared: false, current: camry, other: rav4 })).toBe("Would switching to a RAV4 Hybrid make more sense?");
    expect(starterPrompt({ futures: 3, compared: true, current: camry, other: rav4 })).toBe("What would have to change for keeping the Camry to be the better option?");
  });

  it("names the other car as it is, not as a hybrid when it is not one", () => {
    expect(starterPrompt({ futures: 2, compared: false, current: rav4, other: { model: "Camry", powertrain: "gas" } })).toBe("Would switching to a Camry make more sense?");
  });
});

describe("the starter chip", () => {
  it("is a visible chip, not a faint line", () => {
    render(<CommandBox />);
    const chip = screen.getByTestId("starter-chip");
    expect(chip).toHaveTextContent(`Try: “${STARTER_PROMPT}”`);
    expect(chip.className).toContain("rounded-full");
    expect(chip.className).toContain("border");
    expect(chip.className).not.toMatch(/text-ink\/(?:[1-4]\d|\d)(?!\d)/); // nothing at 49% or fainter
  });

  it("fills the box without sending it", () => {
    render(<CommandBox />);
    const input = screen.getByPlaceholderText(/tell fork what's changing/i) as HTMLInputElement;
    fireEvent.click(screen.getByTestId("starter-chip"));
    expect(input.value).toBe(STARTER_PROMPT);
    expect(state().explore.draftChanges).toEqual([]);
    expect(state().ui.busy).toBe("idle");
  });

  it("stays while typing", () => {
    render(<CommandBox />);
    const input = screen.getByPlaceholderText(/tell fork what's changing/i);
    fireEvent.change(input, { target: { value: "moving soon" } });
    expect(screen.getByTestId("starter-chip")).toBeInTheDocument();
  });

  it("stays once futures exist, and offers the next question", () => {
    act(() => {
      actions().addDraft(MOVE);
      actions().confirmDrafts(state().explore.draftChanges.map((d) => d.id));
    });
    render(<CommandBox />);
    expect(state().explore.scenarios.length).toBeGreaterThan(1);
    expect(screen.getByTestId("starter-chip")).toHaveTextContent("Would switching to a RAV4 Hybrid make more sense?");
  });

  it("offers the break-even question once there is a comparison, and sending it works", async () => {
    await act(async () => {
      await actions().submitDump("Would switching to a RAV4 Hybrid make more sense?");
    });
    expect(state().evaluation).not.toBeNull();
    render(<CommandBox />);
    expect(screen.getByTestId("starter-chip")).toHaveTextContent("What would have to change for keeping the Camry to be the better option?");
    await act(async () => {
      await actions().submitDump("What would have to change for keeping the Camry to be the better option?");
    });
    expect(state().breakEven).not.toBeNull();
  });

  it("steps aside while proposals wait for a confirm", () => {
    act(() => actions().addDraft(MOVE));
    render(<CommandBox />);
    expect(screen.queryByTestId("starter-chip")).toBeNull();
    expect(screen.getByTestId("confirm-proposal-card")).toBeInTheDocument();
  });
});

describe("the starter chip stays one line", () => {
  it("truncates the long sentence, keeps all of it in the tooltip, and still fills the box with all of it", () => {
    render(<CommandBox />);
    const chip = screen.getByTestId("starter-chip");
    expect(chip.className).toContain("truncate");
    expect(chip.className).toContain("w-fit");
    expect(chip).toHaveAttribute("title", STARTER_PROMPT);
    fireEvent.click(chip);
    expect((screen.getByPlaceholderText(/tell fork what's changing/i) as HTMLInputElement).value).toBe(STARTER_PROMPT);
  });
});
