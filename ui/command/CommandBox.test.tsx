import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LifeEvent } from "@/contracts";
import { resetForkStoreForTests, useForkStore } from "@/ui/store/useForkStore";
import { CommandBox } from "./CommandBox";
import { ConfirmProposalCard } from "./ConfirmProposalCard";
import { InlineQuestionCard } from "./InlineQuestionCard";
import { ManualEventForm } from "./ManualEventForm";
import { TradeoffCards } from "./TradeoffCards";

const sampleProposal: LifeEvent = {
  id: "test-prop-1",
  type: "relocation",
  month: 12,
  payload: { city: "Denver", annualMiles: 20000 },
  source: "ai",
  assumptions: [],
  quote: "moving to Denver next year",
  certainty: "clear",
  status: "proposed",
};

beforeEach(async () => {
  vi.useFakeTimers();
  localStorage.clear();
  resetForkStoreForTests();
  await act(async () => {
    await useForkStore.getState().actions.startFromSample("camry-2022-se");
  });
  act(() => {
    // finish the reveal so the baseline future exists to branch from
    useForkStore.getState().actions.onRevealStage("done");
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("CommandBox", () => {
  it("renders input field and starter suggestion", () => {
    render(<CommandBox />);

    expect(screen.getByPlaceholderText(/tell fork what's changing/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit changes/i })).toBeInTheDocument();

    // Starter suggestion is present
    expect(screen.getByText(/moving to denver next year/i)).toBeInTheDocument();
  });

  it("submits prompt, parses brain dump, and stages proposed changes", async () => {
    render(<CommandBox />);
    const input = screen.getByPlaceholderText(/tell fork what's changing/i);

    fireEvent.change(input, {
      target: { value: "Moving to Denver next year, 20,000 miles annually" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /submit changes/i }));
    });

    const drafts = useForkStore.getState().explore.draftChanges;
    expect(drafts.length).toBeGreaterThanOrEqual(2);
    expect(drafts.some((d) => d.type === "relocation")).toBe(true);
    expect(drafts.some((d) => d.type === "mileage_change")).toBe(true);
  });

  it("opens and closes the manual entry form from the plus button", () => {
    render(<CommandBox />);

    expect(screen.queryByTestId("manual-event-form")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /add a change manually/i }));
    expect(screen.getByTestId("manual-event-form")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /close manual entry/i }));
    expect(screen.queryByTestId("manual-event-form")).toBeNull();
  });

  it("the suggestion fills the box but does not submit it", () => {
    render(<CommandBox />);
    const input = screen.getByPlaceholderText(/tell fork what's changing/i);
    fireEvent.click(screen.getByRole("button", { name: /try:/i }));
    expect(input).toHaveValue("Moving to Denver next year, 20,000 miles annually, second child in 2029");
    expect(useForkStore.getState().explore.draftChanges).toHaveLength(0);
  });

  it("stages the demo sentence as three proposals with the keys the sim reads", async () => {
    render(<CommandBox />);
    fireEvent.change(screen.getByPlaceholderText(/tell fork what's changing/i), {
      target: { value: "Moving to Denver next year, 20,000 miles annually, second child in 2029" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /submit changes/i }));
    });
    const drafts = useForkStore.getState().explore.draftChanges;
    expect(drafts.map((d) => d.type)).toEqual(["relocation", "mileage_change", "family_change"]);
    expect(drafts.map((d) => d.status)).toEqual(["proposed", "proposed", "proposed"]);
    expect(drafts[0].payload).toEqual({ location: "Denver" });
    // the months and counts Dev 4's demo story is pinned on
    expect(drafts.map((d) => d.month)).toEqual([12, 0, 32]);
    expect(drafts[2].payload).toEqual({ children: 2 });
    // nothing confirmed: no new future yet
    expect(useForkStore.getState().explore.scenarios).toHaveLength(1);
  });

  it("does not make up a change when the text has none, and keeps what was typed", async () => {
    render(<CommandBox />);
    const input = screen.getByPlaceholderText(/tell fork what's changing/i);
    fireEvent.change(input, { target: { value: "I'm moving" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /submit changes/i }));
    });
    expect(useForkStore.getState().explore.draftChanges).toHaveLength(0);
    expect(screen.getByRole("status")).toHaveTextContent(/couldn't find a life change/i);
    expect(input).toHaveValue("I'm moving");
  });

  it("when the AI answers, it does not run the offline rules on top", async () => {
    const { ai } = await import("@/ui/mocks");
    vi.spyOn(ai, "interpret").mockResolvedValue({ aiAvailable: true, intent: "CLARIFY", proposals: [], profilePatches: [] });
    render(<CommandBox />);
    fireEvent.change(screen.getByPlaceholderText(/tell fork what's changing/i), { target: { value: "Moving to Denver next year" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /submit changes/i }));
    });
    expect(useForkStore.getState().explore.draftChanges).toHaveLength(0);
  });

  it("shows the proposal card, and confirming it branches and opens the future page", async () => {
    act(() => {
      useForkStore.getState().actions.addDraft(sampleProposal);
    });
    render(<CommandBox />);
    expect(screen.getByTestId("confirm-proposal-card")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /branch timeline/i }));
    });
    expect(useForkStore.getState().explore.scenarios).toHaveLength(2);
    expect(useForkStore.getState().ui.view).toBe("future");
  });

  it("hides the suggestion once there is more than the baseline", () => {
    act(() => {
      useForkStore.getState().actions.addDraft(sampleProposal);
      useForkStore.getState().actions.confirmDrafts(["test-prop-1"]);
    });
    render(<CommandBox />);
    expect(screen.queryByRole("button", { name: /try:/i })).toBeNull();
  });
});

