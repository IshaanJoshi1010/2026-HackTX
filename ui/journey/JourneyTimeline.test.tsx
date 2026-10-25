import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usd } from "@/ui/profile/format";
import { JourneyTimeline, type JourneyTimelineProps } from "./JourneyTimeline";
import { journeyCompared, journeyEmpty, journeyOffer, journeySwitchSelected, journeySwitchWins } from "./fixtures";
import { buildRoad, makeFrame, pointOnRoad, timePos, type Road } from "./roadGeometry";
import type { Journey } from "./types";

const EM_DASH = String.fromCharCode(0x2014);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setup(journey: Journey, extra: Partial<JourneyTimelineProps> = {}) {
  const calls = { onScrub: vi.fn(), onSelectEvent: vi.fn(), onSelectFuture: vi.fn(), onCompare: vi.fn() };
  const ui = (j: Journey, more: Partial<JourneyTimelineProps> = {}) => <JourneyTimeline journey={j} {...calls} {...extra} {...more} />;
  const view = render(ui(journey));
  return { ...calls, ...view, again: (j: Journey, more: Partial<JourneyTimelineProps> = {}) => view.rerender(ui(j, more)) };
}

/** The road the component draws at the jsdom default size. */
const roadOf = (j: Journey, width = 1120): Road =>
  buildRoad({ width, events: j.events, splitMonth: j.switch ? (j.switch.splitMonth ?? null) : null, selectedFuture: j.selectedFuture });

const get = (id: string) => screen.getByTestId(id);
const all = (id: string) => screen.getAllByTestId(id);
const attr = (el: Element, name: string) => el.getAttribute(name) ?? "";
const marker = (id: string) => document.querySelector(`[data-testid="event-marker"][data-event-id="${id}"]`) as HTMLElement;
const label = (id: string) => document.querySelector(`[data-testid="event-label"][data-event-id="${id}"]`) as HTMLElement;
const dest = (future: string) => document.querySelector(`[data-testid="destination"][data-future="${future}"]`) as HTMLElement;

const translate = (el: HTMLElement): { x: number; y: number } => {
  const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(el.style.transform);
  return { x: Number(m?.[1]), y: Number(m?.[2]) };
};
const parsePath = (d: string): Array<{ x: number; y: number }> => [...d.matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
function distanceToLine(pts: Array<{ x: number; y: number }>, p: { x: number; y: number }): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const u = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    best = Math.min(best, Math.hypot(p.x - (a.x + u * dx), p.y - (a.y + u * dy)));
  }
  return best;
}

/** Everything a person could read or hear: text, labels, tooltips. */
function everythingVisible(): string[] {
  const out = [document.body.textContent ?? ""];
  for (const el of document.body.querySelectorAll("*")) {
    for (const name of ["title", "aria-label", "placeholder", "alt", "aria-valuetext", "aria-description"]) {
      const v = el.getAttribute(name);
      if (v) out.push(v);
    }
  }
  return out;
}

const withMonth = (j: Journey, month: number, extra: Partial<Journey> = {}): Journey => ({ ...j, month, ...extra });

