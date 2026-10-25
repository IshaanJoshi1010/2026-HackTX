import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetForkStoreForTests, useForkStore } from "@/ui/store/useForkStore";
import { ForkApp } from "./ForkApp";

const state = () => useForkStore.getState();

/** Flush promises, then run the stub's timers. */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

// The demo Camry's made-up VIN, typed into the first screen the way a person would.
const ALEX_CAMRY_VIN = "4T1G11AK1NU900001";

async function openCamry() {
  render(<ForkApp />);
  await advance(0);
  fireEvent.change(screen.getByPlaceholderText("Enter your VIN"), { target: { value: ALEX_CAMRY_VIN } });
  fireEvent.click(screen.getByRole("button", { name: "Decode VIN" }));
  await advance(0);
}

async function enterWorkspace() {
  await openCamry();
  await advance(4100);
}

const goFuture = () => fireEvent.click(screen.getByRole("tab", { name: "Future" }));
const goCar = () => fireEvent.click(screen.getByRole("tab", { name: "Car" }));
const openDetails = () => fireEvent.click(screen.getByRole("button", { name: "Your details" }));
const scrubTo = (month: number) =>
  fireEvent.change(screen.getByRole("slider", { name: "Month" }), { target: { value: String(month) } });
const stats = () => [...document.querySelectorAll('[data-slot="stat"]')];

const denver = {
  type: "relocation" as const,
  month: 12,
  payload: { location: "Denver" },
  source: "user" as const,
  assumptions: [],
  quote: "moving to Denver next year",
  certainty: "clear" as const,
};

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  resetForkStoreForTests();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("flow", () => {
  it("boots to landing with the mock banner on", async () => {
    render(<ForkApp />);
    await advance(0);
    expect(screen.getByText("The future branches. Explore yours.", { selector: "p" })).toBeInTheDocument();
    // Data, sim, decision and the AI are real now. Only the 3D stage is still a placeholder.
    expect(screen.getByTestId("mock-banner")).toHaveTextContent("car is a placeholder");
    expect(screen.getByTestId("mock-banner")).not.toHaveTextContent(/\b(data|sim|decision|ai)\b/);
    expect(screen.getByPlaceholderText("Enter your VIN")).toBeInTheDocument(); // the first screen is your VIN
    // nothing to open before there is a car
    expect(screen.queryByRole("button", { name: "Your details" })).toBeNull();
  });

  it("runs the reveal and lands on the car page", async () => {
    await openCamry();
    const stage = screen.getByTestId("car-stage-stub");
    expect(stage).toHaveAttribute("data-phase", "reveal");
    expect(stage).toHaveAttribute("data-vehicle-id", "camry-2022-se");
    // during the reveal: no command bar, no page switch
    expect(screen.queryByRole("tablist", { name: "Page" })).toBeNull();
    expect(screen.queryByPlaceholderText(/tell fork/i)).toBeNull();

    await advance(4100);
    expect(state().phase).toBe("workspace");
    expect(screen.getByTestId("car-stage-stub")).toHaveAttribute("data-phase", "interactive");
    expect(screen.getByRole("tab", { name: "Car" })).toHaveAttribute("aria-selected", "true");
  });

  it("skip jumps straight into the workspace at any moment of the reveal", async () => {
    await openCamry();
    await advance(1000);
    expect(state().phase).toBe("reveal");
    fireEvent.click(screen.getByRole("button", { name: /^skip$/i }));
    await advance(0);
    expect(state().phase).toBe("workspace");
  });

  it("start over (in the details sheet) goes back to the landing screen", async () => {
    await enterWorkspace();
    openDetails();
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(state().phase).toBe("landing");
    expect(screen.getByPlaceholderText("Enter your VIN")).toHaveValue(""); // back to the one field, empty
  });

  it("switching the sample car restarts the stage on the new car", async () => {
    await enterWorkspace();
    openDetails();
    fireEvent.click(within(screen.getByRole("dialog", { name: "Your details" })).getByRole("button", { name: /2024 RAV4/ }));
    await advance(0);
    const stage = screen.getByTestId("car-stage-stub");
    expect(stage).toHaveAttribute("data-vehicle-id", "rav4-2024-hybrid-xle");
    expect(stage).toHaveAttribute("data-phase", "reveal");
  });
});

