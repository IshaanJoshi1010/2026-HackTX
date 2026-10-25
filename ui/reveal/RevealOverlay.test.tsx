import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetForkStoreForTests, useForkStore } from "@/ui/store/useForkStore";
import { RevealOverlay } from "./RevealOverlay";

beforeEach(async () => {
  vi.useFakeTimers();
  localStorage.clear();
  resetForkStoreForTests();
  await act(async () => {
    await useForkStore.getState().actions.startFromSample("camry-2022-se");
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("RevealOverlay", () => {
  it("shows a quiet progress line, and leaves the rider question to RiderDock", () => {
    render(<RevealOverlay />);

    expect(screen.getByTestId("reveal-stage-pill")).toBeInTheDocument();
    expect(screen.queryByText("Who rides with you most?")).toBeNull();
    expect(screen.queryByRole("button", { name: /just me|partner|kids|mixed/i })).toBeNull();
    expect(screen.getByTestId("reveal-overlay").querySelector("[aria-hidden='true'].h-\\[68px\\]")).not.toBeNull(); // the gap the chips sit in
  });

  it("does not carry the specs: they outlive the reveal, so SpecReadout shows them", () => {
    for (const revealStage of ["converge", "solid", "done"] as const) {
      act(() => useForkStore.setState((st) => ({ stage: { ...st.stage, revealStage } })));
      const { unmount } = render(<RevealOverlay />);
      expect(screen.queryByTestId("reveal-specs")).toBeNull();
      expect(document.querySelectorAll('[data-slot="stat"]')).toHaveLength(0);
      unmount();
    }
  });

  it("skip is the only control while the car assembles", () => {
    const skipSpy = vi.spyOn(useForkStore.getState().actions, "skip");
    render(<RevealOverlay />);

    fireEvent.click(screen.getByRole("button", { name: /^skip$/i }));
    expect(skipSpy).toHaveBeenCalled();
    // replay lives in the details sheet, not here
    expect(screen.queryByRole("button", { name: /replay/i })).toBeNull();
  });
});
