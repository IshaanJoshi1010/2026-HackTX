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
// Opens the drawer and every dropdown in it, so a test can reach any control. (DetailsSheet.test.tsx covers the dropdowns.)
const openDetails = () => {
  fireEvent.click(screen.getByRole("button", { name: "Edit assumptions" }));
  const dialog = screen.getByRole("dialog", { name: "Edit assumptions" });
  for (const h of within(dialog).getAllByRole("heading", { level: 3 })) {
    const header = within(h).getByRole("button");
    if (header.getAttribute("aria-expanded") !== "true") fireEvent.click(header);
  }
};
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
    expect(screen.queryByRole("button", { name: "Edit assumptions" })).toBeNull();
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
    fireEvent.click(within(screen.getByRole("dialog", { name: "Edit assumptions" })).getByRole("button", { name: /2024 RAV4/ }));
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
    expect(within(header).getByRole("button", { name: "Edit assumptions" })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: /Compare with the 2024 RAV4/ }));
    await advance(0);
  };
  const tab = (id: string) => screen.getByTestId(`tab-${id}`);

  it("opens with the decision on top: a small intro, the heading, what keeping costs, and a way to compare", async () => {
    await enterWorkspace();
    goFuture();
    expect(screen.getByRole("tab", { name: "Future" })).toHaveAttribute("aria-selected", "true");
    expect(state().activeMonth).toBe(60);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Your next five years");
    const summary = screen.getByTestId("verdict");
    expect(summary).toHaveTextContent("Life takes turns.");
    expect(screen.getByTestId("verdict-headline")).toHaveTextContent("Your next five years");
    expect(summary).toHaveTextContent("Modeled net cost over five years");
    expect(screen.getByTestId("cost-keep")).toHaveTextContent("Keep your Camry");
    expect(screen.getByTestId("cost-keep").querySelector("[data-source]")).not.toBeNull(); // the number says where it came from
    expect(within(screen.getByTestId("cost-switch")).getByRole("button", { name: /Compare with the 2024 RAV4 Hybrid XLE/ })).toBeInTheDocument();
    expect(screen.getByTestId("cost-difference")).toHaveTextContent("Not compared yet");
    expect(screen.getByTestId("why-sentence")).toHaveTextContent("Compare with the RAV4");
    expect(screen.queryByTestId("next-step")).toBeNull(); // there is no recommendation to follow up yet
  });

  it("then the journey, which is only events and choices: the path, and the other car as a dashed offer", async () => {
    await enterWorkspace();
    goFuture();
    const journey = screen.getByTestId("journey");
    expect(within(journey).getByRole("heading", { level: 2, name: "Your journey" })).toBeInTheDocument();
    expect(within(journey).getByTestId("winding-timeline")).toBeInTheDocument();
    // nothing has been said yet: where you start, then the choice
    expect(within(journey).getAllByTestId("step-label").map((l) => l.textContent)).toEqual([expect.stringContaining("Your 2022 Camry"), expect.stringContaining("Your choice")]);
    expect(within(journey).getByRole("button", { name: /Keep your 2022 Camry/ })).toBeInTheDocument();
    expect(within(journey).getByRole("button", { name: /Explore the 2024 RAV4 Hybrid XLE/ })).toBeInTheDocument();
    expect(screen.getByTestId("path-down")).toHaveAttribute("data-dashed", "true");
    expect(screen.queryByTestId("future-selector")).toBeNull(); // one future so far: nothing to choose between
  });

  it("is minimal by default: the deeper panels, the chart and the drawer all wait behind a click", async () => {
    await enterWorkspace();
    goFuture();
    expect(screen.queryByTestId("costs-panel")).toBeNull();
    expect(screen.queryByTestId("road")).toBeNull(); // the road is gone from the page
    expect(screen.queryByTestId("panel-costs")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Edit assumptions" })).toHaveAttribute("data-open", "false");
    // before there is a comparison there is nothing to explain, so only Costs and the inputs are offered
    expect(within(screen.getByTestId("deep-dive")).getAllByRole("button").map((b) => b.textContent)).toEqual(["Costs", "Edit assumptions"]);
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("tap a step and its details open under it: the selected event, its effect, then why", async () => {
    await enterWorkspace();
    act(() => {
      state().actions.addDraft({ ...denver, month: 12 });
      state().actions.addDraft({ type: "mileage_change", month: 12, payload: { annualMiles: 24000 }, source: "user", assumptions: [], certainty: "clear" });
      state().actions.confirmDrafts(state().explore.draftChanges.map((d) => d.id));
    });
    goFuture();
    expect(stepButtons().map((b) => b.textContent)).toEqual(["01", "02", "03", ""]); // start, two changes, then the unnumbered choice
    expect(screen.getByTestId("step-title")).toHaveTextContent("Your 2022 Camry");

    const byKey = (title: string) => stepButtons().find((b) => b.getAttribute("aria-label")!.includes(title))!;
    fireEvent.click(byKey("24,000 miles a year"));
    const detail = screen.getByTestId("step-detail");
    expect(screen.getByTestId("step-title")).toHaveTextContent("24,000 miles a year");
    expect(byKey("24,000 miles a year")).toHaveAttribute("aria-current", "step");
    expect(["Selected event", "Effect", "Explanation"].map((t) => detail.textContent!.indexOf(t))).toEqual([...["Selected event", "Effect", "Explanation"].map((t) => detail.textContent!.indexOf(t))].sort((x, y) => x - y));
    expect(detail.textContent).not.toContain("-1");
    expect(screen.getByTestId("step-effect").textContent).toMatch(/Adds \$[\d,]+ over 5 yr/); // the stand-in sim reacts to mileage
    expect(screen.getByTestId("step-effect").querySelector("[data-source]")).not.toBeNull();

    fireEvent.click(byKey("Move to Denver"));
    expect(screen.getByTestId("step-title")).toHaveTextContent("Move to Denver");
    expect(screen.getByTestId("step-effect")).toHaveTextContent("No change to cost.");
    expect(screen.getByTestId("step-effect").querySelector("[data-source]")).toBeNull(); // no number, nothing to label
    expect(screen.getByTestId("step-detail")).toHaveTextContent("\u201cmoving to Denver next year\u201d"); // what you said
  });

  it("the totals are not repeated inside each event: the event details carry no net cost", async () => {
    await enterWorkspace();
    confirmDenver();
    goFuture();
    for (const b of stepButtons()) {
      fireEvent.click(b);
      expect(screen.getByTestId("step-detail").querySelector('[data-slot="stat"]')).toBeNull();
      expect(screen.getByTestId("step-detail").textContent).not.toMatch(/Net cost over/);
    }
  });

  it("previous and next, and the arrow keys, walk the path, and the choice is not counted as a step", async () => {
    await enterWorkspace();
    confirmDenver();
    goFuture();
    expect(screen.getByTestId("step-count")).toHaveTextContent("1 of 2"); // where you start, and the move
    expect(screen.getByRole("button", { name: "Previous step" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(screen.getByTestId("step-count")).toHaveTextContent("2 of 2");
    expect(screen.getByTestId("step-title")).toHaveTextContent("Move to Denver");
    fireEvent.keyDown(stepButtons()[1], { key: "ArrowRight" });
    expect(screen.getByTestId("step-count")).toHaveTextContent("Your choice");
    expect(stepButtons()[2]).toHaveFocus();
    expect(screen.getByRole("button", { name: "Next step" })).toBeDisabled();
    fireEvent.keyDown(stepButtons()[2], { key: "Home" });
    expect(screen.getByTestId("step-count")).toHaveTextContent("1 of 2");
    expect(stepButtons().map((b) => b.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]); // only the open one is in the tab order
  });

  it("before comparing, the choice's details say to compare, rather than guess at a tradeoff", async () => {
    await enterWorkspace();
    goFuture();
    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(screen.getByTestId("step-detail")).toHaveTextContent("Your choice");
    expect(screen.getByTestId("step-detail")).toHaveTextContent("Compare with the RAV4 to see the tradeoff");
    expect(screen.queryByTestId("tradeoff-rows")).toBeNull();
  });

  it("Costs opens the chart and what each change did, and closes again", async () => {
    await enterWorkspace();
    confirmDenver();
    goFuture();
    expect(tab("costs")).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(tab("costs"));
    expect(state().ui.futureDetails).toBe(true);
    expect(tab("costs")).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByTestId("panel-costs");
    expect(within(panel).getByTestId("cost-chart")).toBeInTheDocument(); // a chart with labeled dollar and time axes
    expect(within(panel).getByTestId("cost-chart-xtitle")).toHaveTextContent("Years from now");
    expect(within(panel).getByTestId("cost-chart-ytitle")).toHaveTextContent("Net cost");
    expect(within(panel).getAllByTestId("decision-effect").length).toBeGreaterThan(0); // the breakdown is directly under it
    fireEvent.click(tab("costs"));
    expect(screen.queryByTestId("panel-costs")).toBeNull();
    expect(state().ui.futureDetails).toBe(false);
  });

  it("every number in the Costs panel has a source label, and the month slider moves its readout", async () => {
    await enterWorkspace();
    confirmDenver();
    goFuture();
    fireEvent.click(tab("costs"));
    const panel = screen.getByTestId("panel-costs");
    const readout = () => within(panel).getByTestId("cost-readout").textContent;
    const at60 = readout();
    scrubTo(24);
    expect(state().activeMonth).toBe(24);
    expect(readout()).not.toBe(at60);
    within(panel).getAllByTestId("cost-readout-line").forEach((l) => expect(l.querySelector("[data-source]")).not.toBeNull());
    panel.querySelectorAll('[data-slot="stat"]').forEach((st) => expect(st.querySelector("[data-source]")).not.toBeNull());
  });

  it("with nothing confirmed the Costs breakdown says so plainly", async () => {
    await enterWorkspace();
    goFuture();
    fireEvent.click(tab("costs"));
    expect(screen.getByTestId("future-details")).toHaveTextContent(/No decisions yet|nothing has changed/i);
  });

  it("the other futures are a selector beside the journey, and choosing one looks at it", async () => {
    await enterWorkspace();
    confirmDenver();
    goFuture();
    const selector = within(screen.getByTestId("journey")).getByTestId("future-selector") as HTMLSelectElement;
    expect([...selector.options].map((o) => o.textContent)).toEqual(["If nothing changes", "Move to Denver"]);
    fireEvent.change(selector, { target: { value: "base" } });
    expect(state().activeScenarioId).toBe("base");
    expect(screen.getAllByTestId("step-label").map((l) => l.textContent)).toEqual([expect.stringContaining("Your 2022 Camry"), expect.stringContaining("Your choice")]);
  });

  it("comparing from the totals shows both costs, the verdict and the next step, and the car morphs behind the page", async () => {
    await enterWorkspace();
    goFuture();
    await compareNow();
    expect(screen.getByTestId("car-stage-stub")).toHaveAttribute("data-phase", "transition");
    await advance(1900);
    expect(screen.getByTestId("car-stage-stub")).toHaveAttribute("data-vehicle-id", "rav4-2024-hybrid-xle");

    // The verdict is the engine's, so assert that there is one, not which it is (the demo story is pinned in its own test).
    expect(screen.getByRole("region", { name: "Keep or replace" })).toHaveTextContent(/Keep your Camry|Switch to the RAV4|Close call/);
    expect(screen.getByTestId("cost-switch")).toHaveTextContent("Switch to the RAV4");
    expect(screen.getByTestId("cost-switch").querySelector("[data-source]")).not.toBeNull();
    expect(screen.getByTestId("cost-difference").textContent).toMatch(/Switching (adds|saves) \$[\d,]+|No difference/);
    expect(screen.getByTestId("why-sentence").textContent).not.toMatch(/Compare with the RAV4/);
    expect(screen.getByTestId("next-step")).toBeInTheDocument();
    expect(state().ui.futureCompare).toBe(true);
    expect(screen.getAllByTestId("fork-end").map((e) => e.getAttribute("data-option")).sort()).toEqual(["keep", "replace"]);
    expect(screen.queryByRole("button", { name: /Compare with the 2024 RAV4/ })).toBeNull(); // the offer is gone once it is priced

    goCar();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("2024 Toyota RAV4");
  });

  it("after comparing, the reasons and what could change join the tabs, one panel at a time", async () => {
    await enterWorkspace();
    goFuture();
    await compareNow();
    expect(within(screen.getByTestId("deep-dive")).getAllByRole("button").map((b) => b.textContent)).toEqual(["Costs", "Why this result", "What could change", "Edit assumptions"]);
    fireEvent.click(tab("costs"));
    fireEvent.click(tab("why"));
    expect(screen.queryByTestId("panel-costs")).toBeNull();
    expect(within(screen.getByTestId("panel-why")).getByTestId("why-robustness").textContent).toMatch(/Held in \d+ of \d+ tested cases/);
    expect(within(screen.getByTestId("panel-why")).getByTestId("why")).toBeInTheDocument();
    fireEvent.click(tab("change"));
    expect(screen.queryByTestId("panel-why")).toBeNull();
    expect(state().breakEven).not.toBeNull(); // opening it ran the engine's break-even
    expect(screen.getByTestId("panel-change")).toBeInTheDocument();
  });

  it("the robustness count is in Why this result and not on the front page", async () => {
    await enterWorkspace();
    goFuture();
    await compareNow();
    expect(screen.getByTestId("verdict").textContent).not.toMatch(/tested cases/);
    fireEvent.click(tab("why"));
    expect(screen.getByTestId("panel-why").textContent).toMatch(/tested cases/);
  });

  it("Edit assumptions opens the drawer", async () => {
    await enterWorkspace();
    goFuture();
    fireEvent.click(tab("assumptions"));
    expect(state().ui.detailsOpen).toBe(true);
    expect(screen.getByRole("dialog", { name: "Edit assumptions" })).toHaveAttribute("data-open", "true");
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
  it("each section has one job, in order: the decision and its next step, the journey, then the deeper tabs", async () => {
    await enterWorkspace();
    goFuture();
    fireEvent.click(screen.getByRole("button", { name: /Compare with the 2024 RAV4/ }));
    await advance(0);

    const el = (id: string) => screen.getByTestId(id);
    const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before(el("verdict-headline"), el("cost-keep"))).toBe(true); // the heading, then the numbers that explain it
    expect(before(el("cost-keep"), el("why-sentence"))).toBe(true); // then why
    expect(before(el("why-sentence"), el("next-step"))).toBe(true); // the next step directly beneath the recommendation
    expect(before(el("next-step"), el("journey"))).toBe(true);
    expect(before(el("journey"), el("deep-dive"))).toBe(true);
    expect(el("verdict").contains(el("next-step"))).toBe(true);
    // nothing deeper is on screen until asked for
    expect(screen.queryByTestId("road")).toBeNull();
    expect(screen.queryByTestId("panel-costs")).toBeNull();
  });

  it("the default screen is the verdict, both costs, the journey, the selected event and the next step", async () => {
    await enterWorkspace();
    goFuture();
    fireEvent.click(screen.getByRole("button", { name: /Compare with the 2024 RAV4/ }));
    await advance(0);
    for (const id of ["verdict-headline", "cost-keep", "cost-switch", "cost-difference", "winding-timeline", "step-detail", "next-step"]) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
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
    // the move is a year out, so the path starts with where you are, then the move, then the choice
    expect(screen.getAllByTestId("step-label").map((l) => l.textContent)).toEqual([
      expect.stringContaining("Your 2022 Camry"),
      expect.stringContaining("Move to Denver"),
      expect.stringContaining("Your choice"),
    ]);
    expect(screen.getByTestId("step-title")).toHaveTextContent("Your 2022 Camry"); // the details open on the first step
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
    const dialog = screen.getByRole("dialog", { name: "Edit assumptions" });
    expect(dialog).toHaveAttribute("data-open", "false");

    openDetails();
    expect(dialog).toHaveAttribute("data-open", "true");
    expect(state().ui.detailsOpen).toBe(true);
    expect(within(dialog).getByTestId("profile-confirm-card")).toBeInTheDocument();
    expect(within(dialog).getByText("Priorities")).toBeInTheDocument();
    expect(within(dialog).getByText("History")).toBeInTheDocument();
    expect(within(dialog).getByRole("switch", { name: /low performance/i })).toBeInTheDocument();
  });

  it("every number in it has a source label", async () => {
    await enterWorkspace();
    openDetails();
    const rows = screen.getByRole("dialog", { name: "Edit assumptions" }).querySelectorAll('[data-slot="data-row"]');
    expect(rows.length).toBeGreaterThan(5);
    rows.forEach((row) => expect(row.querySelector("[data-source]")).not.toBeNull());
  });

  it("closes with the close button, with Escape, and by tapping outside", async () => {
    await enterWorkspace();
    const dialog = screen.getByRole("dialog", { name: "Edit assumptions" });

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
    const html = () => screen.getByTestId("future-view").innerHTML.replace(/_r_[0-9a-z]+_/g, "_id_"); // React's generated ids differ after a remount
    const before = html();
    fireEvent.click(expandButton());
    fireEvent.click(expandButton());
    expect(state().ui.futureExpanded).toBe(false);
    expect(screen.getByTestId("deep-dive")).toBeInTheDocument();
    expect(screen.getByTestId("winding-timeline")).toHaveAttribute("data-expanded", "false");
    expect(html()).toBe(before);
  });

  it("keeps the step you were on when it expands and collapses", async () => {
    await enterWorkspace();
    confirmDenver();
    goFuture();
    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(screen.getByTestId("step-count")).toHaveTextContent("Your choice");
    fireEvent.click(expandButton());
    expect(screen.getByTestId("step-count")).toHaveTextContent("Your choice");
    fireEvent.click(expandButton());
    expect(screen.getByTestId("step-count")).toHaveTextContent("Your choice");
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
    expect(screen.getByTestId("deep-dive")).toBeInTheDocument();
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