describe("the road", () => {
  it("is one interactive drawing, with the testids the page and the tests look for", () => {
    setup(journeyCompared);
    const root = get("journey-timeline");
    expect(attr(root, "data-orientation")).toBe("horizontal");
    expect(attr(root, "data-month")).toBe("0");
    expect(root.style.height).toBe("380px");
    const svg = get("journey-road");
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(attr(svg, "aria-hidden")).toBe("true");
    expect(svg.getAttribute("width")).toBe("1120");
    for (const id of ["road-path-keep", "road-path-switch", "road-path-trunk", "time-marker", "road-hit"]) expect(get(id)).toBeTruthy();
    expect(all("event-marker")).toHaveLength(4);
    expect(all("event-label")).toHaveLength(4);
    expect(all("destination")).toHaveLength(2);
  });

  it("puts a month of the road under each year tick, with the calendar date", () => {
    setup(journeyCompared);
    const ticks = all("road-axis-tick");
    expect(ticks).toHaveLength(6);
    expect(ticks.map((t) => attr(t, "data-month"))).toEqual(["0", "12", "24", "36", "48", "60"]);
    expect(ticks[0].textContent).toBe("NowOct 2026");
    expect(ticks[1].textContent).toBe("1 yrOct 2027");
    expect(ticks[5].textContent).toBe("5 yrOct 2031");
    const frame = makeFrame(1120, true);
    ticks.forEach((t, i) => expect(Number(within(t).getAllByText(/./)[0].getAttribute("x"))).toBeCloseTo(timePos(frame, i * 12), 6));
  });

  it("names the months from the selected month, wherever it is", () => {
    setup(journeySwitchSelected);
    expect(all("road-axis-tick")[0].textContent).toBe("NowOct 2026");
    expect(all("road-axis-tick")[3].textContent).toBe("3 yrOct 2029");
  });

  it("describes itself for a screen reader in one sentence", () => {
    setup(journeyCompared);
    expect(screen.getByText("Keep: Camry for five years. Switch: Camry until Oct 2027, then RAV4. 3 events.")).toBeInTheDocument();
  });

  it("describes the offer, an empty road and a single car just as plainly", () => {
    setup(journeyEmpty);
    expect(screen.getByText("Keep: Camry for five years. Switch: Camry until Oct 2027, then RAV4, not compared yet. No events yet.")).toBeInTheDocument();
    cleanup();
    setup({ ...journeyOffer, switch: null });
    expect(screen.getByText("Keep: Camry for five years. 3 events.")).toBeInTheDocument();
  });
});

describe("the branches", () => {
  it("leave the trunk at exactly x(12) when the swap is in month 12", () => {
    setup(journeyCompared);
    const frame = makeFrame(1120, true);
    const sw = get("road-path-switch");
    expect(attr(sw, "data-split-month")).toBe("12");
    expect(parsePath(attr(sw, "d"))[0].x).toBeCloseTo(timePos(frame, 12), 1);
    expect(Number(attr(sw, "data-split-x"))).toBe(timePos(frame, 12));
    const trunk = parsePath(attr(get("road-path-trunk"), "d"));
    expect(trunk.at(-1)!.x).toBeCloseTo(timePos(frame, 12), 1);
    expect(trunk[0].x).toBeCloseTo(timePos(frame, 0), 1);
    expect(parsePath(attr(get("road-path-keep"), "d"))[0].x).toBeCloseTo(timePos(frame, 12), 1);
  });

  it("move when the swap moves, and nowhere else", () => {
    for (const split of [3, 12, 30, 48]) {
      const j: Journey = { ...journeyCompared, switch: { ...journeyCompared.switch!, splitMonth: split } };
      setup(j);
      expect(parsePath(attr(get("road-path-switch"), "d"))[0].x).toBeCloseTo(timePos(makeFrame(1120, true), split), 1);
      expect(attr(get("road-path-switch"), "data-split-month")).toBe(String(split));
      cleanup();
    }
  });

  it("both end at x(60) with their destination just beyond", () => {
    setup(journeyCompared);
    const frame = makeFrame(1120, true);
    for (const id of ["road-path-keep", "road-path-switch"]) expect(parsePath(attr(get(id), "d")).at(-1)!.x).toBeCloseTo(frame.t1, 1);
    for (const future of ["keep", "switch"]) {
      const d = dest(future);
      const left = Number(d.style.left.replace("px", ""));
      expect(left).toBeGreaterThan(frame.t1);
      expect(left - frame.t1).toBeLessThan(24);
    }
  });

  it("draws the priced switch solid, and the unpriced offer dashed from its default month", () => {
    setup(journeyCompared);
    expect(attr(get("road-path-switch"), "data-dashed")).toBe("false");
    expect(attr(get("road-path-keep"), "data-dashed")).toBe("false");
    cleanup();
    setup(journeyOffer);
    const sw = get("road-path-switch");
    expect(attr(sw, "data-dashed")).toBe("true");
    expect(sw.getAttribute("stroke-dasharray")).toBeTruthy();
    expect(attr(sw, "data-split-month")).toBe("12");
    expect(parsePath(attr(sw, "d"))[0].x).toBeCloseTo(timePos(makeFrame(1120, true), 12), 1);
  });

  it("draws only keep when there is no other car", () => {
    setup({ ...journeyOffer, switch: null });
    expect(screen.queryByTestId("road-path-switch")).toBeNull();
    expect(screen.queryByTestId("road-path-trunk")).toBeNull();
    expect(all("destination")).toHaveLength(1);
    expect(dest("keep")).toBeTruthy();
    const keep = parsePath(attr(get("road-path-keep"), "d"));
    expect(keep[0].x).toBeCloseTo(timePos(makeFrame(1120, false), 0), 1);
    expect(keep.at(-1)!.x).toBeCloseTo(makeFrame(1120, false).t1, 1);
  });

  it("does not move when costs, the month or the selected event change, only when events, the split, the selection or the size do", () => {
    const first = setup(journeyCompared);
    const paths = () => ["road-path-keep", "road-path-switch", "road-path-trunk", "road-hit"].map((id) => attr(get(id), "d"));
    const before = paths();
    const labelsBefore = all("event-label").map((l) => l.style.transform);
    const markersBefore = all("event-marker").map((m) => m.style.transform);
    first.again({
      ...journeyCompared,
      month: 47,
      monthLabel: "Sep 2030",
      selectedEventId: "move",
      keep: { ...journeyCompared.keep, fiveYearCost: 11111, costThroughMonth: 222 },
      switch: { ...journeyCompared.switch!, fiveYearCost: 99999, costThroughMonth: 3333 },
      difference: { amount: 88888, phrase: "Switching adds $88,888", source: "illustrative" },
    });
    expect(paths()).toEqual(before);
    expect(all("event-label").map((l) => l.style.transform)).toEqual(labelsBefore);
    expect(all("event-marker").map((m) => m.style.transform)).toEqual(markersBefore);

    first.again({ ...journeyCompared, switch: { ...journeyCompared.switch!, splitMonth: 24 } });
    expect(attr(get("road-path-switch"), "d")).not.toBe(before[1]);
    first.again({ ...journeyCompared, selectedFuture: "switch", keep: { ...journeyCompared.keep, selected: false }, switch: { ...journeyCompared.switch!, selected: true } });
    expect(attr(get("road-hit"), "d")).not.toBe(before[3]);
    first.again({ ...journeyCompared, events: journeyCompared.events.slice(0, 2) });
    expect(all("event-marker")).toHaveLength(2);
  });
});

