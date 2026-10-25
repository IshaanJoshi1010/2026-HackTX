import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetForkStoreForTests, useForkStore } from "@/ui/store/useForkStore";
import { DOCK_MS, DOCK_START_MS, STAGGER_MS, easeInOutCubic, flightDelay, flightEnd } from "./arc";
import { ROW_BOTTOM, RiderDock, activeRider } from "./RiderDock";

const state = () => useForkStore.getState();
const actions = () => useForkStore.getState().actions;

const KEYS = ["title", "solo", "partner", "kids", "mixed"];
// Where the chips are on a 1440 wide screen: a row along the bottom, then a column at the right edge.
let rowLeft = 300;
const place = (el: Element): { left: number; top: number } => {
  const i = KEYS.indexOf((el as HTMLElement).dataset.flip ?? "");
  const mode = el.closest("[data-testid='rider-dock']")?.getAttribute("data-mode");
  return mode === "row" ? { left: rowLeft + i * 90, top: 800 } : { left: 1180, top: 260 + i * 52 };
};

interface Call {
  key: string;
  keyframes: Array<{ transform: string; offset: number }>;
  options: KeyframeAnimationOptions;
  /** What the chip's will-change was at the instant animate() was called. */
  willChangeThen: string;
  /** Ends the move, the way the browser does when it lands. */
  finish: () => void;
  /** Ends it the other way: cancelled before it landed. */
  abort: () => void;
}
let calls: Call[];
let cancelled: number;

beforeEach(async () => {
  vi.restoreAllMocks();
  localStorage.clear();
  resetForkStoreForTests();
  useForkStore.setState({ hydrated: true });
  rowLeft = 300;
  calls = [];
  cancelled = 0;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const { left, top } = place(this);
    return { left, top, right: left + 80, bottom: top + 36, width: 80, height: 36, x: left, y: top, toJSON: () => ({}) } as DOMRect;
  });
  (Element.prototype as unknown as { animate: unknown }).animate = function (this: HTMLElement, keyframes: Call["keyframes"], options: KeyframeAnimationOptions) {
    let finish!: () => void;
    let abort!: () => void;
    const finished = new Promise<void>((resolve, reject) => {
      finish = resolve;
      abort = () => reject(new DOMException("cancelled", "AbortError"));
    });
    calls.push({ key: this.dataset.flip ?? "?", keyframes, options, willChangeThen: this.style.willChange, finish, abort });
    return { cancel: () => (cancelled += 1), finished };
  };
  (Element.prototype as unknown as { getAnimations: unknown }).getAnimations = () => [{ cancel: () => (cancelled += 1) }];
  await actions().startFromSample("camry-2022-se"); // the reveal begins: phase "reveal"
});

afterEach(() => {
  cleanup();
  delete (Element.prototype as unknown as { animate?: unknown }).animate;
  delete (Element.prototype as unknown as { getAnimations?: unknown }).getAnimations;
});

const dock = () => screen.getByTestId("rider-dock");
const finishReveal = () => act(() => actions().onRevealStage("done"));
const parse = (t: string) => /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(t)!.slice(1).map(Number);

