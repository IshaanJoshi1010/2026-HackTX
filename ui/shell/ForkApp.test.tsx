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

const panel = (name: "Your car" | "Insights") => screen.getByRole("complementary", { name });
const scrubTo = (month: number) =>
  fireEvent.change(screen.getByRole("slider", { name: "Month" }), { target: { value: String(month) } });

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
    expect(screen.getByTestId("mock-banner")).toHaveTextContent("car, data, ai, sim, decision");
    expect(screen.getByRole("button", { name: /2024 RAV4 Hybrid XLE/ })).toBeInTheDocument();
  });

  it("runs the reveal and lands in the workspace with the car on stage", async () => {
    await openCamry();
    const stage = screen.getByTestId("car-stage-stub");
    expect(stage).toHaveAttribute("data-phase", "reveal");
    expect(stage).toHaveAttribute("data-vehicle-id", "camry-2022-se");
    // during the reveal there is only the car: no timeline, no edge buttons
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByRole("button", { name: /Open Your car/ })).toBeNull();

    await advance(4100);
    expect(state().phase).toBe("workspace");
    expect(screen.getByTestId("car-stage-stub")).toHaveAttribute("data-phase", "interactive");
    expect(screen.getByRole("slider", { name: "Month" })).toBeInTheDocument();
    // with only the baseline the timeline is a hairline: one line, no labels
    expect(screen.getAllByTestId("lane-path")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Keep the Camry" })).toBeNull();
  });

  it("skip jumps straight into the workspace at any moment of the reveal", async () => {
    await openCamry();
    await advance(1000);
    expect(state().phase).toBe("reveal");
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    await advance(0);
    expect(state().phase).toBe("workspace");
  });

  it("switching the sample car restarts the stage on the new car", async () => {
    await enterWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Open Your car" }));
    fireEvent.click(within(panel("Your car")).getByRole("button", { name: /2024 RAV4/ }));
    await advance(0);
    const stage = screen.getByTestId("car-stage-stub");
    expect(stage).toHaveAttribute("data-vehicle-id", "rav4-2024-hybrid-xle");
    expect(stage).toHaveAttribute("data-phase", "reveal");
  });

  it("compare morphs the stage to the RAV4 and adds a branch", async () => {
    await enterWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Open Insights" }));
    fireEvent.click(screen.getByRole("button", { name: /Compare with a 2024 RAV4/ }));
    await advance(0);
    expect(screen.getByTestId("car-stage-stub")).toHaveAttribute("data-phase", "transition");
    expect(screen.getByText(/morphing to RAV4/)).toBeInTheDocument();

    await advance(1900);
    const stage = screen.getByTestId("car-stage-stub");
    expect(stage).toHaveAttribute("data-phase", "interactive");
    expect(stage).toHaveAttribute("data-vehicle-id", "rav4-2024-hybrid-xle");
    expect(screen.getByText(/Verdict:/)).toHaveTextContent("Inconclusive");
    // the timeline grew from a hairline into labeled lanes, one per future
    expect(screen.getByRole("button", { name: "Keep the Camry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replace with RAV4" })).toHaveAttribute("aria-current", "true");
    expect(screen.getAllByTestId("lane-path")).toHaveLength(2);
  });

  it("start over goes back to the landing screen", async () => {
    await enterWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(state().phase).toBe("landing");
    expect(screen.getByRole("button", { name: /2022 Camry SE/ })).toBeInTheDocument();
  });
});