describe("ConfirmProposalCard", () => {
  it("renders proposed changes and branches timeline upon confirmation", async () => {
    act(() => {
      useForkStore.getState().actions.addDraft(sampleProposal);
    });

    const confirmSpy = vi.spyOn(useForkStore.getState().actions, "confirmDrafts");
    render(<ConfirmProposalCard />);

    expect(screen.getByTestId("confirm-proposal-card")).toBeInTheDocument();
    expect(screen.getByText("Move to Denver")).toBeInTheDocument();
    expect(screen.getByText(/moving to denver next year/i)).toBeInTheDocument();

    // Confirm changes
    fireEvent.click(screen.getByRole("button", { name: /branch timeline/i }));
    expect(confirmSpy).toHaveBeenCalledWith(["test-prop-1"]);
  });

  it("allows discarding a proposal", () => {
    act(() => {
      useForkStore.getState().actions.addDraft(sampleProposal);
    });

    render(<ConfirmProposalCard />);
    fireEvent.click(screen.getByTitle("Remove change"));

    expect(useForkStore.getState().explore.draftChanges).toHaveLength(0);
  });
});

describe("InlineQuestionCard", () => {
  it("renders questions and sends answered value to store", () => {
    act(() => {
      useForkStore.setState({
        question: {
          field: "cargoNeed",
          text: "How much cargo capacity do you need?",
          kind: "chips",
          options: ["Low", "Medium", "High", "I'm not sure"],
          impactNote: "Affects keep vs replace comparison",
        },
      });
    });

    const answerSpy = vi.spyOn(useForkStore.getState().actions, "answerQuestion");
    render(<InlineQuestionCard />);
    expect(screen.getByText("How much cargo capacity do you need?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "High" }));
    expect(answerSpy).toHaveBeenCalledWith("cargoNeed", "high");
  });
});

describe("ManualEventForm", () => {
  it("allows staging a manual event proposal", () => {
    render(<ManualEventForm />);

    const cityInput = screen.getByPlaceholderText("e.g. Denver");
    fireEvent.change(cityInput, { target: { value: "Seattle" } });

    fireEvent.click(screen.getByRole("button", { name: /stage proposal/i }));

    const drafts = useForkStore.getState().explore.draftChanges;
    expect(drafts).toHaveLength(1);
    expect(drafts[0].type).toBe("relocation");
    expect(drafts[0].payload.city).toBe("Seattle");
    expect(drafts[0].status).toBe("proposed");
  });
});

describe("TradeoffCards", () => {
  it("records user tradeoff choices into priorities", () => {
    render(<TradeoffCards />);

    const maxCargoBtn = screen.getByRole("button", { name: /max cargo/i });
    fireEvent.click(maxCargoBtn);

    const profile = useForkStore.getState().explore.confirmedProfile;
    expect(profile.priorities.family).toBeGreaterThan(0.2);
    expect(profile.provenance.priorities).toBe("user");
  });
});