describe("while the car forms", () => {
  it("is a row of four chips with the question above, just above the Skip button", () => {
    render(<RiderDock />);
    expect(state().phase).toBe("reveal");
    expect(dock()).toHaveAttribute("data-mode", "row");
    expect(dock()).toHaveAttribute("data-visible", "true");
    expect(dock().style.bottom).toBe(`${ROW_BOTTOM}px`);
    expect(screen.getByText("Who rides with you most?")).toBeInTheDocument();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Just me", "Partner", "Kids", "Mixed"]);
    expect(dock()).toHaveAccessibleName("Who rides with you most?");
  });

  it("does not catch clicks meant for the car: only the question and the chips can be pressed", () => {
    render(<RiderDock />);
    expect(dock().className).toContain("pointer-events-none");
    for (const b of screen.getAllByRole("button")) expect(b.className).toContain("pointer-events-auto");
  });

  it("answers the question, and shows which answer matches the profile", () => {
    render(<RiderDock />);
    fireEvent.click(screen.getByRole("button", { name: "Kids" }));
    const profile = state().explore.confirmedProfile;
    expect([profile.householdSize, profile.children]).toEqual([3, 1]);
    expect(profile.provenance.householdSize).toBe("estimated");
    expect(screen.getByRole("button", { name: "Kids" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Partner" })).toHaveAttribute("aria-pressed", "false");
  });

  it("does not animate when it first appears", () => {
    render(<RiderDock />);
    expect(calls).toHaveLength(0);
  });
});

describe("when the car is ready: the arc to the side panel", () => {
  it("every chip and the question are the same elements, now a column at the side", () => {
    render(<RiderDock />);
    const before = screen.getAllByRole("button");
    finishReveal();
    expect(dock()).toHaveAttribute("data-mode", "panel");
    expect(screen.getAllByRole("button")).toEqual(before); // not rebuilt: the same chips, moved
    expect(dock().style.bottom).toBe("");
    expect(dock().className).toContain("right-6");
  });

  it("flies each one from where it was to where it is, once, with the question first and the chips following", () => {
    render(<RiderDock />);
    finishReveal();
    expect(calls.map((c) => c.key)).toEqual(KEYS);
    calls.forEach((c, i) => {
      const was = { left: 300 + i * 90, top: 800 };
      const now = { left: 1180, top: 260 + i * 52 };
      expect(parse(c.keyframes[0].transform)).toEqual([was.left - now.left, was.top - now.top]); // starts back where it was
      expect(parse(c.keyframes.at(-1)!.transform)).toEqual([0, 0]); // and settles in place
      expect(c.options).toMatchObject({ duration: DOCK_MS, delay: DOCK_START_MS + i * STAGGER_MS, easing: "linear", fill: "backwards" });
    });
  });

  it("waits a moment before the first chip sets off, so the workspace finishes drawing first, holding each at its start", () => {
    expect(DOCK_START_MS).toBeGreaterThanOrEqual(120);
    expect(flightDelay(0)).toBe(DOCK_START_MS);
    expect(flightDelay(3) - flightDelay(2)).toBe(STAGGER_MS); // the stagger is kept on top of the base
    expect(flightEnd(5)).toBe(DOCK_START_MS + 4 * STAGGER_MS + DOCK_MS);
    render(<RiderDock />);
    finishReveal();
    expect(calls[0].options.delay).toBeGreaterThanOrEqual(120);
    calls.forEach((c) => expect(c.options.fill).toBe("backwards")); // so the wait is spent at the start, not jumped to the end
  });

  it("follows a parabola: up from the straight line to the middle, back down to rest", () => {
    render(<RiderDock />);
    finishReveal();
    const solo = calls.find((c) => c.key === "solo")!;
    const pts = solo.keyframes.map((f) => parse(f.transform));
    const [x0, y0] = pts[0];
    // how far above the straight line between start and end each point is (positive is higher on screen)
    const above = pts.map(([, y], i) => y0 * (1 - easeInOutCubic(i / (pts.length - 1))) - y);
    expect(above[0]).toBeCloseTo(0, 6);
    expect(above.at(-1)).toBeCloseTo(0, 6);
    const peak = Math.max(...above);
    expect(peak).toBeGreaterThan(30);
    const at = above.indexOf(peak);
    expect(at).toBeGreaterThan(pts.length * 0.35);
    expect(at).toBeLessThan(pts.length * 0.65); // highest around the middle
    for (let i = 1; i <= at; i++) expect(above[i]).toBeGreaterThanOrEqual(above[i - 1] - 1e-6); // rising
    for (let i = at + 1; i < above.length; i++) expect(above[i]).toBeLessThanOrEqual(above[i - 1] + 1e-6); // then falling
    expect(Math.abs(x0)).toBeGreaterThan(500); // and it really does cross the screen
  });

  it("the panel's frame fades in after they land, not before", () => {
    render(<RiderDock />);
    const chrome = screen.getByTestId("rider-panel-chrome");
    expect(chrome.className).toContain("opacity-0");
    finishReveal();
    expect(chrome.className).toContain("opacity-100");
    // it starts to appear as the chips are settling, not while they are still crossing the screen
    const delay = Number(/\bdelay-(\d+)\b/.exec(chrome.className)?.[1]);
    expect(delay).toBeGreaterThanOrEqual(DOCK_START_MS + DOCK_MS - 150);
    expect(delay).toBeLessThan(flightEnd(KEYS.length));
  });

  it("the frame is a solid translucent tint with a hairline: no blur over the live canvas", () => {
    render(<RiderDock />);
    finishReveal();
    const chrome = screen.getByTestId("rider-panel-chrome");
    expect(chrome.className).not.toMatch(/backdrop|blur/);
    expect(chrome.className).toMatch(/\bbg-black\/\d+\b/);
    expect(chrome.className).toContain("border-line");
    expect(chrome.className).toContain("transition-opacity");
    expect(dock().outerHTML).not.toMatch(/backdrop|blur/);
  });

  it("the panel is light: about w-40, small title, h-9 chips", () => {
    render(<RiderDock />);
    finishReveal();
    expect(dock().className).toContain("w-40");
    expect(dock().className).not.toMatch(/\bw-4[4-9]\b/);
    const title = screen.getByText("Who rides with you most?");
    expect(title.className).toContain("text-xs");
    expect(title.className).toContain("text-ink/60");
    for (const b of screen.getAllByRole("button")) {
      expect(b.className).toContain("h-9");
      expect(b.className).toContain("text-sm");
      expect(b.className).not.toContain("h-10");
    }
  });

  it("the row during the reveal keeps its size", () => {
    render(<RiderDock />);
    expect(screen.getByText("Who rides with you most?").className).toContain("text-sm");
    for (const b of screen.getAllByRole("button")) expect(b.className).toMatch(/\bh-9\b.*\bpx-4\b/);
  });

  it("nothing in it transitions anything but opacity or colors: no layout properties", () => {
    render(<RiderDock />);
    for (const mode of ["row", "panel"]) {
      if (mode === "panel") finishReveal();
      const all = [dock(), ...dock().querySelectorAll("*")];
      const classes = all.flatMap((el) => (el.getAttribute("class") ?? "").split(/\s+/));
      // four chips (colors) plus the dock and its frame (opacity): nothing else transitions
      expect(classes.filter((c) => /^(?:[a-z-]+:)*transition/.test(c)).sort()).toEqual([
        "transition-colors",
        "transition-colors",
        "transition-colors",
        "transition-colors",
        "transition-opacity",
        "transition-opacity",
      ]);
      expect(classes).not.toContain("transition-all");
      expect(classes).not.toContain("transition");
      for (const el of all) {
        const st = (el as HTMLElement).style;
        expect(st.transitionProperty ?? "").toBe("");
      }
    }
  });

  describe("will-change", () => {
    const flush = () => act(async () => void (await Promise.resolve()));
    const chip = (key: string) => document.querySelector<HTMLElement>(`[data-flip="${key}"]`)!;

    it("is set on each chip just before it is animated, and not before or on chips that stay put", () => {
      render(<RiderDock />);
      for (const k of KEYS) expect(chip(k).style.willChange).toBe(""); // not while they just sit there
      finishReveal();
      expect(calls).toHaveLength(KEYS.length);
      for (const c of calls) expect(c.willChangeThen).toBe("transform");
    });

    it("is cleared again when the move finishes, one chip at a time", async () => {
      render(<RiderDock />);
      finishReveal();
      for (const k of KEYS) expect(chip(k).style.willChange).toBe("transform");
      calls.find((c) => c.key === "solo")!.finish();
      await flush();
      expect(chip("solo").style.willChange).toBe("");
      expect(chip("kids").style.willChange).toBe("transform"); // still flying
      calls.forEach((c) => c.finish());
      await flush();
      for (const k of KEYS) expect(chip(k).style.willChange).toBe("");
    });

    it("is cleared when a move is cancelled too, so it is never left behind", async () => {
      render(<RiderDock />);
      finishReveal();
      calls.forEach((c) => c.abort());
      await flush();
      for (const k of KEYS) expect(chip(k).style.willChange).toBe("");
    });

    it("an older move that ends late does not clear the hint of the newer move that replaced it", async () => {
      render(<RiderDock />);
      finishReveal();
      const first = calls.slice();
      calls = [];
      act(() => actions().replayReveal()); // cancels those in flight and starts the way back
      expect(calls).toHaveLength(KEYS.length);
      first.forEach((c) => c.abort()); // the old ones report in after the new ones began
      await flush();
      for (const k of KEYS) expect(chip(k).style.willChange).toBe("transform");
      calls.forEach((c) => c.finish());
      await flush();
      for (const k of KEYS) expect(chip(k).style.willChange).toBe("");
    });

    it("falls back to onfinish where there is no finished promise", () => {
      let onfinish: (() => void) | null = null;
      (Element.prototype as unknown as { animate: unknown }).animate = function () {
        const a = { cancel: () => {} } as { cancel: () => void; onfinish?: (() => void) | null };
        a.onfinish = null;
        Object.defineProperty(a, "onfinish", { get: () => onfinish, set: (f) => (onfinish = f) });
        return a;
      };
      render(<RiderDock />);
      finishReveal();
      expect(chip("solo").style.willChange).toBe("transform");
      expect(typeof onfinish).toBe("function");
      act(() => onfinish!());
      // the callback is shared by shape, but each chip has its own: the last one set is the last chip
      expect(chip("mixed").style.willChange).toBe("");
    });

    it("does not leave the hint on when the animation cannot be observed at all", () => {
      (Element.prototype as unknown as { animate: unknown }).animate = () => ({ cancel: () => {} });
      render(<RiderDock />);
      expect(() => finishReveal()).not.toThrow();
      for (const k of KEYS) expect(chip(k).style.willChange).toBe("");
    });

    it("is never set with reduced motion", () => {
      act(() => useForkStore.setState((s) => ({ ui: { ...s.ui, reducedMotion: true } })));
      render(<RiderDock />);
      finishReveal();
      for (const k of KEYS) expect(chip(k).style.willChange).toBe("");
    });
  });

  it("the answer can still be changed from the panel", () => {
    render(<RiderDock />);
    finishReveal();
    fireEvent.click(screen.getByRole("button", { name: "Mixed" }));
    expect([state().explore.confirmedProfile.householdSize, state().explore.confirmedProfile.children]).toEqual([4, 2]);
    expect(screen.getByRole("button", { name: "Mixed" })).toHaveAttribute("aria-pressed", "true");
  });

  it("starts from where each chip really was at that moment, not from where it was when the page loaded", () => {
    render(<RiderDock />);
    rowLeft = 540; // the window was resized after it rendered
    finishReveal();
    const solo = calls.find((c) => c.key === "solo")!;
    expect(parse(solo.keyframes[0].transform)[0]).toBe(540 + 90 - 1180);
  });

  it("with reduced motion they are simply there: no animation, same place", () => {
    act(() => useForkStore.setState((s) => ({ ui: { ...s.ui, reducedMotion: true } })));
    render(<RiderDock />);
    finishReveal();
    expect(calls).toHaveLength(0);
    expect(dock()).toHaveAttribute("data-mode", "panel");
  });

  it("copes with a browser that cannot animate", () => {
    delete (Element.prototype as unknown as { animate?: unknown }).animate;
    render(<RiderDock />);
    expect(() => finishReveal()).not.toThrow();
    expect(dock()).toHaveAttribute("data-mode", "panel");
  });

  it("does not animate a chip that did not move", () => {
    render(<RiderDock />);
    rowLeft = 1180; // the row happens to be exactly where the panel is
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const i = KEYS.indexOf((this as HTMLElement).dataset.flip ?? "");
      return { left: 10, top: 10 + i, right: 90, bottom: 46, width: 80, height: 36, x: 10, y: 10 + i, toJSON: () => ({}) } as DOMRect;
    });
    finishReveal();
    expect(calls).toHaveLength(0);
  });
});

describe("and back again", () => {
  it("a replayed reveal sends them back down the same way, the other direction", () => {
    render(<RiderDock />);
    finishReveal();
    calls = [];
    act(() => actions().replayReveal());
    expect(dock()).toHaveAttribute("data-mode", "row");
    expect(calls.map((c) => c.key)).toEqual(KEYS);
    const solo = calls.find((c) => c.key === "solo")!;
    expect(parse(solo.keyframes[0].transform)).toEqual([1180 - (300 + 90), 260 + 52 - 800]); // from the panel, back to the row
    expect(dock().style.bottom).toBe(`${ROW_BOTTOM}px`);
  });

  it("stops a move that is still going before starting the next, from wherever it had got to", () => {
    render(<RiderDock />);
    finishReveal();
    cancelled = 0;
    act(() => actions().replayReveal());
    expect(cancelled).toBeGreaterThanOrEqual(KEYS.length);
  });
});

describe("on the future page", () => {
  it("goes away without a fuss, and comes back in place without moving", () => {
    render(<RiderDock />);
    finishReveal();
    calls = [];
    act(() => actions().setView("future"));
    expect(dock()).toHaveAttribute("data-visible", "false");
    expect(dock().className).toContain("opacity-0");
    expect(dock()).toHaveAttribute("inert");
    act(() => actions().setView("car"));
    expect(dock()).toHaveAttribute("data-visible", "true");
    expect(dock()).not.toHaveAttribute("inert");
    expect(calls).toHaveLength(0); // going to the other page and back is not a move
  });
});

describe("edges", () => {
  it("renders nothing before there is a car", () => {
    resetForkStoreForTests();
    const { container } = render(<RiderDock />);
    expect(container).toBeEmptyDOMElement();
  });

  it("when a visit starts in the workspace (a saved session) there is no flight", () => {
    finishReveal();
    calls = [];
    render(<RiderDock />);
    expect(dock()).toHaveAttribute("data-mode", "panel");
    expect(calls).toHaveLength(0);
  });

  it("stops listening when it goes away", () => {
    const { unmount } = render(<RiderDock />);
    unmount();
    expect(() => finishReveal()).not.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("matches which chip is lit to the profile, and none for a custom household", () => {
    expect(activeRider(1, 0)).toBe("solo");
    expect(activeRider(2, 0)).toBe("partner");
    expect(activeRider(3, 1)).toBe("kids");
    expect(activeRider(4, 2)).toBe("mixed");
    expect(activeRider(5, 3)).toBeNull();
  });

  it("has no em dashes or build words", () => {
    render(<RiderDock />);
    finishReveal();
    expect(dock().textContent).not.toMatch(new RegExp(`demo|data|${String.fromCharCode(0x2014)}`, "i"));
  });
});
