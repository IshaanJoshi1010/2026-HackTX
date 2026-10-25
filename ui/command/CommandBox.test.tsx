import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LifeEvent } from "@/contracts";
import { resetForkStoreForTests, useForkStore } from "@/ui/store/useForkStore";
import { CommandBox } from "./CommandBox";
import { ConfirmProposalCard } from "./ConfirmProposalCard";
import { InlineQuestionCard } from "./InlineQuestionCard";
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
  vi.restoreAllMocks(); // a spy on the AI must never leak into the next test
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
    // the team's demo sentence, taken from the data module rather than copied
    expect(input).toHaveValue("I'm moving to Denver next year, driving 20,000 miles annually, and expecting my second child in 2029.");
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
    // With no AI the reader's own note is shown, with a way to retry or to enter it by hand
    expect(screen.getByTestId("offline-note")).toHaveTextContent(/no supported change/i);
    expect(screen.getByRole("button", { name: "Try the AI again" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enter it yourself" })).toBeInTheDocument();
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

describe("CommandBox when the AI is not available", () => {
  const DEMO = "I'm moving to Denver next year, driving 20,000 miles annually, and expecting my second child in 2029.";
  const box = () => screen.getByPlaceholderText(/tell fork what's changing/i) as HTMLInputElement;
  const send = async (text: string) => {
    fireEvent.change(box(), { target: { value: text } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /submit changes/i }));
    });
  };
  const drafts = () => useForkStore.getState().explore.draftChanges;

  it("reads the sentence with the plain rules and keeps it in the box, with a visible way to retry or enter it by hand", async () => {
    render(<CommandBox />);
    await send(DEMO);
    expect(drafts().map((d) => d.type)).toEqual(["relocation", "mileage_change", "family_change"]); // the pinned demo events
    expect(box()).toHaveValue(DEMO); // not cleared
    const notice = screen.getByTestId("offline-notice");
    expect(notice).toHaveTextContent("The AI isn't available right now, so I read that with plain rules.");
    expect(screen.getByRole("button", { name: "Try the AI again" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Enter it yourself" })).toBeEnabled();
  });

  it("when the plain rules find nothing it says why in the reader's own words, and still offers both options", async () => {
    render(<CommandBox />);
    await send("I'm not pregnant.");
    expect(drafts()).toEqual([]);
    expect(screen.getByTestId("offline-note")).toHaveTextContent(/negatives|confirm/i);
    expect(box()).toHaveValue("I'm not pregnant.");
    expect(screen.getByRole("button", { name: "Try the AI again" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enter it yourself" })).toBeInTheDocument();
  });

  it("'Enter it yourself' opens the manual form, and what was typed stays", async () => {
    render(<CommandBox />);
    await send("moving to Denver in March");
    expect(screen.queryByTestId("manual-event-form")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Enter it yourself" }));
    expect(screen.getByTestId("manual-event-form")).toBeInTheDocument();
    expect(box()).toHaveValue("moving to Denver in March");
  });

  it("'Try the AI again' asks once, and when the AI answers it replaces the offline drafts and clears the box", async () => {
    const { ai } = await import("@/ui/mocks");
    const spy = vi.spyOn(ai, "interpret").mockResolvedValue({ aiAvailable: false });
    render(<CommandBox />);
    await send(DEMO);
    expect(drafts()).toHaveLength(3);

    spy.mockResolvedValue({ aiAvailable: true, intent: "CREATE_SCENARIO", proposals: [sampleProposal], profilePatches: [] });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try the AI again" }));
    });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(drafts().map((d) => d.id)).toEqual(["test-prop-1"]); // replaced, not stacked
    expect(box()).toHaveValue("");
    expect(screen.queryByTestId("offline-notice")).toBeNull();
    vi.restoreAllMocks();
  });

  it("a retry that is still unavailable keeps everything and does not retry by itself", async () => {
    const { ai } = await import("@/ui/mocks");
    const spy = vi.spyOn(ai, "interpret").mockResolvedValue({ aiAvailable: false });
    render(<CommandBox />);
    await send(DEMO);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try the AI again" }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000); // a minute passes: nothing asks again on its own
    });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(drafts()).toHaveLength(3);
    expect(box()).toHaveValue(DEMO);
    expect(screen.getByTestId("offline-notice")).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("confirming what the plain rules staged clears the box and the notice", async () => {
    render(<CommandBox />);
    await send(DEMO);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /branch timeline/i }));
    });
    expect(drafts()).toEqual([]);
    expect(box()).toHaveValue("");
    expect(screen.queryByTestId("offline-notice")).toBeNull();
  });

  it("discarding what the plain rules staged clears the box and the notice too", async () => {
    render(<CommandBox />);
    await send(DEMO);
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(drafts()).toEqual([]);
    expect(box()).toHaveValue("");
    expect(screen.queryByTestId("offline-notice")).toBeNull();
  });

  it("the notice belongs to the sentence it was about: typing something else hides it", async () => {
    render(<CommandBox />);
    await send("I'm not pregnant.");
    expect(screen.getByTestId("offline-notice")).toBeInTheDocument();
    fireEvent.change(box(), { target: { value: "moving to Denver next year" } });
    expect(screen.queryByTestId("offline-notice")).toBeNull();
  });

  it("a question the plain rules fully answered leaves nothing to retry: the box clears for the next one", async () => {
    render(<CommandBox />);
    await send("Would switching to a RAV4 Hybrid make more sense?");
    expect(useForkStore.getState().comparison).not.toBeNull();
    expect(useForkStore.getState().ui.view).toBe("future");
    expect(box()).toHaveValue("");
    expect(screen.queryByTestId("offline-notice")).toBeNull();
  });

  it("while it is thinking the box is locked, so a second request cannot be started", async () => {
    const { ai } = await import("@/ui/mocks");
    vi.spyOn(ai, "interpret").mockImplementation(() => new Promise(() => {}));
    render(<CommandBox />);
    fireEvent.change(box(), { target: { value: DEMO } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /submit changes/i }));
    });
    expect(box()).toBeDisabled();
    expect(screen.getByRole("button", { name: /submit changes/i })).toBeDisabled();
    vi.restoreAllMocks();
  });
});