describe("the destinations", () => {
  it("each say the future, its five-year cost formatted as dollars, and the car it ends in", () => {
    setup(journeyCompared);
    const keep = dest("keep");
    const sw = dest("switch");
    expect(keep.tagName).toBe("BUTTON");
    expect(keep.textContent).toContain("Keep your Camry");
    expect(keep.textContent).toContain("$31,287");
    expect(keep.textContent).toContain("over five years");
    expect(keep.textContent).toContain("2022 Camry SE");
    expect(sw.textContent).toContain("Switch to the RAV4");
    expect(sw.textContent).toContain("$35,639");
    expect(sw.textContent).toContain("2024 RAV4 Hybrid XLE");
    expect(keep.textContent).toContain(usd(journeyCompared.keep.fiveYearCost!));
    expect(sw.textContent).toContain(usd(journeyCompared.switch!.fiveYearCost!));
  });

  it("show the same figure at month 0 and at month 60, never the month-dependent cost", () => {
    const first = setup(withMonth(journeyCompared, 0));
    const at0 = all("destination").map((d) => d.textContent);
    first.again(withMonth(journeyCompared, 60, { monthLabel: "Oct 2031" }));
    const at60 = all("destination").map((d) => d.textContent);
    expect(at60).toEqual(at0);
    for (const text of at0) {
      expect(text).not.toContain(usd(journeyCompared.keep.costThroughMonth!));
      expect(text).not.toContain(usd(journeyCompared.switch!.costThroughMonth!));
    }
  });

  it("show no source label of their own: the page says it once", () => {
    setup(journeyCompared);
    expect(document.body.textContent).not.toMatch(/illustrative|estimated|synthetic|sourced/i);
  });

  it("are buttons that are pressed when their future is selected", () => {
    setup(journeyCompared);
    expect(attr(dest("keep"), "aria-pressed")).toBe("true");
    expect(attr(dest("switch"), "aria-pressed")).toBe("false");
    cleanup();
    setup(journeySwitchSelected);
    expect(attr(dest("keep"), "aria-pressed")).toBe("false");
    expect(attr(dest("switch"), "aria-pressed")).toBe("true");
  });

  it("select their future when pressed", () => {
    const { onSelectFuture, onCompare } = setup(journeyCompared);
    fireEvent.click(dest("switch"));
    expect(onSelectFuture).toHaveBeenLastCalledWith("switch");
    fireEvent.click(dest("keep"));
    expect(onSelectFuture).toHaveBeenLastCalledWith("keep");
    expect(onSelectFuture).toHaveBeenCalledTimes(2);
    expect(onCompare).not.toHaveBeenCalled();
  });

  it("show Compare in place of a cost for the offer, and ask for the comparison, never a made up number", () => {
    const { onSelectFuture, onCompare } = setup(journeyOffer);
    const sw = dest("switch");
    expect(sw.textContent).toContain("Compare");
    expect(sw.textContent).not.toContain("$");
    expect(sw.textContent).toContain("Switch to the RAV4");
    expect(attr(sw, "aria-pressed")).toBe("false");
    expect(dest("keep").textContent).toContain("$31,287");
    fireEvent.click(sw);
    expect(onCompare).toHaveBeenCalledTimes(1);
    expect(onSelectFuture).not.toHaveBeenCalled();
  });

  it("ask for the comparison when the dashed path itself is tapped", () => {
    const { onSelectFuture, onCompare } = setup(journeyOffer);
    fireEvent.click(get("road-hit-other"));
    expect(onCompare).toHaveBeenCalledTimes(1);
    expect(onSelectFuture).not.toHaveBeenCalled();
  });

  it("select the other future when its path is tapped", () => {
    const { onSelectFuture, again } = setup(journeyCompared);
    fireEvent.click(get("road-hit-other"));
    expect(onSelectFuture).toHaveBeenLastCalledWith("switch");
    again(journeySwitchSelected);
    fireEvent.click(get("road-hit-other"));
    expect(onSelectFuture).toHaveBeenLastCalledWith("keep");
  });
});

