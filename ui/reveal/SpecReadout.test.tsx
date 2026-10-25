import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetForkStoreForTests, useForkStore } from "@/ui/store/useForkStore";
import { SPEC_FADE_MS, SPEC_HOLD_MS, SpecReadout } from "./SpecReadout";

const state = () => useForkStore.getState();
const setStage = (revealStage: "converge" | "pointcloud" | "wireframe" | "solid" | "done" | null) =>
  act(() => useForkStore.setState((s) => ({ stage: { ...s.stage, revealStage } })));
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const specs = () => screen.queryByTestId("reveal-specs");

beforeEach(async () => {
  vi.useFakeTimers();
  localStorage.clear();
  resetForkStoreForTests();
  await act(async () => {
    await state().actions.startFromSample("camry-2022-se");
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the car's specs after it forms", () => {
  it("wait until the car is solid, then show seats, mileage, cargo and price with their sources", () => {
    render(<SpecReadout bottom={200} />);
    setStage("converge");
    expect(specs()).toBeNull();
    setStage("wireframe");
    expect(specs()).toBeNull();
    setStage("solid");
    const el = specs()!;
    expect(el).toHaveTextContent("32 mpg");
    expect(el).toHaveTextContent("5 seats");
    expect(el).toHaveTextContent("15 cu ft");
    expect(el).toHaveTextContent("$");
    const stats = el.querySelectorAll('[data-slot="stat"]');
    expect(stats).toHaveLength(4);
    stats.forEach((st) => expect(st.querySelector("[data-source]")).not.toBeNull());
  });

  it("stay up when the reveal finishes and the car can be turned, instead of vanishing with the reveal", () => {
    render(<SpecReadout bottom={200} />);
    setStage("solid");
    const before = specs()!;
    act(() => useForkStore.setState((s) => ({ phase: "workspace", stage: { ...s.stage, phase: "interactive", revealStage: "done" } })));
    expect(specs()).toBe(before); // the same element: it did not flash off and on
    expect(specs()).toHaveAttribute("data-state", "holding");
  });

  it("hold for 30 seconds, then fade slowly, then go", async () => {
    render(<SpecReadout bottom={200} />);
    setStage("solid");
    expect(SPEC_HOLD_MS).toBe(30_000);
    expect(SPEC_FADE_MS).toBeGreaterThanOrEqual(3_000);

    await advance(SPEC_HOLD_MS - 1);
    expect(specs()).toHaveAttribute("data-state", "holding");
    expect(specs()!.className).toContain("opacity-100");

    await advance(1);
    expect(specs()).toHaveAttribute("data-state", "fading");
    expect(specs()!.className).toContain("opacity-0");
    expect(specs()!.style.transitionDuration).toContain(`${SPEC_FADE_MS}ms`); // the fade is slow, not a blink

    await advance(SPEC_FADE_MS - 1);
    expect(specs()).not.toBeNull();
    await advance(1);
    expect(specs()).toBeNull();
    await advance(60_000);
    expect(specs()).toBeNull(); // and does not come back
  });

  it("do not start the clock until the car is solid", async () => {
    render(<SpecReadout bottom={200} />);
    await advance(SPEC_HOLD_MS * 2); // the car is still forming
    expect(specs()).toBeNull();
    setStage("solid");
    expect(specs()).toHaveAttribute("data-state", "holding");
    await advance(SPEC_HOLD_MS - 1);
    expect(specs()).not.toBeNull();
  });

  it("show when the reveal is skipped, since the car is then ready to turn", () => {
    render(<SpecReadout bottom={200} />);
    act(() => useForkStore.setState((s) => ({ phase: "workspace", stage: { ...s.stage, phase: "interactive", revealStage: "done" } })));
    expect(specs()).toHaveAttribute("data-state", "holding");
  });

  it("never block turning the car: only the figures can be pointed at", () => {
    render(<SpecReadout bottom={200} />);
    setStage("solid");
    expect(specs()!.className).toContain("pointer-events-none");
    const wrappers = [...specs()!.children];
    expect(wrappers).toHaveLength(4);
    wrappers.forEach((w) => expect(w.className).toContain("pointer-events-auto"));
  });

  it("sit where they are told, and glide there when it changes", () => {
    const { rerender } = render(<SpecReadout bottom={240} />);
    setStage("solid");
    expect(specs()!.style.bottom).toBe("240px");
    rerender(<SpecReadout bottom={206} />);
    expect(specs()!.style.bottom).toBe("206px");
    expect(specs()!.style.transitionProperty).toContain("bottom");
  });
});

describe("only while the car is on screen", () => {
  it("are hidden on the future page, and the clock keeps running while you look at it", async () => {
    render(<SpecReadout bottom={200} />);
    act(() => useForkStore.setState((s) => ({ phase: "workspace", stage: { ...s.stage, revealStage: "done" } })));
    expect(specs()).not.toBeNull();
    await advance(10_000);
    act(() => state().actions.setView("future"));
    expect(specs()).toBeNull();
    await advance(10_000);
    act(() => state().actions.setView("car"));
    expect(specs()).toHaveAttribute("data-state", "holding"); // 20 seconds in, 10 to go
    await advance(10_001);
    expect(specs()).toHaveAttribute("data-state", "fading");
  });

  it("do not come back after fading just because you changed page", async () => {
    render(<SpecReadout bottom={200} />);
    act(() => useForkStore.setState((s) => ({ phase: "workspace", stage: { ...s.stage, revealStage: "done" } })));
    await advance(SPEC_HOLD_MS + SPEC_FADE_MS);
    expect(specs()).toBeNull();
    act(() => state().actions.setView("future"));
    act(() => state().actions.setView("car"));
    expect(specs()).toBeNull();
  });
});

describe("a new car, or a replay, starts them again", () => {
  it("a different car shows its own specs for a full 30 seconds", async () => {
    render(<SpecReadout bottom={200} />);
    act(() => useForkStore.setState((s) => ({ phase: "workspace", stage: { ...s.stage, revealStage: "done" } })));
    await advance(SPEC_HOLD_MS + SPEC_FADE_MS);
    expect(specs()).toBeNull();

    await act(async () => {
      await state().actions.startFromSample("rav4-2024-hybrid-xle");
    });
    setStage("solid");
    const rav4 = state().twin!.vehicle;
    expect(rav4.model).toBe("RAV4");
    expect(specs()).toHaveTextContent(`${rav4.mpg} mpg`); // its own figures, not the Camry's
    expect(specs()).toHaveTextContent(`${rav4.seats} seats`);
    expect(specs()).toHaveAttribute("data-state", "holding");
    await advance(SPEC_HOLD_MS - 1);
    expect(specs()).toHaveAttribute("data-state", "holding");
  });

  it("a replayed reveal shows them again", async () => {
    render(<SpecReadout bottom={200} />);
    act(() => useForkStore.setState((s) => ({ phase: "workspace", stage: { ...s.stage, revealStage: "done" } })));
    await advance(SPEC_HOLD_MS + SPEC_FADE_MS);
    expect(specs()).toBeNull();
    act(() => state().actions.replayReveal());
    setStage("solid");
    expect(specs()).not.toBeNull();
  });
});

describe("reduced motion", () => {
  it("still holds for 30 seconds, then goes without a fade", async () => {
    act(() => useForkStore.setState((s) => ({ ui: { ...s.ui, reducedMotion: true } })));
    render(<SpecReadout bottom={200} />);
    setStage("solid");
    await advance(SPEC_HOLD_MS - 1);
    expect(specs()).toHaveAttribute("data-state", "holding");
    await advance(1);
    expect(specs()).toBeNull();
  });
});

describe("clean up", () => {
  it("leaves no timers behind when it goes away", async () => {
    const { unmount } = render(<SpecReadout bottom={200} />);
    setStage("solid");
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
