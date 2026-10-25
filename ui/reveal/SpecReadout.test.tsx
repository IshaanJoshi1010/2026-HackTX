import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetForkStoreForTests, useForkStore } from "@/ui/store/useForkStore";
import { SPEC_FADE_MS, SPEC_HOLD_MS, SpecReadout } from "./SpecReadout";

const state = () => useForkStore.getState();
const setStage = (revealStage: "converge" | "pointcloud" | "wireframe" | "solid" | "done" | null) =>
  act(() => useForkStore.setState((s) => ({ stage: { ...s.stage, revealStage } })));
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const specs = () => screen.queryByTestId("reveal-specs");
const spec = () => specs()!;
/** The distance up from the bottom edge the row is told to sit at (small screens). */
const rowBottom = () => spec().style.getPropertyValue("--spec-bottom");
const classes = () => spec().className.split(/\s+/);

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
    const wrappers = [...specs()!.querySelectorAll('[data-slot="stat"]')];
    expect(wrappers).toHaveLength(4);
    wrappers.forEach((w) => expect(w.className).toContain("pointer-events-auto"));
  });

  it("show every figure as the number with its unit, a small label and a compact source badge, all at least 12px", () => {
    render(<SpecReadout bottom={200} />);
    setStage("solid");
    const rows = [...specs()!.querySelectorAll('[data-slot="stat"]')];
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringMatching(/^32 mpg.*Combined/),
      expect.stringMatching(/^5 seats.*Seating/),
      expect.stringMatching(/^15 cu ft.*Cargo/),
      expect.stringMatching(/^\$[\d,]+.*Est\. MSRP/),
    ]);
    rows.forEach((r) => {
      const badge = r.querySelector("[data-source]")!;
      expect(badge).not.toBeNull();
      expect(badge.className).toContain("text-xs"); // 12px, not the badge's usual 11px
      expect(badge.className).not.toContain("rounded-full border"); // the compact badge: no pill outline
    });
    expect(spec().innerHTML).not.toMatch(/text-\[(?:[0-9]|1[01])px\]/); // nothing under 12px in here
  });
});

describe("where they sit", () => {
  it("are a column at the left edge on wide screens: centered vertically, left-6, no bottom", () => {
    render(<SpecReadout bottom={200} />);
    setStage("solid");
    for (const c of ["md:left-6", "md:top-1/2", "md:-translate-y-1/2", "md:bottom-auto", "md:inset-x-auto"]) expect(classes()).toContain(c);
    const list = spec().firstElementChild!;
    expect(list.className).toContain("md:flex-col");
    expect(list.className).toContain("md:flex-nowrap");
  });

  it("are a row above the command bar on small screens, as far up as they are told", () => {
    const { rerender } = render(<SpecReadout bottom={240} />);
    setStage("solid");
    for (const c of ["inset-x-0", "bottom-[var(--spec-bottom)]"]) expect(classes()).toContain(c);
    expect(spec().firstElementChild!.className).toContain("justify-center");
    expect(rowBottom()).toBe("240px");
    rerender(<SpecReadout bottom={206} />);
    expect(rowBottom()).toBe("206px");
  });

  it("set the spot with no inline bottom, top, left or width that could be animated", () => {
    render(<SpecReadout bottom={240} />);
    setStage("solid");
    for (const prop of ["bottom", "top", "left", "right", "width", "height"]) expect(spec().style.getPropertyValue(prop)).toBe("");
  });
});

describe("only transform and opacity ever animate", () => {
  const layoutProps = /\b(bottom|top|left|right|width|height|margin|padding|inset|all)\b/;

  it("the only transition is on opacity, holding and fading", async () => {
    render(<SpecReadout bottom={200} />);
    setStage("solid");
    expect(spec().style.transitionProperty).toBe("opacity");
    expect(spec().style.transitionProperty).not.toMatch(layoutProps);
    await advance(SPEC_HOLD_MS);
    expect(spec()).toHaveAttribute("data-state", "fading");
    expect(spec().style.transitionProperty).toBe("opacity");
    expect(spec().style.transitionDuration).toBe(`${SPEC_FADE_MS}ms`);
    expect(spec().className).not.toMatch(/\btransition-all\b/);
  });

  it("no class on it or inside it transitions anything but opacity or colors", () => {
    render(<SpecReadout bottom={200} />);
    setStage("solid");
    const all = [spec(), ...spec().querySelectorAll("*")].flatMap((el) => (el.getAttribute("class") ?? "").split(/\s+/));
    expect(all.filter((c) => /^transition/.test(c) && c !== "transition-opacity")).toEqual([]);
  });

  describe("when the bar under the row changes height (small screens)", () => {
    let animate: ReturnType<typeof vi.fn>;
    beforeEach(() => {
      animate = vi.fn(() => ({ cancel: () => {} }));
      (Element.prototype as unknown as { animate: unknown }).animate = animate;
    });
    afterEach(() => {
      delete (Element.prototype as unknown as { animate?: unknown }).animate;
      vi.restoreAllMocks();
    });

    it("it glides with a transform from where it was, never by animating bottom", () => {
      const { rerender } = render(<SpecReadout bottom={240} />);
      setStage("solid");
      expect(animate).not.toHaveBeenCalled();
      rerender(<SpecReadout bottom={182} />);
      expect(animate).toHaveBeenCalledTimes(1);
      const [frames, options] = animate.mock.calls[0] as unknown as [Array<Record<string, string>>, KeyframeAnimationOptions];
      expect(frames).toEqual([{ transform: "translateY(-58px)" }, { transform: "translateY(0)" }]); // old spot was 58px higher
      expect(options.duration).toBeGreaterThan(0);
      for (const f of frames) expect(Object.keys(f)).toEqual(["transform"]);
      expect(rowBottom()).toBe("182px"); // and it is already at its new spot, so nothing reflows during the glide
    });

    it("does nothing when the spot did not change", () => {
      const { rerender } = render(<SpecReadout bottom={240} />);
      setStage("solid");
      rerender(<SpecReadout bottom={240} />);
      expect(animate).not.toHaveBeenCalled();
    });

    it("does not glide on a wide screen, where the column ignores bottom", () => {
      vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("768px"), media: q, addEventListener() {}, removeEventListener() {} }));
      try {
        const { rerender } = render(<SpecReadout bottom={240} />);
        setStage("solid");
        rerender(<SpecReadout bottom={182} />);
        expect(animate).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("does not glide with reduced motion", () => {
      act(() => useForkStore.setState((s) => ({ ui: { ...s.ui, reducedMotion: true } })));
      const { rerender } = render(<SpecReadout bottom={240} />);
      setStage("solid");
      rerender(<SpecReadout bottom={182} />);
      expect(animate).not.toHaveBeenCalled();
    });

    it("copes with a browser that cannot animate", () => {
      delete (Element.prototype as unknown as { animate?: unknown }).animate;
      const { rerender } = render(<SpecReadout bottom={240} />);
      setStage("solid");
      expect(() => rerender(<SpecReadout bottom={182} />)).not.toThrow();
      expect(rowBottom()).toBe("182px");
    });
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