describe("selecting a future", () => {
  it("makes its path white and 2px, and quiets the other to ink at 35%", () => {
    setup(journeyCompared);
    const keep = get("road-path-keep");
    const sw = get("road-path-switch");
    expect(attr(keep, "class")).toContain("stroke-ink");
    expect(attr(keep, "class")).not.toContain("stroke-ink/");
    expect(keep.style.strokeWidth).toBe("2");
    expect(attr(keep, "data-selected")).toBe("true");
    expect(attr(sw, "class")).toContain("stroke-ink/35");
    expect(sw.style.strokeWidth).toBe("1.5");
    expect(attr(sw, "data-selected")).toBe("false");
    cleanup();
    setup(journeySwitchSelected);
    expect(attr(get("road-path-switch"), "class")).not.toContain("stroke-ink/");
    expect(get("road-path-switch").style.strokeWidth).toBe("2");
    expect(attr(get("road-path-keep"), "class")).toContain("stroke-ink/35");
  });

  it("changes the stroke and its width over about 250ms", () => {
    setup(journeyCompared);
    for (const id of ["road-path-keep", "road-path-switch"]) {
      expect(attr(get(id), "class")).toContain("transition-[stroke,stroke-width]");
      expect(attr(get(id), "class")).toContain("duration-[250ms]");
    }
  });

  it("never moves the marker or changes the month", () => {
    const first = setup(withMonth(journeyCompared, 32, { monthLabel: "Jun 2029" }));
    const keepAt = { x: attr(get("time-marker"), "data-x"), y: attr(get("time-marker"), "data-y") };
    first.again(withMonth(journeySwitchSelected, 32));
    const marker = get("time-marker");
    expect(attr(marker, "data-month")).toBe("32");
    expect(attr(get("journey-timeline"), "data-month")).toBe("32");
    expect(attr(marker, "data-future")).toBe("switch");
    // same time, same x: only the branch it rides on is different
    expect(attr(marker, "data-x")).toBe(keepAt.x);
    expect(Number(attr(marker, "data-y"))).toBeGreaterThan(Number(keepAt.y));
    expect(first.onScrub).not.toHaveBeenCalled();
  });
});

