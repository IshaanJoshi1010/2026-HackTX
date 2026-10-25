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
  it("shows a quiet progress line and the rider options", () => {
    render(<RevealOverlay />);

    expect(screen.getByTestId("reveal-stage-pill")).toBeInTheDocument();
    expect(screen.getByText("Who rides with you most?")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /just me/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /partner/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /kids/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mixed/i })).toBeInTheDocument();
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

  it("handles rider quick-pick chips", async () => {
    render(<RevealOverlay />);

    const kidsBtn = screen.getByRole("button", { name: /kids/i });
    fireEvent.click(kidsBtn);

    const profile = useForkStore.getState().explore.confirmedProfile;
    expect(profile.householdSize).toBe(3);
    expect(profile.children).toBe(1);
    expect(profile.provenance.householdSize).toBe("estimated");
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
