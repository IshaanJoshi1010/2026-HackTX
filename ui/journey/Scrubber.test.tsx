import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { journeyCompared, journeyEmpty, journeyOffer, journeySwitchSelected, journeySwitchWins } from "./fixtures";
import { Scrubber } from "./Scrubber";
import type { Journey } from "./types";

afterEach(cleanup);

const EM_DASH = String.fromCharCode(0x2014);

function setup(journey: Journey, playing = false) {
  const onScrub = vi.fn();
  const onTogglePlay = vi.fn();
  const view = render(<Scrubber journey={journey} playing={playing} onScrub={onScrub} onTogglePlay={onTogglePlay} />);
  const slider = () => screen.getByRole("slider", { name: "Selected month" }) as HTMLInputElement;
  const readout = () => view.container.querySelector('[data-slot="scrubber-readout"]') as HTMLElement;
  return { ...view, onScrub, onTogglePlay, slider, readout };
}

const camry = journeyCompared.keep.segments[0];
const rav4 = journeyCompared.switch!.segments[1];
/** The compared journey looking at the switch future at `month`, in whichever car that future has then. */
const switchAt = (month: number): Journey => ({
  ...journeyCompared,
  month,
  monthLabel: month < 12 ? "Sep 2027" : "Oct 2027",
  selectedFuture: "switch",
  vehicleNow: month < 12 ? camry : rav4,
  keep: { ...journeyCompared.keep, selected: false },
  switch: { ...journeyCompared.switch!, selected: true },
});

describe("the slider", () => {
  it("is a native range from month 0 to 60 in whole months, named Selected month", () => {
    const { slider } = setup(journeyCompared);
    expect(slider()).toHaveAttribute("type", "range");
    expect(slider()).toHaveAttribute("min", "0");
    expect(slider()).toHaveAttribute("max", "60");
    expect(slider()).toHaveAttribute("step", "1");
    expect(slider().value).toBe("0");
  });

  it("shows the selected month, from each fixture", () => {
    for (const [j, value] of [
      [journeyCompared, "0"],
      [journeyOffer, "0"],
      [journeySwitchSelected, "32"],
      [journeyEmpty, "0"],
      [journeySwitchWins, "0"],
    ] as const) {
      const { slider, unmount } = setup(j);
      expect(slider().value).toBe(value);
      unmount();
    }
  });

  it("reads the month aloud as a date and how far off it is", () => {
    expect(setup(journeyCompared).slider()).toHaveAttribute("aria-valuetext", "Oct 2026, now");
    cleanup();
    expect(setup(journeySwitchSelected).slider()).toHaveAttribute("aria-valuetext", "Jun 2029, in 2 yr 8 mo");
    cleanup();
    expect(setup({ ...journeyCompared, month: 12, monthLabel: "Oct 2027" }).slider()).toHaveAttribute("aria-valuetext", "Oct 2027, in 1 yr");
  });

  it("calls onScrub at once with the exact whole month on every drag step", () => {
    const { slider, onScrub } = setup({ ...journeyCompared, month: 10 });
    for (const v of ["1", "20", "59", "60", "0"]) fireEvent.change(slider(), { target: { value: v } });
    expect(onScrub.mock.calls.map((c) => c[0])).toEqual([1, 20, 59, 60, 0]);
    for (const [m] of onScrub.mock.calls) expect(Number.isInteger(m)).toBe(true);
  });

  it("never passes a month outside 0 to 60 or a fraction", () => {
    const { slider, onScrub } = setup(journeyCompared);
    fireEvent.change(slider(), { target: { value: "20.4" } });
    expect(onScrub).toHaveBeenLastCalledWith(20);
  });

  it("has no transition, so the thumb follows the pointer", () => {
    const { slider, container } = setup(journeyCompared);
    expect(slider().className).not.toMatch(/transition|duration|ease/);
    expect(container.querySelector('[data-slot="played"]')!.className).not.toMatch(/transition|duration|ease/);
  });

  it("has a thumb of at least 24px in a row at least 44px tall, and the focus ring", () => {
    const { slider } = setup(journeyCompared);
    expect(slider().className).toContain("[&::-webkit-slider-thumb]:size-6");
    expect(slider().className).toContain("[&::-moz-range-thumb]:size-6");
    expect(slider().className).toContain("[&::-webkit-slider-runnable-track]:h-11");
    expect(slider().parentElement!.className).toContain("h-11");
    for (const c of ["focus-visible:outline-2", "focus-visible:outline-offset-2", "focus-visible:outline-ink"]) expect(slider().className).toContain(c);
  });
});

