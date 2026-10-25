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
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null); // jsdom has no canvas; the streams' labels still render
  localStorage.clear();
  resetForkStoreForTests();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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

describe("the page switch", () => {
  it("is a real tab set: arrow keys switch pages, and the open page is its tab's panel", async () => {
    await enterWorkspace();
    expect(screen.getByRole("tab", { name: "Car" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Car" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Car" }), { key: "ArrowRight" });
    expect(state().ui.view).toBe("future");
    expect(screen.getByRole("tab", { name: "Future" })).toHaveFocus();
    const panel = screen.getByRole("tabpanel", { name: "Future" });
    expect(panel).toContainElement(screen.getByTestId("future-view"));
    expect(screen.getByRole("tab", { name: "Car" })).toHaveAttribute("tabindex", "-1");
  });
});

describe("the future page", () => {
  const openNumbers = () => fireEvent.click(screen.getByRole("button", { name: "See the numbers" }));
  const confirmDenver = () =>
    act(() => {
      state().actions.addDraft(denver);
      state().actions.confirmDrafts(state().explore.draftChanges.map((d) => d.id));
    });

  it("opens on your future as particles: a heading, one stream, and the other car as a choice", async () => {
    await enterWorkspace();
    goFuture();
    expect(screen.getByRole("tab", { name: "Future" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Your next 5 years");
    expect(screen.getByTestId("future-subline")).toHaveTextContent("if nothing changes");
    const field = screen.getByTestId("future-field");
    expect(within(field).getAllByTestId("field-tag")).toHaveLength(1);
    expect(within(field).getByRole("button", { name: /If nothing changes/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(field).getByTestId("field-offer")).toHaveTextContent("Switch to a 2024 RAV4 Hybrid XLE?");
  });

  it("shows no data by default: no numbers, no road, no lists", async () => {
    await enterWorkspace();
    goFuture();
    expect(stats()).toHaveLength(0);
    expect(screen.queryByTestId("the-numbers")).toBeNull();
    expect(screen.queryByTestId("road")).toBeNull();
    expect(screen.queryByTestId("decision-list")).toBeNull();
    expect(screen.getByTestId("future-field").textContent).not.toMatch(/\$\d/);
    expect(screen.queryByRole("complementary")).toBeNull();
    // one quiet option: the numbers
    const view = screen.getByTestId("future-view");
    expect(within(view).getByRole("button", { name: "See the numbers" })).toHaveAttribute("aria-pressed", "false");
    expect(within(view).queryByRole("button", { name: /Other futures/ })).toBeNull();
  });

  it("the numbers are one button away, and bring the list, the options and the road", async () => {
    await enterWorkspace();
    confirmDenver();
    goFuture();
    openNumbers();
    expect(state().ui.futureDetails).toBe(true);
    expect(screen.getByRole("button", { name: "See the numbers" })).toHaveAttribute("aria-pressed", "true");
    const numbers = screen.getByTestId("the-numbers");
    expect(within(numbers).getByTestId("decision-list")).toBeInTheDocument();
    expect(within(numbers).getByTestId("your-options")).toBeInTheDocument();
    expect(within(numbers).getByTestId("road")).toBeInTheDocument();
    for (const label of ["Odometer", "Fuel so far", "Upkeep so far", "Resale value"]) {
      expect(within(screen.getByTestId("future-details")).getByText(label)).toBeInTheDocument();
    }
    openNumbers();
    expect(screen.queryByTestId("the-numbers")).toBeNull();
    expect(stats()).toHaveLength(0);
  });

  it("says what Net cost means, at the top of the options, in words with no number in them", async () => {
    await enterWorkspace();
    goFuture();
    openNumbers();
    const def = screen.getByTestId("net-cost-definition");
    expect(def).toHaveTextContent("Net cost is what the car costs you from today");
    expect(def).toHaveTextContent("fuel, upkeep, insurance and financing costs");
    expect(def).toHaveTextContent("minus anything you get back from selling it");
    expect(def.textContent).not.toMatch(/\d|\u2014/);
    expect(screen.getByTestId("your-options")).toContainElement(def);
    expect(def.compareDocumentPosition(stats()[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("says it once, even after you compare", async () => {
    await enterWorkspace();
    goFuture();
    openNumbers();
    fireEvent.click(within(screen.getByTestId("future-field")).getByTestId("field-offer"));
    await advance(0);
    expect(screen.getAllByTestId("net-cost-definition")).toHaveLength(1);
  });

  it("with nothing confirmed yet, the list of changes says so plainly and points at the command bar", async () => {
    await enterWorkspace();
    goFuture();
    openNumbers();
    expect(screen.getByTestId("decision-list")).toHaveTextContent("Nothing yet, so nothing has changed.");
    expect(screen.getByTestId("decision-list")).toHaveTextContent("Tell Fork what's changing in the box below");
    expect(screen.queryAllByTestId("decision-effect")).toHaveLength(0);
  });

  it("lists what you told Fork with what each did, and the supporting numbers carry their sources", async () => {
    await enterWorkspace();
    act(() => {
      state().actions.addDraft({ ...denver, month: 12 });
      state().actions.addDraft({ type: "mileage_change", month: 12, payload: { annualMiles: 24000 }, source: "user", assumptions: [], certainty: "clear" });
      state().actions.confirmDrafts(state().explore.draftChanges.map((d) => d.id));
    });
    goFuture();
    openNumbers();
    const rows = screen.getAllByTestId("decision-effect");
    expect(rows).toHaveLength(2);
    const byTitle = (t: string) => rows.find((r) => r.textContent!.includes(t))!;
    expect(byTitle("24,000 miles a year").textContent).toMatch(/Adds \$[\d,]+/);
    expect(byTitle("Move to Denver")).toHaveTextContent("No change to cost.");
    expect(byTitle("Move to Denver")).toHaveTextContent("the simulation does not use location");
    expect(byTitle("24,000 miles a year").querySelector("[data-source]")).not.toBeNull();
    expect(byTitle("Move to Denver").querySelector("[data-source]")).toBeNull(); // no number, nothing to label
    stats().forEach((st) => expect(st.querySelector("[data-source]")).not.toBeNull());
  });

  it("every number on the page has a source label", async () => {
    await enterWorkspace();
    confirmDenver();
    goFuture();
    openNumbers();
    expect(stats().length).toBeGreaterThan(1);
    stats().forEach((st) => expect(st.querySelector("[data-source]")).not.toBeNull());
    expect(screen.getByTestId("road-effect").querySelector("[data-source]")).not.toBeNull();
  });

  it("scrubbing updates the numbers", async () => {
    await enterWorkspace();
    goFuture();
    openNumbers();
    const headline = () => stats()[0].textContent;
    const at60 = headline();
    scrubTo(24);
    expect(state().activeMonth).toBe(24);
    expect(headline()).not.toBe(at60);
    expect(headline()).toContain("Net cost, 2 yr");
  });

  it("a confirmed change splits the stream, and its name and what you told Fork are on it", async () => {
    await enterWorkspace();
    confirmDenver();
    goFuture();
    const field = screen.getByTestId("future-field");
    const tags = within(field).getAllByTestId("field-tag");
    expect(tags.map((t) => t.textContent)).toEqual([expect.stringContaining("If nothing changes"), expect.stringContaining("Move to Denver")]);
    expect(within(field).getByRole("button", { name: /Move to Denver/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(field).getAllByTestId("field-decision").map((d) => d.textContent)).toEqual([expect.stringContaining("Move to Denver")]);
    expect(screen.getByTestId("future-subline")).toHaveTextContent("Tap a name");
  });

  it("every future stays on the particles, and tapping a name looks at that future", async () => {
    await enterWorkspace();
    confirmDenver();
    goFuture();
    const field = screen.getByTestId("future-field");
    fireEvent.click(within(field).getByRole("button", { name: /If nothing changes/ }));
    expect(state().activeScenarioId).toBe("base");
    expect(within(field).getAllByTestId("field-tag")).toHaveLength(2); // the other is still one tap away
    fireEvent.click(within(field).getByRole("button", { name: /Move to Denver/ }));
    expect(state().activeScenarioId).not.toBe("base");
  });

  it("on the road, the other futures are a choice: the option appears with a count, and turning it on names them", async () => {
    await enterWorkspace();
    confirmDenver();
    goFuture();
    openNumbers();
    const toggle = screen.getByRole("button", { name: "Other futures (1)" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryAllByTestId("road-future")).toHaveLength(0);
    fireEvent.click(toggle);
    expect(state().ui.futureCompare).toBe(true);
    expect(screen.getAllByTestId("road-future")).toHaveLength(2);
  });

  it("asking to compare with the RAV4 shows both futures and the verdict, and the car morphs behind the page", async () => {
    await enterWorkspace();
    goFuture();
    fireEvent.click(within(screen.getByTestId("future-field")).getByTestId("field-offer"));
    await advance(0);
    expect(screen.getByTestId("car-stage-stub")).toHaveAttribute("data-phase", "transition");
    await advance(1900);
    expect(screen.getByTestId("car-stage-stub")).toHaveAttribute("data-vehicle-id", "rav4-2024-hybrid-xle");

    // The verdict is the engine's, so assert that there is one, not which it is (the demo story is pinned in its own test).
    expect(screen.getByRole("region", { name: "Keep or replace" })).toHaveTextContent(/Keep your Camry|Switch to the RAV4|Close call/);
    const field = screen.getByTestId("future-field");
    expect(within(field).getByRole("button", { name: /Keep your Camry/ })).toBeInTheDocument();
    expect(within(field).getByRole("button", { name: /Switch to the RAV4/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(field).getByRole("button", { name: /Switch to the RAV4/ }).textContent).toMatch(/costs (more|less|the same)/);
    // the offer is gone once it has been looked at
    expect(within(field).queryByTestId("field-offer")).toBeNull();
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
  it("once you compare: the verdict, the futures, then the next step. The numbers wait behind their button.", async () => {
    await enterWorkspace();
    goFuture();
    fireEvent.click(within(screen.getByTestId("future-field")).getByTestId("field-offer"));
    await advance(0);

    const verdict = screen.getByTestId("verdict");
    const field = screen.getByTestId("future-field");
    const next = screen.getByTestId("next-step");
    const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before(verdict, field)).toBe(true);
    expect(before(field, next)).toBe(true);
    expect(stats()).toHaveLength(0);
    expect(screen.queryByTestId("road")).toBeNull();

    // the numbers, side by side, when asked for
    fireEvent.click(screen.getByRole("button", { name: "See the numbers" }));
    expect(screen.getAllByText(/Net cost, 5 yr/)).toHaveLength(2);
    expect(within(screen.getByTestId("option-keep")).getByText(/Net cost, 5 yr/)).toBeInTheDocument();
    expect(within(screen.getByTestId("option-replace")).getByText(/Net cost, 5 yr/)).toBeInTheDocument();
    expect(screen.getByTestId("road").style.height).toMatch(/30vh/); // the road tightens once there is a verdict
  });

  it("the comparison's options sit in the same row as the numbers", async () => {
    await enterWorkspace();
    goFuture();
    fireEvent.click(within(screen.getByTestId("future-field")).getByTestId("field-offer"));
    await advance(0);
    const row = screen.getByRole("button", { name: "See the numbers" }).parentElement!;
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
    const field = screen.getByTestId("future-field");
    expect(within(field).getAllByTestId("field-tag")).toHaveLength(2); // there is now something to compare against
    expect(within(field).getByRole("button", { name: /Move to Denver/ })).toBeInTheDocument();
    expect(screen.getByTestId("confirmed-card")).toBeInTheDocument(); // and what each change did, once
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
