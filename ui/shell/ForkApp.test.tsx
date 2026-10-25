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

async function openCamry() {
  render(<ForkApp />);
  await advance(0);
  fireEvent.click(screen.getByRole("button", { name: /2022 Camry SE/ }));
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
    expect(screen.getByRole("button", { name: /2024 RAV4 Hybrid XLE/ })).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: /2022 Camry SE/ })).toBeInTheDocument();
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
  it("is just the car, its name, the command bar and the page switch", async () => {
    await enterWorkspace();
    expect(screen.getByRole("heading", { level: 1, name: "2022 Toyota Camry" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/tell fork what's changing/i)).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "Page" })).toBeInTheDocument();

    // no numbers, no timeline, no side panels
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
    // the identity line under the car (the credits footer says "Representative 3D models" too)
    expect(screen.getAllByText(/Representative 3D model/).some((el) => el.textContent?.includes("Move to Denver"))).toBe(true);
  });

  it("never prints placeholder paint text from the fixtures", async () => {
    await enterWorkspace();
    openDetails();
    expect(document.body.textContent).not.toMatch(/TODO/);
  });
});

describe("the future page", () => {
  it("opens on the five year picture with one big number and its source", async () => {
    await enterWorkspace();
    goFuture();
    expect(screen.getByRole("tab", { name: "Future" })).toHaveAttribute("aria-selected", "true");
    expect(state().activeMonth).toBe(60);
    expect(stats()[0]).toHaveTextContent("Net cost, 5 yr");
    expect(screen.getByRole("slider", { name: "Month" })).toHaveAttribute("aria-valuetext", "5 yr");
  });

  it("is minimal by default: the headline, the road, and quiet options. Nothing else.", async () => {
    await enterWorkspace();
    goFuture();
    const view = screen.getByTestId("future-view");
    expect(screen.getByTestId("road")).toBeInTheDocument();
    expect(stats()).toHaveLength(1); // only the headline number
    // no lanes, no details, no other futures, no verdict until you ask
    expect(screen.queryByTestId("future-details")).toBeNull();
    expect(screen.queryAllByTestId("road-future")).toHaveLength(0);
    expect(screen.queryByRole("region", { name: "Keep or replace" })).toBeNull();
    // three quiet options at most: Details, and (with something to compare) the compare action
    expect(within(view).getByRole("button", { name: "Details" })).toHaveAttribute("aria-pressed", "false");
    expect(within(view).getByRole("button", { name: /Compare with a 2024 RAV4/ })).toBeInTheDocument();
    expect(within(view).queryByRole("button", { name: /Other futures/ })).toBeNull(); // nothing else to show yet
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("Details is opt-in, lives in the store, and shows what each decision changed", async () => {
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

    const rows = screen.getAllByTestId("decision-effect");
    expect(rows).toHaveLength(2);
    const byTitle = (t: string) => rows.find((r) => r.textContent!.includes(t))!;
    // the stand-in sim reacts to mileage, not to a move: the road says exactly that
    expect(byTitle("24,000 miles a year").textContent).toMatch(/Adds \$[\d,]+/);
    expect(byTitle("Move to Denver")).toHaveTextContent("No change to cost.");
    expect(byTitle("Move to Denver")).toHaveTextContent("the simulation does not use location");
    // every dollar figure carries its source; a decision that moves no dollar has no figure to label
    expect(byTitle("24,000 miles a year").querySelector("[data-source]")).not.toBeNull();
    expect(byTitle("Move to Denver").querySelector("[data-source]")).toBeNull();

    // the four supporting numbers arrive with it, each with a source
    expect(stats()).toHaveLength(5);
    stats().forEach((st) => expect(st.querySelector("[data-source]")).not.toBeNull());
    for (const label of ["Odometer", "Fuel so far", "Upkeep so far", "Resale value"]) {
      expect(within(screen.getByTestId("future-details")).getByText(label)).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(screen.queryByTestId("future-details")).toBeNull();
    expect(stats()).toHaveLength(1);
  });

  it("Details on a road with nothing on it says so plainly", async () => {
    await enterWorkspace();
    goFuture();
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(screen.getByTestId("future-details")).toHaveTextContent("No decisions yet, so nothing has changed.");
  });

  it("every number on the page has a source label", async () => {
    await enterWorkspace();
    act(() => {
      state().actions.addDraft(denver);
      state().actions.confirmDrafts(state().explore.draftChanges.map((d) => d.id));
    });
    goFuture();
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(stats().length).toBeGreaterThan(1);
    stats().forEach((st) => expect(st.querySelector("[data-source]")).not.toBeNull());
    expect(screen.getByTestId("road-effect").querySelector("[data-source]")).not.toBeNull();
  });

  it("scrubbing updates the numbers", async () => {
    await enterWorkspace();
    goFuture();
    const headline = () => stats()[0].textContent;
    const at60 = headline();
    scrubTo(24);
    expect(state().activeMonth).toBe(24);
    expect(headline()).not.toBe(at60);
    expect(headline()).toContain("Net cost, 2 yr");
  });

  it("other futures are a choice: the option appears with a count, and turning it on names them on the road", async () => {
    await enterWorkspace();
    act(() => {
      state().actions.addDraft(denver);
      state().actions.confirmDrafts(state().explore.draftChanges.map((d) => d.id));
    });
    goFuture();
    const toggle = screen.getByRole("button", { name: "Other futures (1)" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryAllByTestId("road-future")).toHaveLength(0);
    expect(screen.getByTestId("future-name")).toHaveTextContent("Move to Denver");

    fireEvent.click(toggle);
    expect(state().ui.futureCompare).toBe(true);
    expect(screen.getAllByTestId("road-future")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: /Keep the Camry/ }));
    expect(screen.getByTestId("future-name")).toHaveTextContent("Keep the Camry");
  });

  it("asking to compare with the RAV4 shows both roads and the verdict, and the car morphs behind the page", async () => {
    await enterWorkspace();
    goFuture();
    fireEvent.click(screen.getByRole("button", { name: /Compare with a 2024 RAV4/ }));
    await advance(0);
    expect(screen.getByTestId("car-stage-stub")).toHaveAttribute("data-phase", "transition");
    await advance(1900);
    expect(screen.getByTestId("car-stage-stub")).toHaveAttribute("data-vehicle-id", "rav4-2024-hybrid-xle");

    // The verdict is the engine's, so assert that there is one, not which it is (the demo story is pinned in its own test).
    expect(screen.getByRole("region", { name: "Keep or replace" })).toHaveTextContent(/Keep your Camry|Switch to the RAV4|Close call/);
    // you asked to compare, so the other future is on the road without another click
    expect(state().ui.futureCompare).toBe(true);
    const names = screen.getAllByTestId("road-future");
    expect(names).toHaveLength(2);
    expect(names.find((n) => n.textContent!.includes("Replace with RAV4"))).toHaveAttribute("aria-current", "true");
    // the compare action is gone once there is a verdict
    expect(screen.queryByRole("button", { name: /Compare with a/ })).toBeNull();

    goCar();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("2024 Toyota RAV4");
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
  it("once you compare, the verdict is the headline, then the road, then the next step", async () => {
    await enterWorkspace();
    goFuture();
    expect(screen.getByText(/Net cost, 5 yr/)).toBeInTheDocument(); // the single headline number, before comparing
    fireEvent.click(screen.getByRole("button", { name: /Compare with a 2024 RAV4/ }));
    await advance(0);

    const verdict = screen.getByTestId("verdict");
    const road = screen.getByTestId("road");
    const next = screen.getByTestId("next-step");
    const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before(verdict, road)).toBe(true);
    expect(before(road, next)).toBe(true);
    // the number is not repeated: the road's readout carries the cost at the playhead
    expect(screen.queryByText(/Net cost, 5 yr/)).toBeNull();
    // the road makes room so all of it fits above the command bar
    expect(road.style.height).toMatch(/30vh/);
    // and the road names each future itself, so the page does not say the name twice
    expect(screen.queryByTestId("future-name")).toBeNull();
  });

  it("the comparison's two options sit in the same row as Details and Other futures", async () => {
    await enterWorkspace();
    goFuture();
    fireEvent.click(screen.getByRole("button", { name: /Compare with a 2024 RAV4/ }));
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
    expect(screen.getByTestId("road-active")).toBeInTheDocument();
    expect(screen.getByTestId("road-baseline")).toBeInTheDocument(); // there is now something to compare against
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