describe("events", () => {
  it("are buttons on the road at their real month, named with their date", () => {
    setup(journeyCompared);
    const frame = makeFrame(1120, true);
    for (const e of journeyCompared.events) {
      const m = marker(e.id);
      expect(m.tagName).toBe("BUTTON");
      expect(attr(m, "type")).toBe("button");
      expect(attr(m, "aria-label")).toBe(`${e.title}, ${e.dateLabel}`);
      expect(attr(m, "data-month")).toBe(String(e.month));
      expect(translate(m).x + 12).toBeCloseTo(timePos(frame, e.month), 6);
    }
    expect(attr(marker("move"), "aria-label")).toBe("Move to Denver, Oct 2027");
  });

  it("sit on the trunk before the split and on both branches after it, as one button", () => {
    setup(journeyCompared);
    expect(attr(marker("miles"), "data-on")).toBe("trunk");
    expect(attr(marker("move"), "data-on")).toBe("trunk");
    expect(attr(marker("swap"), "data-on")).toBe("switch");
    expect(attr(marker("kid"), "data-on")).toBe("both");
    expect(attr(marker("kid"), "data-shape")).toBe("pair");
    expect(document.querySelectorAll('[data-testid="event-marker"][data-event-id="kid"]')).toHaveLength(1);
    const road = roadOf(journeyCompared);
    const [up, down] = road.markers.find((m) => m.id === "kid")!.dots;
    expect(up.x).toBe(down.x);
    expect(up.y).toBeLessThan(down.y);
    expect(marker("kid").style.height).toBe(`${road.markers.find((m) => m.id === "kid")!.rect.h}px`);
  });

  it("show only the short date and the title, with no cost words and no verdict", () => {
    setup(journeyCompared);
    for (const e of journeyCompared.events) {
      const l = label(e.id);
      expect(l.textContent).toBe(`${e.dateLabel}${e.title}`);
      expect(l.textContent).not.toMatch(/\$|cost|cheaper|save|recommend|better|worse|best/i);
    }
  });

  it("select the event when its marker or its label is pressed, once", () => {
    const { onSelectEvent } = setup(journeyCompared);
    fireEvent.click(marker("move"));
    expect(onSelectEvent).toHaveBeenLastCalledWith("move");
    fireEvent.click(marker("kid"));
    expect(onSelectEvent).toHaveBeenLastCalledWith("kid");
    fireEvent.click(label("swap"));
    expect(onSelectEvent).toHaveBeenLastCalledWith("swap");
    expect(onSelectEvent).toHaveBeenCalledTimes(3);
  });

  it("mark the selected one as pressed", () => {
    setup(journeySwitchSelected);
    expect(attr(marker("kid"), "aria-pressed")).toBe("true");
    for (const id of ["miles", "move", "swap"]) expect(attr(marker(id), "aria-pressed")).toBe("false");
  });

  it("give a changed event one ring that runs once, and none under reduced motion", () => {
    const changed: Journey = { ...journeyCompared, events: journeyCompared.events.map((e) => (e.id === "move" ? { ...e, changed: true } : e)) };
    setup(changed);
    expect(document.querySelectorAll(".jt-ring")).toHaveLength(1);
    expect(marker("move").querySelector(".jt-ring")).not.toBeNull();
    const css = document.querySelector("style")?.textContent ?? "";
    expect(css).toContain("@keyframes jt-ring");
    expect(css).toMatch(/1200ms[^;}]*\b1\b/);
    expect(css).not.toContain("infinite");
    cleanup();
    setup(changed, { reducedMotion: true });
    expect(document.querySelectorAll(".jt-ring")).toHaveLength(0);
    expect(document.querySelector("style")).toBeNull();
    cleanup();
    setup(journeyCompared);
    expect(document.querySelectorAll(".jt-ring")).toHaveLength(0);
  });

  it("move to their new place when the assumptions change", () => {
    const first = setup(journeyCompared);
    const before = translate(marker("move")).x;
    first.again({ ...journeyCompared, events: journeyCompared.events.map((e) => (e.id === "move" ? { ...e, month: 18, changed: true } : e)) });
    expect(translate(marker("move")).x).toBeGreaterThan(before);
    expect(translate(marker("move")).x + 12).toBeCloseTo(timePos(makeFrame(1120, true), 18), 6);
    expect(attr(marker("move"), "class")).toContain("transition-transform");
  });
});