describe("ConfirmProposalCard shows what Fork assumed", () => {
  const daily: LifeEvent = {
    id: "daily",
    type: "mileage_change",
    month: 12,
    payload: { annualMiles: 36500 },
    source: "ai",
    assumptions: ["Assumes you drive every day of the year"],
    quote: "100 miles a day",
    certainty: "inferred",
    status: "proposed",
  };

  it("says what it assumed, in the open, before you confirm", () => {
    act(() => useForkStore.getState().actions.addDraft(daily));
    render(<ConfirmProposalCard />);
    const row = screen.getByTestId("draft-row-daily");
    expect(row).toHaveTextContent("Assumes you drive every day of the year");
    expect(row).toHaveTextContent("inferred");
    expect(row).toHaveTextContent("\u201c100 miles a day\u201d");
    expect(within(row).getByTestId("draft-assumptions").querySelectorAll("li")).toHaveLength(1);
  });

  it("shows every assumption, and a value the title does not carry, and nothing extra when there is nothing to say", () => {
    act(() => {
      useForkStore.getState().actions.addDraft({ ...daily, id: "two", assumptions: ["First", "Second"] });
      useForkStore.getState().actions.addDraft({ ...daily, id: "budget", type: "budget_change", payload: { monthlyBudget: 900 }, assumptions: [], certainty: "clear", quote: undefined });
    });
    render(<ConfirmProposalCard />);
    expect(within(screen.getByTestId("draft-row-two")).getByTestId("draft-assumptions").textContent).toBe("FirstSecond");
    const budget = screen.getByTestId("draft-row-budget");
    expect(budget).toHaveTextContent("$900 a month");
    expect(within(budget).queryByTestId("draft-assumptions")).toBeNull();
    expect(budget.textContent).not.toContain("inferred");
  });
});

