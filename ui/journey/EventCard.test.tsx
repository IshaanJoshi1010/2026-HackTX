import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EVENT_CARD_SIZE, EventCard } from "./EventCard";
import { fixtureEvents, journeyCompared, journeyEmpty, journeyOffer, journeySwitchSelected } from "./fixtures";
import { impactSentence, momentSentence, type EventImpact } from "./impact";
import type { Journey, JourneyEvent } from "./types";

const EM_DASH = String.fromCharCode(0x2014);

const impact = (over: Partial<EventImpact> = {}): EventImpact => ({
  eventId: "x", costDelta: 0, changesCost: false, fuelDelta: null, milesDelta: null, carChangeMonth: null,
  fit: [], constraints: [], modeled: false, warning: null, ...over,
});

const selected = (journey: Journey, id: string, over: Partial<Journey> = {}): Journey => ({ ...journey, selectedEventId: id, ...over });
const withEvent = (journey: Journey, id: string, over: Partial<JourneyEvent>): Journey => ({
  ...journey,
  events: journey.events.map((e) => (e.id === id ? { ...e, ...over } : e)),
});

const card = () => screen.getByTestId("event-card");
/** The height classes: the only part of the card's size that may never differ between states. */
const heightClasses = (el: HTMLElement) => el.className.split(/\s+/).filter((c) => /^(?:sm:|md:|lg:)?(?:h|min-h|max-h)-/.test(c));

beforeEach(() => {
  vi.useRealTimers();
});
afterEach(() => cleanup());

describe("EventCard: an event is selected", () => {
  const kid = selected(journeyCompared, "kid", { month: 32, monthLabel: "Jun 2029" });

  it("shows the short name, the date and one sentence about what it changes", () => {
    render(<EventCard journey={kid} impact={impact({ fit: ["Passenger fit goes from good to tight from Jun 2029"], modeled: true })} onExplain={() => {}} />);
    expect(screen.getByTestId("event-card-title")).toHaveTextContent("Second child");
    expect(screen.getByTestId("event-card-when")).toHaveTextContent("Jun 2029 · In 2 yr 8 mo");
    expect(screen.getByTestId("event-card-sentence")).toHaveTextContent("No direct vehicle-cost change modeled. Passenger fit goes from good to tight from Jun 2029.");
  });

  it("is a labeled region", () => {
    render(<EventCard journey={kid} impact={null} onExplain={() => {}} />);
    const region = screen.getByRole("region", { name: "Selected moment" });
    expect(region).toBe(card());
    expect(card()).toHaveAttribute("data-state", "event");
  });

  it("offers Explain this, and it calls onExplain", () => {
    const onExplain = vi.fn();
    render(<EventCard journey={kid} impact={null} onExplain={onExplain} />);
    const button = screen.getByRole("button", { name: "Explain this" });
    expect(button).toHaveAttribute("type", "button");
    fireEvent.click(button);
    expect(onExplain).toHaveBeenCalledTimes(1);
  });

  it("the button can be reached and shows a focus ring", () => {
    render(<EventCard journey={kid} impact={null} onExplain={() => {}} />);
    const button = screen.getByRole("button", { name: "Explain this" });
    button.focus();
    expect(button).toHaveFocus();
    expect(button.className).toContain("focus-visible:outline-2");
    expect(button.className).toContain("focus-visible:outline-offset-2");
    expect(button.className).toContain("focus-visible:outline-ink");
  });

  it("says each kind of impact in the one sentence", () => {
    const cases: Array<[string, EventImpact | null]> = [
      ["move", impact()],
      ["miles", impact({ costDelta: 5912, changesCost: true, milesDelta: 40000, modeled: true })],
      ["swap", impact({ costDelta: 4352, changesCost: true, carChangeMonth: 12, modeled: true })],
      ["kid", impact({ costDelta: 700, changesCost: true, modeled: true })],
      ["kid", null],
    ];
    for (const [id, i] of cases) {
      const journey = selected(journeyCompared, id);
      const { unmount } = render(<EventCard journey={journey} impact={i} onExplain={() => {}} />);
      const event = journey.events.find((e) => e.id === id)!;
      expect(screen.getByTestId("event-card-sentence")).toHaveTextContent(impactSentence(event, i));
      unmount();
    }
  });

  it("clamps long text instead of growing: the title is one line, the sentence is two", () => {
    const long = withEvent(kid, "kid", { title: "A very long name for an event that goes on and on and on and on and on and on" });
    render(<EventCard journey={long} impact={impact({ fit: ["Passenger fit goes from good to tight from Jun 2029 and then some more words to be sure it is long"], modeled: true })} onExplain={() => {}} />);
    expect(screen.getByTestId("event-card-title").className).toContain("truncate");
    expect(screen.getByTestId("event-card-sentence").className).toContain("line-clamp-2");
    expect(card().className).toContain("overflow-hidden");
  });
});