describe("the time marker", () => {
  it("follows the month along the selected path, on the path", () => {
    const first = setup(journeyCompared);
    const road = roadOf(journeyCompared);
    for (const future of ["keep", "switch"] as const) {
      for (const month of [0, 6, 12, 13, 25, 32, 47, 60]) {
        const j = future === "keep" ? withMonth(journeyCompared, month) : withMonth(journeySwitchSelected, month);
        first.again(j);
        const m = get("time-marker");
        const at = pointOnRoad(road, future, month);
        expect(attr(m, "data-month")).toBe(String(month));
        expect(attr(m, "data-future")).toBe(future);
        expect(Number(attr(m, "data-x"))).toBeCloseTo(timePos(road.frame, month), 6);
        expect(Number(attr(m, "data-y"))).toBeCloseTo(at.y, 6);
        expect(translate(m).x + 12).toBeCloseTo(at.x, 6);
        expect(translate(m).y + 12).toBeCloseTo(at.y, 6);
        const selectedPath = attr(get("road-hit"), "d");
        expect(distanceToLine(parsePath(selectedPath), at)).toBeLessThan(0.6);
      }
    }
  });

  it("glides to a new month over about 250ms", () => {
    setup(journeyCompared);
    expect(attr(get("time-marker"), "class")).toContain("transition-transform");
    expect(attr(get("time-marker"), "class")).toContain("duration-[250ms]");
    expect(attr(get("time-marker"), "data-dragging")).toBe("false");
  });
});

describe("scrubbing along the road", () => {
  const BOX = { x: 0, y: 0, left: 0, top: 0, right: 1120, bottom: 380, width: 1120, height: 380, toJSON: () => ({}) } as DOMRect;
  const frame = makeFrame(1120, true);
  const at = (month: number, nudge = 0) => timePos(frame, month) + nudge;

  it("calls onScrub with a whole month, from the first press, continuously while dragging", () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(BOX);
    const { onScrub } = setup(journeyCompared);
    const hit = get("road-hit");
    expect(hit.style.touchAction).toBe("none");
    expect(attr(hit, "stroke-width")).toBe("24");

    fireEvent.pointerDown(hit, { clientX: at(30, 0.4), clientY: 150, pointerId: 1, button: 0, pointerType: "mouse" });
    expect(onScrub).toHaveBeenLastCalledWith(30);
    expect(attr(get("time-marker"), "data-dragging")).toBe("true");

    fireEvent.pointerMove(hit, { clientX: at(31), clientY: 150, pointerId: 1 });
    expect(onScrub).toHaveBeenLastCalledWith(31);
    fireEvent.pointerMove(hit, { clientX: at(34, -0.3), clientY: 150, pointerId: 1 });
    expect(onScrub).toHaveBeenLastCalledWith(34);
    fireEvent.pointerMove(hit, { clientX: at(34, 99999), clientY: 150, pointerId: 1 });
    expect(onScrub).toHaveBeenLastCalledWith(60);
    fireEvent.pointerMove(hit, { clientX: -4000, clientY: 150, pointerId: 1 });
    expect(onScrub).toHaveBeenLastCalledWith(0);
    expect(onScrub).toHaveBeenCalledTimes(5);
    for (const [m] of onScrub.mock.calls) expect(Number.isInteger(m)).toBe(true);

    fireEvent.pointerUp(hit, { clientX: at(10), pointerId: 1 });
    expect(attr(get("time-marker"), "data-dragging")).toBe("false");
    fireEvent.pointerMove(hit, { clientX: at(20), pointerId: 1 });
    expect(onScrub).toHaveBeenCalledTimes(5); // moving without pressing is not scrubbing
  });

  it("has no glide on the marker while dragging, and glides again after", () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(BOX);
    setup(journeyCompared);
    const hit = get("road-hit");
    fireEvent.pointerDown(hit, { clientX: at(5), pointerId: 1, button: 0, pointerType: "mouse" });
    const marker = get("time-marker");
    expect(attr(marker, "data-dragging")).toBe("true");
    expect(attr(marker, "class")).not.toMatch(/transition|duration/);
    fireEvent.pointerCancel(hit, { pointerId: 1 });
    expect(attr(get("time-marker"), "data-dragging")).toBe("false");
    expect(attr(get("time-marker"), "class")).toContain("transition-transform");
  });

  it("does not scrub from a right click", () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(BOX);
    const { onScrub } = setup(journeyCompared);
    fireEvent.pointerDown(get("road-hit"), { clientX: at(5), pointerId: 1, button: 2, pointerType: "mouse" });
    expect(onScrub).not.toHaveBeenCalled();
  });

  it("scrubs along the other future too when it is the selected one", () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(BOX);
    const { onScrub } = setup(journeySwitchSelected);
    fireEvent.pointerDown(get("road-hit"), { clientX: at(50), pointerId: 1, button: 0, pointerType: "touch" });
    expect(onScrub).toHaveBeenLastCalledWith(50);
  });
});