describe("the car page", () => {
  it("is just the car, its name, the command bar and the page switch, and the car's own specs for a while", async () => {
    await enterWorkspace();
    expect(screen.getByRole("heading", { level: 1, name: "2022 Toyota Camry" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/tell fork what's changing/i)).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "Page" })).toBeInTheDocument();

    // The only numbers are the car's own four specs, and they fade away. Never a timeline or a side panel.
    expect(stats()).toHaveLength(4);
    expect(screen.getByTestId("reveal-specs").querySelectorAll('[data-slot="stat"]')).toHaveLength(4);
    await advance(60_000);
    expect(stats()).toHaveLength(0);
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByTestId("future-view")).toBeNull();
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.queryByTestId("road")).toBeNull();
  });

  it("the header has only the wordmark and one button", async () => {
    await enterWorkspace();
    const header = screen.getByRole("banner");
    expect(within(header).getAllByRole("button")).toHaveLength(1);
    expect(within(header).getByRole("button", { name: "Your details" })).toBeInTheDocument();
  });

  it("shows the name of the branch you are looking at, only when it is not the baseline", async () => {
    await enterWorkspace();
    expect(screen.queryByText(/Move to Denver/)).toBeNull();
    act(() => {
      state().actions.addDraft(denver);
      state().actions.confirmDrafts(state().explore.draftChanges.map((d) => d.id));
    });
    goCar();
    expect(screen.getByText(/Representative 3D model/)).toHaveTextContent("Move to Denver");
  });

  it("never prints placeholder paint text from the fixtures", async () => {
    await enterWorkspace();
    openDetails();
    expect(document.body.textContent).not.toMatch(/TODO/);
  });
});

describe("the future page", () => {
  const confirmDenver = () =>
    act(() => {
      state().actions.addDraft(denver);
      state().actions.confirmDrafts(state().explore.draftChanges.map((d) => d.id));
    });
  const stepButtons = () => screen.getAllByTestId("step");
  const compareNow = async () => {
    fireEvent.click(screen.getByRole("button", { name: /Explore the 2024 RAV4/ }));
    await advance(0);
  };

  it("opens on your next five years: a heading, the winding path, and the other car as a dashed choice", async () => {
    await enterWorkspace();
    goFuture();
    expect(screen.getByRole("tab", { name: "Future" })).toHaveAttribute("aria-selected", "true");
    expect(state().activeMonth).toBe(60);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Life takes turns.");
    expect(screen.getByTestId("future-kicker")).toHaveTextContent("Your next five years");
    const timeline = screen.getByTestId("winding-timeline");
    // nothing has been said yet: where you start, then the fork
    expect(within(timeline).getAllByTestId("step-label").map((l) => l.textContent)).toEqual([expect.stringContaining("Your 2022 Camry"), expect.stringContaining("A fork in the road")]);
    expect(within(timeline).getByRole("button", { name: /Keep your 2022 Camry/ })).toBeInTheDocument();
    expect(within(timeline).getByRole("button", { name: /Explore the 2024 RAV4 Hybrid XLE/ })).toBeInTheDocument();
    expect(screen.getByTestId("path-down")).toHaveAttribute("data-dashed", "true"); // the car nobody has priced is a dashed path
    expect(screen.getByTestId("path-up")).toHaveAttribute("data-dashed", "false");
  });

  it("is minimal by default: the path and one card. The road, the lists and the other futures wait behind Details.", async () => {
    await enterWorkspace();
    goFuture();
    const view = screen.getByTestId("future-view");
    expect(screen.getByTestId("winding-timeline")).toBeInTheDocument();
    expect(screen.queryByTestId("road")).toBeNull();
    expect(screen.queryByTestId("details-section")).toBeNull();
    expect(screen.queryByTestId("future-details")).toBeNull();
    expect(screen.queryByRole("region", { name: "Keep or replace" })).toBeNull();
    expect(stats()).toHaveLength(1); // the one number on the open card, with its source
    expect(stats()[0].querySelector("[data-source]")).not.toBeNull();
    expect(within(view).getByRole("button", { name: "Details" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("tap a step and its card opens: what it is, when, what it did to cost, and where the number comes from", async () => {
    await enterWorkspace();
    act(() => {
      state().actions.addDraft({ ...denver, month: 12 });
      state().actions.addDraft({ type: "mileage_change", month: 12, payload: { annualMiles: 24000 }, source: "user", assumptions: [], certainty: "clear" });
      state().actions.confirmDrafts(state().explore.draftChanges.map((d) => d.id));
    });
    goFuture();
    expect(stepButtons().map((b) => b.textContent)).toEqual(["01", "02", "03", "04"]); // start, two decisions, the fork
    expect(screen.getByTestId("step-title")).toHaveTextContent("Your 2022 Camry");

    const byKey = (title: string) => stepButtons().find((b) => b.getAttribute("aria-label")!.includes(title))!;
    fireEvent.click(byKey("24,000 miles a year"));
    expect(screen.getByTestId("step-title")).toHaveTextContent("24,000 miles a year");
    expect(byKey("24,000 miles a year")).toHaveAttribute("aria-current", "step");
    expect(screen.getByTestId("step-effect").textContent).toMatch(/Adds \$[\d,]+ over 5 yr/); // the stand-in sim reacts to mileage
    expect(screen.getByTestId("step-effect").querySelector("[data-source]")).not.toBeNull();

    fireEvent.click(byKey("Move to Denver"));
    expect(screen.getByTestId("step-title")).toHaveTextContent("Move to Denver");
    expect(screen.getByTestId("step-effect")).toHaveTextContent("No change to cost.");
    expect(screen.getByTestId("step-effect").querySelector("[data-source]")).toBeNull(); // no number, nothing to label
    expect(screen.getByTestId("step-detail")).toHaveTextContent("\u201cmoving to Denver next year\u201d"); // what you said
    stats().forEach((st) => expect(st.querySelector("[data-source]")).not.toBeNull());
  });

  it("previous and next, and the arrow keys, walk the path", async () => {
    await enterWorkspace();
    confirmDenver();
    goFuture();
    expect(screen.getByTestId("step-count")).toHaveTextContent("1 of 3");
    expect(screen.getByRole("button", { name: "Previous step" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(screen.getByTestId("step-count")).toHaveTextContent("2 of 3");
    expect(screen.getByTestId("step-title")).toHaveTextContent("Move to Denver");
    fireEvent.keyDown(stepButtons()[1], { key: "ArrowRight" });
    expect(screen.getByTestId("step-title")).toHaveTextContent("A fork in the road");
    expect(stepButtons()[2]).toHaveFocus();
    expect(screen.getByRole("button", { name: "Next step" })).toBeDisabled();
    fireEvent.keyDown(stepButtons()[2], { key: "Home" });
    expect(screen.getByTestId("step-count")).toHaveTextContent("1 of 3");
    // only the chosen step is in the tab order
    expect(stepButtons().map((b) => b.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
  });

  it("the fork's card says what keeping costs, and that the dashed path is how to compare", async () => {
    await enterWorkspace();
    goFuture();
    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    const card = screen.getByTestId("step-detail");
    expect(card).toHaveTextContent("A fork in the road");
    expect(card).toHaveTextContent("Tap the dashed path to compare them");
    expect(card.querySelectorAll('[data-slot="stat"]')).toHaveLength(1);
  });

  it("Details is opt-in, lives in the store, and brings the month by month road and what each decision changed", async () => {
    await enterWorkspace();
    act(() => {
      state().actions.addDraft({ ...denver, month: 12 });
      state().actions.addDraft({ type: "mileage_change", month: 12, payload: { annualMiles: 24000 }, source: "user", assumptions: [], certainty: "clear" });
      state().actions.confirmDrafts(state().explore.draftChanges.map((d) => d.id));
    });
    goFuture();
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(state().ui.futureDetails).toBe(true);
    expect(screen.getByRole("button", { name: "Details" })).toHaveAttribute("aria-pressed", "true");
    expect(within(screen.getByTestId("month-by-month")).getByTestId("road")).toBeInTheDocument();

    const rows = screen.getAllByTestId("decision-effect");
    expect(rows).toHaveLength(2);
    const byTitle = (t: string) => rows.find((r) => r.textContent!.includes(t))!;
    expect(byTitle("24,000 miles a year").textContent).toMatch(/Adds \$[\d,]+/);
    expect(byTitle("Move to Denver")).toHaveTextContent("No change in cost");
    rows.forEach((r) => expect(r.querySelector("[data-source]")).not.toBeNull());

    // the card's number, and the four supporting numbers, each with a source
    expect(stats()).toHaveLength(5);
    stats().forEach((st) => expect(st.querySelector("[data-source]")).not.toBeNull());
    for (const label of ["Odometer", "Fuel so far", "Upkeep so far", "Resale value"]) {
      expect(within(screen.getByTestId("future-details")).getByText(label)).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(screen.queryByTestId("details-section")).toBeNull();
    expect(stats()).toHaveLength(1);
  });

  it("Details on a path with nothing on it says so plainly", async () => {
    await enterWorkspace();
    goFuture();
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(screen.getByTestId("future-details")).toHaveTextContent("No decisions yet, so nothing has changed.");
  });

  it("every number on the page has a source label, the road's readout too", async () => {
    await enterWorkspace();
    confirmDenver();
    goFuture();
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(stats().length).toBeGreaterThan(1);
    stats().forEach((st) => expect(st.querySelector("[data-source]")).not.toBeNull());
    expect(screen.getByTestId("road-effect").querySelector("[data-source]")).not.toBeNull();
  });

  it("scrubbing the month by month road updates its numbers", async () => {
    await enterWorkspace();
    confirmDenver();
    goFuture();
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(screen.getByRole("slider", { name: "Month" })).toHaveAttribute("aria-valuetext", "5 yr");
    const readout = () => screen.getByTestId("road-readout").textContent;
    const at60 = readout();
    scrubTo(24);
    expect(state().activeMonth).toBe(24);
    expect(readout()).not.toBe(at60);
  });

  it("on the road, the other futures are a choice: the option appears with a count, and turning it on names them", async () => {
    await enterWorkspace();
    confirmDenver();
    goFuture();
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    const toggle = screen.getByRole("button", { name: "Other futures (1)" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryAllByTestId("road-future")).toHaveLength(0);
    fireEvent.click(toggle);
    expect(state().ui.futureCompare).toBe(true);
    expect(screen.getAllByTestId("road-future")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: /Keep the Camry/ }));
    expect(state().activeScenarioId).toBe("base");
  });

  it("tapping the dashed path compares with the RAV4: both ways, the verdict, and the car morphs behind the page", async () => {
    await enterWorkspace();
    goFuture();
    await compareNow();
    expect(screen.getByTestId("car-stage-stub")).toHaveAttribute("data-phase", "transition");
    await advance(1900);
    expect(screen.getByTestId("car-stage-stub")).toHaveAttribute("data-vehicle-id", "rav4-2024-hybrid-xle");

    // The verdict is the engine's, so assert that there is one, not which it is (the demo story is pinned in its own test).
    expect(screen.getByRole("region", { name: "Keep or replace" })).toHaveTextContent(/Keep your Camry|Switch to the RAV4|Close call/);
    expect(state().ui.futureCompare).toBe(true);
    const ends = screen.getAllByTestId("fork-end");
    expect(ends.map((e) => e.getAttribute("data-option")).sort()).toEqual(["keep", "replace"]);
    expect(screen.getByRole("button", { name: /Switch to the 2024 RAV4/ })).toHaveAttribute("aria-pressed", "true"); // the car you are looking at
    // the offer is gone once there is a verdict
    expect(screen.queryByRole("button", { name: /Explore the 2024 RAV4/ })).toBeNull();

    goCar();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("2024 Toyota RAV4");
  });

  it("after comparing, the engine's pick is the solid path and says recommended; the other is dashed. A close call picks neither.", async () => {
    await enterWorkspace();
    goFuture();
    await compareNow();
    const preferred = state().evaluation!.preferredScenarioId;
    const keepEnd = screen.getByRole("button", { name: /Keep your 2022 Camry/ });
    const switchEnd = screen.getByRole("button", { name: /Switch to the 2024 RAV4/ });
    if (preferred === "inconclusive") {
      expect(keepEnd).toHaveTextContent("Close call");
      expect(switchEnd).toHaveTextContent("Close call");
      expect(screen.getByTestId("path-up")).toHaveAttribute("data-dashed", "false");
      expect(screen.getByTestId("path-down")).toHaveAttribute("data-dashed", "false");
    } else {
      const picksKeep = preferred === state().comparison!.keepId;
      expect(picksKeep ? keepEnd : switchEnd).toHaveTextContent("Recommended");
      expect(picksKeep ? switchEnd : keepEnd).toHaveTextContent("Alternative");
      expect(screen.getByTestId("path-up")).toHaveAttribute("data-dashed", "false"); // the recommended way goes up, solid
      expect(screen.getByTestId("path-down")).toHaveAttribute("data-dashed", "true");
    }
  });
});

describe("when something does not work, it says so", () => {
  it("shows the store's error above the command bar on either page, and goes away when dismissed", async () => {
    await enterWorkspace();
    expect(screen.queryByRole("alert")).toBeNull();
    act(() => useForkStore.setState({ error: "There is no other car to compare with." }));
    expect(screen.getByRole("alert")).toHaveTextContent("There is no other car to compare with.");
    goFuture();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(state().error).toBeNull();
  });

  it("an unusable answer to a question is not silent", async () => {
    await enterWorkspace();
    act(() => state().actions.answerQuestion("annualMiles", -5));
    expect(screen.getByRole("alert")).toHaveTextContent(/usable value/);
  });
});

describe("the answer fits the page", () => {
  it("once you compare: the verdict beside the heading, then the path, then the next step. The numbers wait behind Details.", async () => {
    await enterWorkspace();
    goFuture();
    fireEvent.click(screen.getByRole("button", { name: /Explore the 2024 RAV4/ }));
    await advance(0);

    const verdict = screen.getByTestId("verdict");
    const heading = screen.getByTestId("future-heading");
    const timeline = screen.getByTestId("winding-timeline");
    const next = screen.getByTestId("next-step");
    const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(verdict).toHaveAttribute("data-compact");
    expect(verdict).toHaveTextContent("The recommendation");
    expect(before(heading, verdict)).toBe(true); // beside the heading, not above it
    expect(before(verdict, timeline)).toBe(true);
    expect(before(timeline, next)).toBe(true);
    expect(screen.queryByTestId("road")).toBeNull();
    expect(screen.queryByTestId("details-section")).toBeNull();
  });

  it("the comparison's options sit in the same row as Details", async () => {
    await enterWorkspace();
    goFuture();
    fireEvent.click(screen.getByRole("button", { name: /Explore the 2024 RAV4/ }));
    await advance(0);
    const row = screen.getByRole("button", { name: "Details" }).parentElement!;
    expect(within(row).getByRole("button", { name: "What would change it" })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Why" })).toBeInTheDocument();
  });
});

describe("two pages, one stage", () => {
  it("the 3D stage stays mounted and only fades out on the future page", async () => {
    await enterWorkspace();
    const stage = screen.getByTestId("car-stage-stub");
    expect(screen.getByTestId("stage-wrap")).toHaveAttribute("data-visible", "true");

    goFuture();
    expect(screen.getByTestId("car-stage-stub")).toBe(stage); // same element, never rebuilt
    expect(screen.getByTestId("stage-wrap")).toHaveAttribute("data-visible", "false");
    expect(screen.getByTestId("stage-wrap")).toHaveAttribute("aria-hidden", "true");

    goCar();
    expect(screen.getByTestId("car-stage-stub")).toBe(stage);
    expect(screen.getByTestId("stage-wrap")).toHaveAttribute("data-visible", "true");
  });

  it("the command bar is on both pages", async () => {
    await enterWorkspace();
    expect(screen.getByPlaceholderText(/tell fork what's changing/i)).toBeInTheDocument();
    goFuture();
    expect(screen.getByPlaceholderText(/tell fork what's changing/i)).toBeInTheDocument();
  });

  it("confirming a proposal branches the timeline and lands on the future page", async () => {
    await enterWorkspace();
    act(() => state().actions.addDraft(denver));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /branch timeline/i }));
    });
    expect(state().ui.view).toBe("future");
    expect(screen.getByTestId("winding-timeline")).toBeInTheDocument();
    // the move is a year out, so the path starts with where you are, then the move, then the fork
    expect(screen.getAllByTestId("step-label").map((l) => l.textContent)).toEqual([
      expect.stringContaining("Your 2022 Camry"),
      expect.stringContaining("Move to Denver"),
      expect.stringContaining("A fork in the road"),
    ]);
    expect(screen.getByTestId("step-title")).toHaveTextContent("Your 2022 Camry"); // the card opens on the first step
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(screen.getByRole("button", { name: "Other futures (1)" })).toBeInTheDocument();
  });

  it("every control has an accessible name", async () => {
    await enterWorkspace();
    goFuture();
    screen.getAllByRole("button").forEach((b) => expect(b).toHaveAccessibleName());
    screen.getAllByRole("tab").forEach((b) => expect(b).toHaveAccessibleName());
  });
});

describe("the details sheet", () => {
  it("is closed until you ask, and shows the profile, priorities and display options", async () => {
    await enterWorkspace();
    const dialog = screen.getByRole("dialog", { name: "Your details" });
    expect(dialog).toHaveAttribute("data-open", "false");

    openDetails();
    expect(dialog).toHaveAttribute("data-open", "true");
    expect(state().ui.detailsOpen).toBe(true);
    expect(within(dialog).getByTestId("profile-confirm-card")).toBeInTheDocument();
    expect(within(dialog).getByText("What matters to you")).toBeInTheDocument();
    expect(within(dialog).getByText("History")).toBeInTheDocument();
    expect(within(dialog).getByRole("switch", { name: /low performance/i })).toBeInTheDocument();
  });

  it("every number in it has a source label", async () => {
    await enterWorkspace();
    openDetails();
    const rows = screen.getByRole("dialog", { name: "Your details" }).querySelectorAll('[data-slot="data-row"]');
    expect(rows.length).toBeGreaterThan(5);
    rows.forEach((row) => expect(row.querySelector("[data-source]")).not.toBeNull());
  });

  it("closes with the close button, with Escape, and by tapping outside", async () => {
    await enterWorkspace();
    const dialog = screen.getByRole("dialog", { name: "Your details" });

    openDetails();
    fireEvent.click(screen.getByRole("button", { name: "Close details" }));
    expect(dialog).toHaveAttribute("data-open", "false");

    openDetails();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(dialog).toHaveAttribute("data-open", "false");

    openDetails();
    fireEvent.click(dialog.previousElementSibling!); // the dim layer behind it
    expect(dialog).toHaveAttribute("data-open", "false");
  });

  it("the low performance switch reaches CarStage as quality=low", async () => {
    await enterWorkspace();
    expect(screen.getByTestId("car-stage-stub")).toHaveAttribute("data-quality", "high");
    openDetails();
    fireEvent.click(screen.getByRole("switch", { name: /low performance/i }));
    expect(state().ui.lowPerformance).toBe(true);
    expect(screen.getByTestId("car-stage-stub")).toHaveAttribute("data-quality", "low");
  });

  it("view mode buttons drive CarStage viewMode", async () => {
    await enterWorkspace();
    openDetails();
    fireEvent.click(screen.getByRole("button", { name: "Wireframe" }));
    expect(screen.getByTestId("car-stage-stub")).toHaveAttribute("data-view-mode", "wireframe");
    expect(screen.getByRole("button", { name: "Wireframe" })).toHaveAttribute("aria-pressed", "true");
  });

  it("reset camera and replay reveal bump their signals, and replay closes the sheet", async () => {
    await enterWorkspace();
    const before = state().stage;
    openDetails();
    fireEvent.click(screen.getByRole("button", { name: "Reset camera" }));
    expect(state().stage.resetCameraSignal).toBe(before.resetCameraSignal + 1);
    fireEvent.click(screen.getByRole("button", { name: "Replay reveal" }));
    expect(state().stage.replaySignal).toBe(before.replaySignal + 1);
    expect(state().phase).toBe("reveal");
    expect(state().ui.detailsOpen).toBe(false);
  });
});

describe("preferences", () => {
  it("reduced motion from the OS reaches the store and the page", async () => {
    const listeners: Array<(e: { matches: boolean }) => void> = [];
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q.includes("reduce"),
      media: q,
      addEventListener: (_: string, l: (e: { matches: boolean }) => void) => listeners.push(l),
      removeEventListener: () => {},
    }));
    render(<ForkApp />);
    await advance(0);
    expect(state().ui.reducedMotion).toBe(true);
    expect(document.documentElement.dataset.reducedMotion).toBe("true");
    act(() => listeners.forEach((l) => l({ matches: false })));
    expect(state().ui.reducedMotion).toBe(false);
    vi.unstubAllGlobals();
  });

  it("remembers low performance, and nothing about which page or sheet was open", async () => {
    await enterWorkspace();
    openDetails();
    fireEvent.click(screen.getByRole("switch", { name: /low performance/i }));
    goFuture();
    await advance(200);
    const saved = JSON.parse(localStorage.getItem("fork:v1")!);
    expect(saved.prefs).toEqual({ lowPerformance: true });
    expect(JSON.stringify(saved)).not.toMatch(/"view"|detailsOpen/);
  });
});

describe("the specs after the car forms", () => {
  it("are still on the car page when the car can first be turned, instead of flashing past", async () => {
    await enterWorkspace();
    expect(state().phase).toBe("workspace");
    expect(state().ui.view).toBe("car");
    const specs = screen.getByTestId("reveal-specs");
    expect(specs).toHaveTextContent("5 seats");
    expect(specs).toHaveTextContent("32 mpg");
    expect(specs).toHaveAttribute("data-state", "holding");
  });

  it("stay while you look around, hold for about 30 seconds, then fade away slowly and stay gone", async () => {
    await enterWorkspace();
    await advance(20_000);
    expect(screen.getByTestId("reveal-specs")).toHaveAttribute("data-state", "holding");
    await advance(15_000); // past the hold: now fading, not gone
    const el = screen.queryByTestId("reveal-specs");
    expect(el === null || el.getAttribute("data-state") === "fading").toBe(true);
    await advance(10_000);
    expect(screen.queryByTestId("reveal-specs")).toBeNull();
    goFuture();
    goCar();
    expect(screen.queryByTestId("reveal-specs")).toBeNull();
  });

  it("are not on the future page, and are there again on coming back within the time", async () => {
    await enterWorkspace();
    goFuture();
    expect(screen.queryByTestId("reveal-specs")).toBeNull();
    goCar();
    expect(screen.getByTestId("reveal-specs")).toBeInTheDocument();
  });

  it("lift above the command bar instead of sitting under it (small screens)", async () => {
    await enterWorkspace();
    const bottom = parseInt(screen.getByTestId("reveal-specs").style.getPropertyValue("--spec-bottom"), 10);
    expect(bottom).toBeGreaterThanOrEqual(150); // above the bar, never behind it
  });

  it("are a column at the left edge on wide screens, and only fade (opacity), never a moving position", async () => {
    await enterWorkspace();
    const specs = screen.getByTestId("reveal-specs");
    for (const c of ["md:left-6", "md:top-1/2", "md:-translate-y-1/2"]) expect(specs.className).toContain(c);
    expect(specs.style.transitionProperty).toBe("opacity");
  });

  it("the progress line is gone by the time they show", async () => {
    await openCamry();
    act(() => state().actions.onRevealStage("solid"));
    expect(screen.getByTestId("reveal-specs")).toBeInTheDocument();
    expect(screen.queryByTestId("reveal-stage-pill")).toBeNull();
  });

  it("never block turning the car", async () => {
    await enterWorkspace();
    expect(screen.getByTestId("reveal-specs").className).toContain("pointer-events-none");
  });

  it("show again for the other car when you switch", async () => {
    await enterWorkspace();
    await advance(60_000);
    expect(screen.queryByTestId("reveal-specs")).toBeNull();
    openDetails();
    const switchBtn = screen.getAllByRole("button").find((b) => /RAV4/.test(b.textContent ?? "") && /Switch|switch/.test(b.getAttribute("aria-label") ?? b.textContent ?? ""));
    if (switchBtn) {
      fireEvent.click(switchBtn);
      await advance(4100);
      expect(screen.getByTestId("reveal-specs")).toBeInTheDocument();
    } else {
      await act(async () => {
        await state().actions.startFromSample("rav4-2024-hybrid-xle");
      });
      await advance(4100);
      expect(screen.getByTestId("reveal-specs")).toHaveTextContent(`${state().twin!.vehicle.mpg} mpg`);
    }
  });
});

describe("the expanded timeline", () => {
  const expandButton = () => screen.getByTestId("expand-timeline");
  const confirmDenver = () =>
    act(() => {
      state().actions.addDraft(denver);
      state().actions.confirmDrafts(state().explore.draftChanges.map((d) => d.id));
    });

  it("is a round button beside the heading, named for what it does", async () => {
    await enterWorkspace();
    goFuture();
    expect(expandButton()).toHaveAccessibleName("Expand timeline");
    expect(expandButton()).toHaveAttribute("aria-expanded", "false");
    expect(expandButton()).toHaveAttribute("title", "Expand timeline");
    expect(state().ui.futureExpanded).toBe(false);
  });

  it("expands the path to fill the page, with nothing else around it but its card", async () => {
    await enterWorkspace();
    confirmDenver();
    goFuture();
    const normal = screen.getByTestId("winding-scroll").style.height;
    fireEvent.click(expandButton());
    expect(state().ui.futureExpanded).toBe(true);

    const timeline = screen.getByTestId("winding-timeline");
    expect(timeline).toHaveAttribute("data-expanded", "true");
    expect(screen.getByTestId("winding-scroll").style.height).not.toBe(normal);
    expect(screen.getByTestId("winding-scroll").style.height).toMatch(/100dvh/); // sized to the page, not to a fixed number

    // the heading, the recommendation, the options row and the next step are put away
    expect(screen.queryByTestId("future-heading")).toBeNull();
    expect(screen.queryByRole("button", { name: "Details" })).toBeNull();
    expect(screen.queryByTestId("next-step")).toBeNull();
    // what stays: the path with its steps and card, the command bar, the page switch, and the way back
    expect(screen.getAllByTestId("step").length).toBeGreaterThan(1);
    expect(screen.getByTestId("step-detail")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/tell fork what's changing/i)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Future" })).toHaveAttribute("aria-selected", "true");
    expect(expandButton()).toHaveAccessibleName("Collapse timeline");
    expect(expandButton()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("expanded-title")).toHaveTextContent("Move to Denver"); // which future you are looking at
  });

  it("is taller than the normal path, and the path swings further", async () => {
    const { timelineHeight } = await import("@/ui/timeline/WindingTimeline");
    expect(timelineHeight(false)).toBe("340px");
    expect(timelineHeight(true)).toMatch(/100dvh/);
  });

  it("collapses back to exactly the page it came from", async () => {
    await enterWorkspace();
    confirmDenver();
    goFuture();
    const before = screen.getByTestId("future-view").innerHTML;
    fireEvent.click(expandButton());
    fireEvent.click(expandButton());
    expect(state().ui.futureExpanded).toBe(false);
    expect(screen.getByRole("button", { name: "Details" })).toBeInTheDocument();
    expect(screen.getByTestId("winding-timeline")).toHaveAttribute("data-expanded", "false");
    expect(screen.getByTestId("future-view").innerHTML).toBe(before);
  });

  it("keeps the step you were on when it expands and collapses", async () => {
    await enterWorkspace();
    confirmDenver();
    goFuture();
    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(screen.getByTestId("step-title")).toHaveTextContent("A fork in the road");
    fireEvent.click(expandButton());
    expect(screen.getByTestId("step-title")).toHaveTextContent("A fork in the road");
    fireEvent.click(expandButton());
    expect(screen.getByTestId("step-title")).toHaveTextContent("A fork in the road");
  });

  it("Escape collapses it, and does nothing when it is not expanded", async () => {
    await enterWorkspace();
    goFuture();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(state().ui.futureExpanded).toBe(false);
    fireEvent.click(expandButton());
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(state().ui.futureExpanded).toBe(true);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(state().ui.futureExpanded).toBe(false);
  });

  it("Escape closes the details sheet first and leaves the timeline expanded", async () => {
    await enterWorkspace();
    goFuture();
    fireEvent.click(expandButton());
    openDetails();
    expect(state().ui.detailsOpen).toBe(true);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(state().ui.detailsOpen).toBe(false);
    expect(state().ui.futureExpanded).toBe(true);
    fireEvent.keyDown(window, { key: "Escape" }); // and the next one collapses it
    expect(state().ui.futureExpanded).toBe(false);
  });

  it("collapses when you leave the future page, so it comes back normal", async () => {
    await enterWorkspace();
    goFuture();
    fireEvent.click(expandButton());
    goCar();
    expect(state().ui.futureExpanded).toBe(false);
    goFuture();
    expect(screen.getByRole("button", { name: "Details" })).toBeInTheDocument();
    expect(screen.getByTestId("winding-timeline")).toHaveAttribute("data-expanded", "false");
  });

  it("starting over, or opening another car, does not carry it along", async () => {
    await enterWorkspace();
    goFuture();
    fireEvent.click(expandButton());
    act(() => state().actions.resetAll());
    expect(state().ui.futureExpanded).toBe(false);
    await act(async () => {
      await state().actions.startFromSample("camry-2022-se");
    });
    expect(state().ui.futureExpanded).toBe(false);
  });

  it("works after comparing: both ways and the engine's word on them, with the verdict put away until you collapse", async () => {
    await enterWorkspace();
    goFuture();
    fireEvent.click(screen.getByRole("button", { name: /Explore the 2024 RAV4/ }));
    await advance(0);
    expect(screen.getByTestId("verdict")).toBeInTheDocument();
    fireEvent.click(expandButton());
    expect(screen.queryByTestId("verdict")).toBeNull();
    expect(screen.getByTestId("expanded-title")).toHaveTextContent("Your options over five years");
    expect(screen.getAllByTestId("fork-end")).toHaveLength(2);
    fireEvent.click(expandButton());
    expect(screen.getByTestId("verdict")).toBeInTheDocument();
    expect(screen.getByTestId("next-step")).toBeInTheDocument();
  });

  it("keeps the command bar usable above the page, and reads no new words", async () => {
    await enterWorkspace();
    goFuture();
    fireEvent.click(expandButton());
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/demo|data/i);
    expect(text).not.toContain("\u2014");
    expect(screen.getByRole("button", { name: "Submit changes" })).toBeInTheDocument();
  });
});

describe("the rider chips", () => {
  const dock = () => screen.getByTestId("rider-dock");

  it("sit in a row while the car forms, then move to a side panel when it can be turned", async () => {
    await openCamry(); // the reveal has begun
    expect(state().phase).toBe("reveal");
    expect(dock()).toHaveAttribute("data-mode", "row");
    expect(within(dock()).getAllByRole("button").map((b) => b.textContent)).toEqual(["Just me", "Partner", "Kids", "Mixed"]);
    expect(screen.getByTestId("reveal-overlay")).not.toContainElement(dock()); // they are not part of what goes away with the reveal

    await advance(4100);
    expect(state().phase).toBe("workspace");
    expect(dock()).toHaveAttribute("data-mode", "panel");
    expect(dock()).toHaveAttribute("data-visible", "true");
    expect(screen.queryByTestId("reveal-overlay")).toBeNull();
  });

  it("are the same chips afterwards, and still answer the question", async () => {
    await openCamry();
    const before = within(dock()).getAllByRole("button");
    await advance(4100);
    expect(within(dock()).getAllByRole("button")).toEqual(before);
    fireEvent.click(within(dock()).getByRole("button", { name: "Kids" }));
    expect([state().explore.confirmedProfile.householdSize, state().explore.confirmedProfile.children]).toEqual([3, 1]);
    expect(within(dock()).getByRole("button", { name: "Kids" })).toHaveAttribute("aria-pressed", "true");
  });

  it("are on the car page only, and a replayed reveal brings them back to the row", async () => {
    await enterWorkspace();
    goFuture();
    expect(dock()).toHaveAttribute("data-visible", "false");
    goCar();
    expect(dock()).toHaveAttribute("data-visible", "true");
    openDetails();
    fireEvent.click(screen.getByRole("button", { name: "Replay reveal" }));
    expect(state().phase).toBe("reveal");
    expect(dock()).toHaveAttribute("data-mode", "row");
  });

  it("never block turning the car, and read no build words", async () => {
    await enterWorkspace();
    expect(dock().className).toContain("pointer-events-none");
    expect(dock().textContent).not.toMatch(/demo|data/i);
  });
});