describe("progressive disclosure", () => {
  it("starts as just the car: a name, a hint, a timeline, closed panels, no numbers", async () => {
    await enterWorkspace();
    // the identity line names the car; it carries no numbers, so it needs no badge
    expect(screen.getByText("2022 Toyota Camry")).toBeInTheDocument();
    expect(screen.getByTestId("hud-hint")).toHaveTextContent("Drag the timeline to look ahead");
    expect(screen.queryByTestId("hud")).toBeNull();
    expect(panel("Your car")).toHaveAttribute("data-open", "false");
    expect(panel("Insights")).toHaveAttribute("data-open", "false");
    expect(document.querySelectorAll('[data-slot="stat"]')).toHaveLength(0);
  });

  it("looking ahead reveals one headline number, with its source", async () => {
    await enterWorkspace();
    scrubTo(36);
    expect(screen.queryByTestId("hud-hint")).toBeNull();
    const stats = document.querySelectorAll('[data-slot="stat"]');
    expect(stats).toHaveLength(1);
    expect(within(screen.getByTestId("hud")).getByText(/Net cost, 3 yr/)).toBeInTheDocument();
    expect(stats[0].querySelector("[data-source]")).not.toBeNull();
    expect(screen.getByRole("slider", { name: "Month" })).toHaveAttribute("aria-valuetext", "3 yr");
  });

  it("More reveals four more numbers, Less hides them, and the flag lives in the store", async () => {
    await enterWorkspace();
    scrubTo(24);
    const more = screen.getByRole("button", { name: /more/i });
    expect(more).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(more);
    expect(state().ui.metricsExpanded).toBe(true);

    const stats = document.querySelectorAll('[data-slot="stat"]');
    expect(stats).toHaveLength(5);
    stats.forEach((s) => expect(s.querySelector("[data-source]")).not.toBeNull());
    for (const label of ["Mileage", "Fuel", "Upkeep", "Value"]) {
      expect(within(screen.getByTestId("hud")).getByText(label)).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole("button", { name: /less/i }));
    expect(document.querySelectorAll('[data-slot="stat"]')).toHaveLength(1);
  });

  it("never repeats numbers: with Insights open the HUD keeps only its headline", async () => {
    await enterWorkspace();
    scrubTo(24);
    fireEvent.click(screen.getByRole("button", { name: /more/i }));
    expect(document.querySelectorAll('[data-slot="stat"]')).toHaveLength(5);

    fireEvent.click(screen.getByRole("button", { name: "Open Insights" }));
    expect(document.querySelectorAll('[data-slot="stat"]')).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /more|less/i })).toBeNull();

    // closing it brings the detail back, because the choice was kept
    fireEvent.click(screen.getByRole("button", { name: "Close Insights" }));
    expect(document.querySelectorAll('[data-slot="stat"]')).toHaveLength(5);
  });

  it("scrubbing back to now returns to the quiet hint", async () => {
    await enterWorkspace();
    scrubTo(12);
    expect(screen.getByTestId("hud")).toBeInTheDocument();
    scrubTo(0);
    expect(screen.queryByTestId("hud")).toBeNull();
    expect(screen.getByTestId("hud-hint")).toBeInTheDocument();
  });

  it("detail panels open from the edge and every number in them has a source", async () => {
    await enterWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Open Your car" }));
    fireEvent.click(screen.getByRole("button", { name: "Open Insights" }));
    expect(panel("Your car")).toHaveAttribute("data-open", "true");
    expect(panel("Insights")).toHaveAttribute("data-open", "true");

    for (const name of ["Your car", "Insights"] as const) {
      const rows = panel(name).querySelectorAll('[data-slot="data-row"]');
      expect(rows.length).toBeGreaterThan(0);
      rows.forEach((row) => expect(row.querySelector("[data-source]")).not.toBeNull());
    }
  });

  it("scrubbing updates the numbers in the Insights panel", async () => {
    await enterWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Open Insights" }));
    const net = () => within(panel("Insights")).getByText("Net cost").closest('[data-slot="data-row"]')!.textContent;
    const before = net();
    scrubTo(48);
    expect(state().activeMonth).toBe(48);
    expect(net()).not.toBe(before);
  });

  it("panels remember being open", async () => {
    await enterWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Open Your car" }));
    expect(state().ui.leftOpen).toBe(true);
    expect(screen.getByRole("button", { name: "Close Your car" })).toHaveAttribute("aria-expanded", "true");
    await advance(200);
    expect(JSON.parse(localStorage.getItem("fork:v1")!).prefs.leftOpen).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Close Your car" }));
    expect(panel("Your car")).toHaveAttribute("data-open", "false");
  });

  it("draws no input until the command box exists (no decorative controls)", async () => {
    await enterWorkspace();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.querySelector('[data-slot="command-box"]')).toBeEmptyDOMElement();
  });

  it("every icon-only button has an accessible name", async () => {
    await enterWorkspace();
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(5);
    buttons.forEach((b) => expect(b).toHaveAccessibleName());
  });
});

describe("controls reach the stage", () => {
  it("the low performance switch reaches CarStage as quality=low", async () => {
    await enterWorkspace();
    expect(screen.getByTestId("car-stage-stub")).toHaveAttribute("data-quality", "high");
    fireEvent.click(screen.getByRole("switch", { name: /low performance/i }));
    expect(state().ui.lowPerformance).toBe(true);
    expect(screen.getByTestId("car-stage-stub")).toHaveAttribute("data-quality", "low");
  });

  it("view mode buttons drive CarStage viewMode", async () => {
    await enterWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Wireframe view" }));
    expect(screen.getByTestId("car-stage-stub")).toHaveAttribute("data-view-mode", "wireframe");
    expect(screen.getByRole("button", { name: "Wireframe view" })).toHaveAttribute("aria-pressed", "true");
  });

  it("reset view and replay bump their signals", async () => {
    await enterWorkspace();
    const before = state().stage;
    fireEvent.click(screen.getByRole("button", { name: "Reset view" }));
    expect(state().stage.resetCameraSignal).toBe(before.resetCameraSignal + 1);
    fireEvent.click(screen.getByRole("button", { name: "Replay reveal" }));
    expect(state().stage.replaySignal).toBe(before.replaySignal + 1);
    expect(state().phase).toBe("reveal");
  });

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

  it("never prints placeholder paint text from the fixtures", async () => {
    await enterWorkspace();
    fireEvent.click(screen.getByRole("button", { name: "Open Your car" }));
    expect(document.body.textContent).not.toMatch(/TODO/);
  });
});