describe("reduced motion", () => {
  it("leaves no transition, duration or animation class anywhere", () => {
    const changed: Journey = { ...journeyCompared, events: journeyCompared.events.map((e) => ({ ...e, changed: true })) };
    setup(changed, { reducedMotion: true });
    for (const el of document.querySelectorAll("*")) {
      expect(attr(el, "class"), `${el.tagName} ${attr(el, "data-testid")}`).not.toMatch(/transition|duration|animate|jt-ring/);
      expect((el as HTMLElement).style?.transition ?? "").toBe("");
      expect((el as HTMLElement).style?.animation ?? "").toBe("");
    }
    expect(document.querySelector("style")).toBeNull();
  });

  it("is the same road, only still", () => {
    setup(journeyCompared);
    const moving = attr(get("road-hit"), "d");
    cleanup();
    setup(journeyCompared, { reducedMotion: true });
    expect(attr(get("road-hit"), "d")).toBe(moving);
  });
});

describe("narrow screens", () => {
  function narrow(width: number) {
    const tall = makeFrame(width, true).height; // what the drawing is, so the pointer maps one to one
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: width, bottom: tall, width, height: tall, toJSON: () => ({}) } as DOMRect);
  }

  it("rotates the road to run top to bottom at 360px instead of shrinking it", () => {
    narrow(360);
    const { onScrub } = setup(journeyCompared);
    const root = get("journey-timeline");
    expect(attr(root, "data-orientation")).toBe("vertical");
    expect(get("journey-road").getAttribute("width")).toBe("360");
    expect(Number(root.style.height.replace("px", ""))).toBeGreaterThan(360);
    const road = roadOf(journeyCompared, 360);
    expect(road.orientation).toBe("vertical");

    // time runs down: the marker's y is the month
    const m = get("time-marker");
    expect(Number(attr(m, "data-y"))).toBeCloseTo(timePos(road.frame, 0), 6);
    // the switch leaves at y(12)
    expect(parsePath(attr(get("road-path-switch"), "d"))[0].y).toBeCloseTo(timePos(road.frame, 12), 1);
    // events at their month, down the page
    for (const e of journeyCompared.events) expect(translate(marker(e.id)).y + 12).toBeCloseTo(timePos(road.frame, e.month), 6);
    // everything fits across the screen
    for (const id of ["destination", "event-label", "event-marker"]) {
      for (const el of all(id)) {
        const x = el.style.transform ? translate(el).x : Number(el.style.left.replace("px", ""));
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x + Number(el.style.width.replace("px", ""))).toBeLessThanOrEqual(360);
      }
    }
    // dragging down the road scrubs by y
    fireEvent.pointerDown(get("road-hit"), { clientX: 200, clientY: timePos(road.frame, 40), pointerId: 1, button: 0, pointerType: "touch" });
    expect(onScrub).toHaveBeenLastCalledWith(40);
    expect(all("road-axis-tick")).toHaveLength(6);
  });

  it("goes back to the wide road at 640px", () => {
    narrow(640);
    setup(journeyCompared);
    expect(attr(get("journey-timeline"), "data-orientation")).toBe("horizontal");
  });
});