describe("the keyboard", () => {
  const press = (slider: HTMLElement, key: string) => fireEvent.keyDown(slider, { key });

  it("arrows move one month", () => {
    const { slider, onScrub } = setup({ ...journeyCompared, month: 10 });
    press(slider(), "ArrowRight");
    press(slider(), "ArrowUp");
    press(slider(), "ArrowLeft");
    press(slider(), "ArrowDown");
    expect(onScrub.mock.calls.map((c) => c[0])).toEqual([11, 11, 9, 9]);
  });

  it("Page Up and Page Down move a year", () => {
    const { slider, onScrub } = setup({ ...journeyCompared, month: 20 });
    press(slider(), "PageUp");
    press(slider(), "PageDown");
    expect(onScrub.mock.calls.map((c) => c[0])).toEqual([32, 8]);
  });

  it("Home and End go to the ends", () => {
    const { slider, onScrub } = setup({ ...journeyCompared, month: 20 });
    press(slider(), "Home");
    press(slider(), "End");
    expect(onScrub.mock.calls.map((c) => c[0])).toEqual([0, 60]);
  });

  it("stays inside the ends", () => {
    const first = setup({ ...journeyCompared, month: 5 });
    press(first.slider(), "PageDown");
    press(first.slider(), "ArrowLeft");
    expect(first.onScrub.mock.calls.map((c) => c[0])).toEqual([0, 4]);
    cleanup();
    const last = setup({ ...journeyCompared, month: 58 });
    press(last.slider(), "PageUp");
    press(last.slider(), "ArrowRight");
    expect(last.onScrub.mock.calls.map((c) => c[0])).toEqual([60, 59]);
  });

  it("takes over those keys so the browser does not move the thumb a second time", () => {
    const { slider } = setup({ ...journeyCompared, month: 20 });
    expect(fireEvent.keyDown(slider(), { key: "PageUp" })).toBe(false);
    expect(fireEvent.keyDown(slider(), { key: "ArrowRight" })).toBe(false);
  });

  it("leaves other keys alone", () => {
    const { slider, onScrub } = setup({ ...journeyCompared, month: 20 });
    expect(fireEvent.keyDown(slider(), { key: "Tab" })).toBe(true);
    expect(fireEvent.keyDown(slider(), { key: "a" })).toBe(true);
    expect(fireEvent.keyDown(slider(), { key: "ArrowRight", ctrlKey: true })).toBe(true);
    expect(onScrub).not.toHaveBeenCalled();
  });
});

