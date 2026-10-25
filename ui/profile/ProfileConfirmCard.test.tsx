import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { alexProfile } from "@/data/fixtures/alex";
import { resetForkStoreForTests, useForkStore } from "@/ui/store/useForkStore";
import { ProfileConfirmCard } from "./ProfileConfirmCard";

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  resetForkStoreForTests();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ProfileConfirmCard", () => {
  it("renders null when no twin exists", () => {
    const { container } = render(<ProfileConfirmCard />);
    expect(container.firstChild).toBeNull();
  });

  it("renders confirmed driver profile rows with source badges", async () => {
    await act(async () => {
      await useForkStore.getState().actions.startFromSample("camry-2022-se");
    });

    render(<ProfileConfirmCard />);

    expect(screen.getByTestId("profile-confirm-card")).toBeInTheDocument();
    expect(screen.getByText("Confirmed Driver Profile")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();

    // Verify key data rows
    expect(screen.getByText("Current odometer")).toBeInTheDocument();
    expect(screen.getByText("48,000 mi")).toBeInTheDocument();

    // Persona values come from the shared fixture, so a persona change does not break this test.
    expect(screen.getByText("Annual driving")).toBeInTheDocument();
    expect(screen.getByText(`${alexProfile.annualMiles.toLocaleString("en-US")} mi/yr`)).toBeInTheDocument();

    expect(screen.getByText("Household size")).toBeInTheDocument();
    expect(screen.getByText(`${alexProfile.householdSize} people`)).toBeInTheDocument();

    expect(screen.getByText("Location")).toBeInTheDocument();
    expect(screen.getByText(alexProfile.location)).toBeInTheDocument();

    // Values are sentence case, not capitals
    expect(screen.getByText("Low")).toBeInTheDocument();
    expect(screen.getByText("Loan")).toBeInTheDocument();

    // Verify presence of source badges
    const badges = screen.getAllByTitle(/demo persona data/i);
    expect(badges.length).toBeGreaterThan(0);
  });
});