describe("keyboard and screen readers", () => {
  it("makes every event and destination a real button, reachable in time order", () => {
    setup(journeyCompared);
    const buttons = [...document.querySelectorAll("button")];
    expect(buttons).toHaveLength(6);
    for (const b of buttons) {
      expect(b.getAttribute("tabindex")).toBeNull();
      expect(attr(b, "type")).toBe("button");
      b.focus();
      expect(document.activeElement).toBe(b);
    }
    const order = buttons.map((b) => attr(b, "data-testid") + ":" + (attr(b, "data-event-id") || attr(b, "data-future")));
    expect(order).toEqual(["event-marker:miles", "event-marker:move", "event-marker:swap", "event-marker:kid", "destination:keep", "destination:switch"]);
  });

  it("hides the drawing from assistive technology but not the buttons", () => {
    setup(journeyCompared);
    expect(attr(get("journey-road"), "aria-hidden")).toBe("true");
    for (const b of document.querySelectorAll("button")) expect(b.closest('[aria-hidden="true"]')).toBeNull();
  });

  it("has nothing that only shows on hover", () => {
    setup(journeyCompared);
    expect(document.querySelectorAll("[title]")).toHaveLength(0);
    for (const el of document.querySelectorAll("*")) expect(attr(el, "class")).not.toMatch(/(^|\s)(hidden|invisible|opacity-0)(\s|$)|group-hover:(block|visible|opacity-100)/);
  });

  it("has a visible focus ring on every button", () => {
    setup(journeyCompared);
    for (const b of document.querySelectorAll("button")) expect(attr(b, "class")).toContain("focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink");
  });
});

describe("writing", () => {
  const journeys = [journeyCompared, journeyOffer, journeySwitchSelected, journeyEmpty, journeySwitchWins, { ...journeyOffer, switch: null }];

  it("has no em dash, no demo and no data on screen, in any state", () => {
    for (const j of journeys) {
      setup(j);
      for (const text of everythingVisible()) {
        expect(text).not.toContain(EM_DASH);
        expect(text).not.toMatch(/demo|data/i);
      }
      cleanup();
    }
  });

  it("formats every dollar figure with usd, and shows no other number as money", () => {
    for (const j of [journeyCompared, journeySwitchSelected, journeySwitchWins]) {
      setup(j);
      const figures = (document.body.textContent ?? "").match(/\$[\d,]+/g) ?? [];
      expect(figures.sort()).toEqual([usd(j.keep.fiveYearCost!), usd(j.switch!.fiveYearCost!)].sort());
      for (const f of figures) expect(f).toMatch(/^\$\d{1,3}(,\d{3})*$/);
      cleanup();
    }
  });

  it("keeps text at 12px or more", () => {
    setup(journeyCompared);
    for (const el of document.querySelectorAll("[class]")) {
      const sizes = [...attr(el, "class").matchAll(/text-\[(\d+)px\]/g)].map((m) => Number(m[1]));
      for (const s of sizes) expect(s).toBeGreaterThanOrEqual(12);
      expect(attr(el, "class")).not.toMatch(/text-(\[?1[01]px\]?|2xs)/);
    }
  });

  it("keeps em dashes out of the source", () => {
    for (const file of ["roadGeometry.ts", "JourneyTimeline.tsx", "roadGeometry.test.ts", "JourneyTimeline.test.tsx"]) {
      expect(readFileSync(new URL(file, import.meta.url), "utf8")).not.toContain(EM_DASH);
    }
  });
});
