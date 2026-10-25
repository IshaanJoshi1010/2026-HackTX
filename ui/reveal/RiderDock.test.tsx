import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetForkStoreForTests, useForkStore } from "@/ui/store/useForkStore";
import { DOCK_MS, STAGGER_MS, easeInOutCubic } from "./arc";
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
    calls.push({ key: this.dataset.flip ?? "?", keyframes, options });
    return { cancel: () => (cancelled += 1) };
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
      expect(c.options).toMatchObject({ duration: DOCK_MS, delay: i * STAGGER_MS, easing: "linear", fill: "backwards" });
    });
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
    expect(chrome.className).toContain("delay-700");
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
    expect(dock().textContent).not.toMatch(/demo|data|—/i);
  });
});