describe("the ticks and the played part", () => {
  const ticks = (container: HTMLElement) => [...container.querySelectorAll('[data-slot="tick"]')] as HTMLElement[];
  const left = (el: HTMLElement) => parseFloat(el.style.left);

  it("has one tick for every stop, at exactly month over 60 of the track", () => {
    for (const j of [journeyCompared, journeyOffer, journeySwitchSelected, journeyEmpty]) {
      const { container, unmount } = setup(j);
      const found = ticks(container);
      expect(found.map((t) => Number(t.dataset.month))).toEqual(j.stops);
      found.forEach((t, i) => expect(left(t)).toBeCloseTo((j.stops[i] / 60) * 100, 2));
      unmount();
    }
  });

  it("puts the fixture's stops at 0, 20 and 53.333 percent", () => {
    const { container } = setup(journeyCompared);
    expect(ticks(container).map((t) => t.style.left)).toEqual(["0%", "20%", "53.333%"]);
  });

  it("hides the ticks and year labels from assistive tech, and labels each year", () => {
    const { container } = setup(journeyCompared);
    const years = [...container.querySelectorAll('[data-slot="year"]')] as HTMLElement[];
    expect(years.map((y) => y.textContent)).toEqual(["Now", "1 yr", "2 yr", "3 yr", "4 yr", "5 yr"]);
    expect(years.map((y) => left(y))).toEqual([0, 20, 40, 60, 80, 100]);
    expect(ticks(container)[0].closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it("marks the tick under the thumb", () => {
    const { container } = setup({ ...journeyCompared, month: 12 });
    const at = ticks(container).find((t) => t.dataset.month === "12")!;
    const away = ticks(container).find((t) => t.dataset.month === "32")!;
    expect(at.className).toMatch(/(^| )bg-ink( |$)/);
    expect(away.className).toContain("bg-ink/50");
  });

  it("fills the track up to the thumb", () => {
    for (const [month, pct] of [[0, "0%"], [12, "20%"], [30, "50%"], [60, "100%"]] as const) {
      const { container, unmount } = setup({ ...journeyCompared, month });
      expect((container.querySelector('[data-slot="played"]') as HTMLElement).style.width).toBe(pct);
      unmount();
    }
  });
});

describe("the readout", () => {
  it("is one element that does not announce itself", () => {
    const { container, readout } = setup(journeyCompared);
    expect(readout()).toHaveAttribute("aria-live", "off");
    expect(container.querySelectorAll("[aria-live]")).toHaveLength(1);
    // the date, car, next milestone and cost are all inside it
    expect(readout()).toHaveTextContent("Oct 2026");
    expect(readout()).toHaveTextContent("2022 Camry SE");
    expect(readout()).toHaveTextContent("Next: Move to Denver");
    expect(readout()).toHaveTextContent("Through Oct 2026");
  });

  it("shows the selected date and the car in the selected future", () => {
    const { readout } = setup(journeySwitchSelected);
    expect(readout()).toHaveTextContent("Jun 2029");
    expect(readout()).toHaveTextContent("2024 RAV4 Hybrid XLE");
    expect(readout()).not.toHaveTextContent("Camry");
  });

  it("flips the car at the split month, not before", () => {
    const before = setup(switchAt(11));
    expect(before.readout()).toHaveTextContent("2022 Camry SE");
    expect(before.readout()).not.toHaveTextContent("RAV4");
    expect(before.readout()).not.toHaveTextContent("Swap this month");
    cleanup();
    const at = setup(switchAt(12));
    expect(at.readout()).toHaveTextContent("2024 RAV4 Hybrid XLE");
    expect(at.readout()).not.toHaveTextContent("Camry");
    expect(screen.getByText("Swap this month")).toBeInTheDocument();
    cleanup();
    const after = setup(switchAt(13));
    expect(after.readout()).not.toHaveTextContent("Swap this month");
  });

  it("keeps the car the same in the keep future, even in the swap month", () => {
    const { readout } = setup({ ...journeyCompared, month: 12, monthLabel: "Oct 2027" });
    expect(readout()).toHaveTextContent("2022 Camry SE");
    expect(readout()).not.toHaveTextContent("Swap this month");
  });

  it("names the next milestone in the selected future and how far off it is", () => {
    setup(journeyCompared);
    expect(screen.getByText("Next: Move to Denver, in 1 yr")).toBeInTheDocument();
    cleanup();
    setup({ ...journeyCompared, month: 12, monthLabel: "Oct 2027" });
    expect(screen.getByText("Next: Second child, in 1 yr 8 mo")).toBeInTheDocument();
    cleanup();
    setup({ ...journeyCompared, month: 31, monthLabel: "May 2029" });
    expect(screen.getByText("Next: Second child, in 1 mo")).toBeInTheDocument();
  });

  it("names no milestone at the end of the road", () => {
    for (const month of [32, 45, 60]) {
      const { container, unmount } = setup({ ...journeyCompared, month });
      expect(container.textContent).not.toContain("Next:");
      unmount();
    }
  });

  it("counts the swap as a milestone only when looking at the switch future", () => {
    const keep = setup({ ...journeyCompared, month: 5, events: journeyCompared.events.filter((e) => e.kind === "swap") });
    expect(keep.container.textContent).not.toContain("Next:");
    cleanup();
    setup({ ...switchAt(5), events: journeyCompared.events.filter((e) => e.kind === "swap") });
    expect(screen.getByText("Next: Switch to the RAV4, in 7 mo")).toBeInTheDocument();
  });

  it("shows the cost through the selected month, labeled as such, from the selected branch", () => {
    setup(journeyCompared);
    expect(screen.getByText("Through Oct 2026: $18,500")).toBeInTheDocument();
    cleanup();
    setup(journeySwitchSelected);
    expect(screen.getByText("Through Jun 2029: $21,000")).toBeInTheDocument();
  });

  it("carries the cost's source label for the page", () => {
    const { container } = setup(journeyCompared);
    expect(container.querySelector('[data-slot="through"]')).toHaveAttribute("data-source", "illustrative");
  });

  it("leaves the cost out when there is none, instead of inventing one", () => {
    // the unpriced offer has no cost to show
    const { container } = setup({ ...journeyOffer, selectedFuture: "switch" });
    expect(container.textContent).not.toContain("Through");
    expect(container.textContent).not.toMatch(/\$\d/);
  });

  it("never shows a five year total", () => {
    for (const j of [journeyCompared, journeySwitchSelected, journeySwitchWins, switchAt(12)]) {
      const { container, unmount } = setup(j);
      for (const total of [j.keep.fiveYearCost, j.switch!.fiveYearCost]) {
        expect(container.textContent).not.toContain((total as number).toLocaleString("en-US"));
      }
      expect(container.textContent).not.toContain("4,352");
      expect(container.textContent).not.toMatch(/five.year|5.year|total/i);
      unmount();
    }
  });

  it("says when the cost is being worked out", () => {
    setup({ ...journeyCompared, updating: true });
    expect(screen.getByText("Through Oct 2026: $18,500, updating")).toBeInTheDocument();
  });

  it("changes as one: a new month gives a new date, car, milestone and cost together", () => {
    const { container, rerender, onScrub, onTogglePlay } = setup(journeyCompared);
    rerender(<Scrubber journey={journeySwitchSelected} playing={false} onScrub={onScrub} onTogglePlay={onTogglePlay} />);
    const text = container.querySelector('[data-slot="scrubber-readout"]')!.textContent;
    expect(text).toContain("Jun 2029");
    expect(text).toContain("RAV4");
    expect(text).toContain("Through Jun 2029: $21,000");
    expect(text).not.toContain("Next:");
  });
});

describe("play and pause", () => {
  it("is a round Play button that is not pressed", () => {
    setup(journeyCompared, false);
    const button = screen.getByRole("button", { name: "Play" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button.className).toContain("rounded-full");
    expect(button.className).toContain("size-11");
  });

  it("is a pressed Pause button while playing", () => {
    setup(journeyCompared, true);
    expect(screen.queryByRole("button", { name: "Play" })).toBeNull();
    expect(screen.getByRole("button", { name: "Pause" })).toHaveAttribute("aria-pressed", "true");
  });

  it("asks the page to toggle, and does nothing else itself", () => {
    const { onTogglePlay, onScrub, rerender } = setup(journeyCompared, false);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(onTogglePlay).toHaveBeenCalledTimes(1);
    rerender(<Scrubber journey={journeyCompared} playing onScrub={onScrub} onTogglePlay={onTogglePlay} />);
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(onTogglePlay).toHaveBeenCalledTimes(2);
    expect(onScrub).not.toHaveBeenCalled();
  });
});

describe("words", () => {
  it("has no em dash, and never says demo or data, in text, labels or tooltips", () => {
    for (const j of [journeyCompared, journeyOffer, journeySwitchSelected, journeyEmpty, journeySwitchWins, switchAt(12), { ...journeyCompared, updating: true }]) {
      for (const playing of [false, true]) {
        const { container, unmount } = setup(j, playing);
        const words = [container.textContent ?? ""];
        for (const el of container.querySelectorAll("*")) {
          for (const attr of ["title", "aria-label", "placeholder", "alt", "aria-valuetext"]) {
            const v = el.getAttribute(attr);
            if (v) words.push(v);
          }
        }
        for (const w of words) {
          expect(w).not.toContain(EM_DASH);
          expect(w).not.toMatch(/demo|data/i);
        }
        unmount();
      }
    }
  });

  it("takes a class name for the page to place it", () => {
    const { container } = render(<Scrubber journey={journeyCompared} playing={false} onScrub={() => {}} onTogglePlay={() => {}} className="mt-4" />);
    expect(container.firstElementChild).toHaveClass("mt-4");
  });
});