describe("EventCard: nothing selected", () => {
  it("says where the selected month stands, with no button and no instruction to select something", () => {
    render(<EventCard journey={journeyCompared} impact={null} onExplain={() => {}} />);
    expect(card()).toHaveAttribute("data-state", "moment");
    expect(screen.getByTestId("event-card-sentence")).toHaveTextContent(momentSentence(journeyCompared));
    expect(screen.queryByRole("button")).toBeNull();
    expect(card().textContent).not.toMatch(/select an event/i);
  });

  it("names the future it is speaking about", () => {
    render(<EventCard journey={{ ...journeySwitchSelected, selectedEventId: null }} impact={null} onExplain={() => {}} />);
    expect(screen.getByTestId("event-card-when")).toHaveTextContent("Switch to the RAV4");
  });

  it("works with no events at all", () => {
    render(<EventCard journey={journeyEmpty} impact={null} onExplain={() => {}} />);
    expect(screen.getByTestId("event-card-sentence")).toHaveTextContent("you are in the Camry, with no changes yet.");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("falls back to the keep future when there is no other car", () => {
    render(<EventCard journey={{ ...journeyOffer, switch: null, selectedFuture: "switch" }} impact={null} onExplain={() => {}} />);
    expect(screen.getByTestId("event-card-when")).toHaveTextContent("Keep your Camry");
  });
});

describe("EventCard: updating", () => {
  it("marks that it is updating, quietly and politely", () => {
    const { rerender } = render(<EventCard journey={journeyCompared} impact={null} onExplain={() => {}} />);
    const live = screen.getByTestId("event-card-updating");
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(live).toHaveTextContent("");
    expect(card()).toHaveAttribute("data-updating", "false");
    rerender(<EventCard journey={{ ...journeyCompared, updating: true }} impact={null} onExplain={() => {}} />);
    expect(screen.getByTestId("event-card-updating")).toBe(live); // the same live region, so the change is announced
    expect(live).toHaveTextContent("Updating");
    expect(card()).toHaveAttribute("data-updating", "true");
  });

  it("dims the sentence and says it is updating when there is no result yet", () => {
    render(<EventCard journey={selected({ ...journeyCompared, updating: true }, "kid")} impact={null} onExplain={() => {}} />);
    expect(screen.getByTestId("event-card-sentence")).toHaveTextContent("Updating what this changes.");
    expect(screen.getByTestId("event-card-sentence").className).toContain("opacity-60");
  });
});

describe("EventCard: a one-shot highlight for what a change touched", () => {
  afterEach(() => vi.useRealTimers());

  it("lights a changed event, then lets go by itself", () => {
    vi.useFakeTimers();
    const changed = withEvent(selected(journeyCompared, "move"), "move", { changed: true });
    render(<EventCard journey={changed} impact={null} onExplain={() => {}} />);
    expect(card()).toHaveAttribute("data-changed", "true");
    expect(card().className).toContain("fork-fade");
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(card()).toHaveAttribute("data-changed", "false");
    expect(card().className).not.toContain("fork-fade");
  });

  it("does not light an event the change did not touch", () => {
    render(<EventCard journey={selected(journeyCompared, "move")} impact={null} onExplain={() => {}} />);
    expect(card()).toHaveAttribute("data-changed", "false");
    expect(card().className).not.toContain("fork-fade");
  });

  it("lights again for the next change", () => {
    vi.useFakeTimers();
    const calm = selected(journeyCompared, "move");
    const lit = withEvent(calm, "move", { changed: true });
    const { rerender } = render(<EventCard journey={lit} impact={null} onExplain={() => {}} />);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(card()).toHaveAttribute("data-changed", "false");
    rerender(<EventCard journey={calm} impact={null} onExplain={() => {}} />); // a later change touched something else
    expect(card()).toHaveAttribute("data-changed", "false");
    rerender(<EventCard journey={lit} impact={null} onExplain={() => {}} />); // and now this one again
    expect(card()).toHaveAttribute("data-changed", "true");
  });
});

describe("EventCard: the size never changes", () => {
  it("has the same fixed height classes with an event, with only a moment, while updating, and while lit", () => {
    const states: Journey[] = [
      selected(journeyCompared, "kid"),
      selected(journeyCompared, "swap"),
      journeyCompared,
      journeyEmpty,
      { ...selected(journeyCompared, "kid"), updating: true },
      { ...journeyCompared, updating: true },
      withEvent(selected(journeyCompared, "move"), "move", { changed: true }),
    ];
    const sets = states.map((journey) => {
      const { unmount } = render(<EventCard journey={journey} impact={null} onExplain={() => {}} />);
      const found = heightClasses(card());
      unmount();
      return found.join(" ");
    });
    expect(new Set(sets).size).toBe(1);
    expect(sets[0]).toBe(EVENT_CARD_SIZE);
    expect(sets[0]).toMatch(/\bh-\[/);
    expect(sets[0]).not.toMatch(/min-h|max-h|h-auto/);
  });

  it("is at least 120px tall at every width", () => {
    const px = EVENT_CARD_SIZE.match(/\[(\d+)px\]/g)!.map((m) => Number(m.slice(1, -3)));
    expect(px.length).toBeGreaterThanOrEqual(2);
    for (const n of px) expect(n).toBeGreaterThanOrEqual(120);
  });

  it("takes a className and keeps the size", () => {
    render(<EventCard journey={journeyCompared} impact={null} onExplain={() => {}} className="mt-4" />);
    expect(card().className).toContain("mt-4");
    expect(heightClasses(card()).join(" ")).toBe(EVENT_CARD_SIZE);
  });
});

describe("EventCard: words", () => {
  it("never says demo, data or no effect, and has no dashes, in any state", () => {
    const states: Array<[Journey, EventImpact | null]> = [
      [journeyCompared, null],
      [journeyOffer, null],
      [journeyEmpty, null],
      ...fixtureEvents.flatMap((e): Array<[Journey, EventImpact | null]> => [
        [selected(journeyCompared, e.id), null],
        [selected(journeyCompared, e.id), impact()],
        [selected(journeyCompared, e.id), impact({ costDelta: 1234, changesCost: true, milesDelta: 9000, carChangeMonth: 12, modeled: true })],
        [selected({ ...journeyCompared, updating: true }, e.id), impact({ fit: ["Passenger fit goes from good to tight from Jun 2029"], modeled: true })],
      ]),
    ];
    for (const [journey, i] of states) {
      const { container, unmount } = render(<EventCard journey={journey} impact={i} onExplain={() => {}} />);
      const text = container.textContent ?? "";
      expect(text).not.toMatch(/\bdemo\b|\bdata\b|no effect|doesn'?t matter/i);
      expect(text).not.toContain(EM_DASH);
      for (const el of container.querySelectorAll("[title], [aria-label], [placeholder]")) {
        const words = [el.getAttribute("title"), el.getAttribute("aria-label"), el.getAttribute("placeholder")].join(" ");
        expect(words).not.toMatch(/\bdemo\b|\bdata\b/i);
      }
      unmount();
    }
  });

  it("passes words from the journey through customerText", () => {
    const rough = withEvent(selected(journeyCompared, "move"), "move", { title: "Move with demo data", whenLabel: "In 1 yr" });
    render(<EventCard journey={rough} impact={null} onExplain={() => {}} />);
    expect(within(card()).getByTestId("event-card-title")).toHaveTextContent("Move with illustrative figures");
  });

  it("uses text of at least 12px: nothing smaller than text-xs", () => {
    render(<EventCard journey={selected(journeyCompared, "kid")} impact={null} onExplain={() => {}} />);
    expect(card().innerHTML).not.toMatch(/text-\[(?:[0-9]|1[01])px\]/);
  });
});
