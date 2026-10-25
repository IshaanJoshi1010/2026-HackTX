import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LifeEvent, Scenario } from "@/contracts";
import { ai, data, sim } from "@/ui/mocks";
import { usd } from "@/ui/profile/format";
import { metricSource } from "@/ui/profile/metricSources";
import { specsFor } from "@/ui/store/selectors";
import { eventTitle } from "@/ui/store/eventLabels";
import { resetForkStoreForTests, simulationInputs, useForkStore } from "@/ui/store/useForkStore";
import { ExplainContent } from "./ExplainContent";
import { fixtureEvents, journeyCompared, journeyEmpty, journeyOffer, journeySwitchSelected } from "./fixtures";
import { calendarLabel, computeImpact, type EventImpact } from "./impact";
import type { FutureKind, Journey, JourneyEvent } from "./types";

const EM_DASH = String.fromCharCode(0x2014);
const state = () => useForkStore.getState();
const actions = () => useForkStore.getState().actions;

const impact = (over: Partial<EventImpact> = {}): EventImpact => ({
  eventId: "x", costDelta: 0, changesCost: false, fuelDelta: null, milesDelta: null, carChangeMonth: null,
  fit: [], constraints: [], modeled: false, warning: null, ...over,
});
const selected = (journey: Journey, id: string, over: Partial<Journey> = {}): Journey => ({ ...journey, selectedEventId: id, ...over });
const withEvent = (journey: Journey, id: string, over: Partial<JourneyEvent>): Journey => ({
  ...journey,
  events: journey.events.map((e) => (e.id === id ? { ...e, ...over } : e)),
});

const content = () => screen.getByTestId("explain-content");
const section = (id: "explain-changes" | "explain-said" | "explain-assumed" | "explain-source" | "explain-sofar" | "explain-cost") => screen.getByTestId(id);
const badgeOf = (el: HTMLElement) => el.querySelector("[data-source]");

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  resetForkStoreForTests();
  useForkStore.setState({ hydrated: true });
  vi.spyOn(ai, "explain").mockRejectedValue(new Error("no words in this test"));
});
afterEach(() => cleanup());

describe("ExplainContent: an event, from fixtures", () => {
  const kid = selected(journeySwitchSelected, "kid");

  it("shows the name and date as a heading, then the four parts in order", () => {
    render(<ExplainContent journey={kid} impact={impact()} />);
    expect(screen.getByTestId("explain-title")).toHaveTextContent("Second child");
    expect(content()).toHaveTextContent("Jun 2029");
    const order = ["explain-changes", "explain-said", "explain-assumed", "explain-source"].map((id) => section(id as "explain-changes"));
    const headings = order.map((s) => within(s).getByRole("heading", { level: 4 }).textContent);
    expect(headings).toEqual(["What changes", "What you said", "What Fork assumed", "Where this comes from"]);
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("shows the quote as a blockquote, only when there is one", () => {
    const { unmount } = render(<ExplainContent journey={kid} impact={impact()} />);
    const quote = within(section("explain-said")).getByText(/expecting my second child in 2029/);
    expect(quote.tagName).toBe("BLOCKQUOTE");
    unmount();
    render(<ExplainContent journey={selected(journeySwitchSelected, "swap")} impact={impact()} />);
    expect(screen.queryByTestId("explain-said")).toBeNull();
  });

  it("says what Fork assumed in plain words, with the date note first", () => {
    render(<ExplainContent journey={kid} impact={impact()} />);
    const assumed = section("explain-assumed");
    expect(within(assumed).getByTestId("assumed-date")).toHaveTextContent("June 2027 is assumed because you only said summer. Change it if that is wrong.");
    expect(assumed.textContent).not.toMatch(/represented by|US-season|confirm or correct/i);
  });

  it("rewrites every assumption that is not about the date, once each", () => {
    const journey = withEvent(kid, "kid", {
      assumptions: [
        "Destination distance is assumed one way; confirm the commute distance.",
        "Destination distance is assumed one way; confirm the commute distance.",
        "something odd; keep an eye on it",
        "Moved from month 3 to the fork month 12",
      ],
    });
    render(<ExplainContent journey={journey} impact={impact()} />);
    const lines = within(section("explain-assumed")).getAllByTestId("assumed-line").map((l) => l.textContent);
    expect(lines).toEqual(["That distance is taken as one way. Change it if your commute is different.", "Something odd; keep an eye on it."]);
    expect(within(section("explain-assumed")).getByTestId("assumed-date")).toHaveTextContent("Moved to the month this future begins.");
  });

  it("is honest when nothing was assumed", () => {
    const clearEvent = withEvent(kid, "kid", { assumptions: [], certainty: "clear" });
    const { unmount } = render(<ExplainContent journey={clearEvent} impact={impact()} />);
    expect(within(section("explain-assumed")).getByTestId("assumed-empty")).toHaveTextContent("Nothing extra. Fork used what you said.");
    expect(screen.queryByTestId("assumed-date")).toBeNull();
    unmount();
    const noQuote = withEvent(clearEvent, "kid", { quote: undefined });
    render(<ExplainContent journey={noQuote} impact={impact()} />);
    expect(within(section("explain-assumed")).getByTestId("assumed-empty")).toHaveTextContent("Nothing extra was assumed.");
  });

  it("says an inferred date is a best reading even when the reason was not written down", () => {
    const journey = withEvent(kid, "kid", { assumptions: [], certainty: "inferred" });
    render(<ExplainContent journey={journey} impact={impact()} />);
    expect(screen.getByTestId("assumed-date")).toHaveTextContent("Jun 2029 is Fork's best reading of what you said. Change it if that is wrong.");
  });

  it("names its inputs on one line, without technical words", () => {
    render(<ExplainContent journey={kid} impact={impact()} />);
    const line = within(section("explain-source")).getByTestId("source-line");
    expect(line.textContent).toMatch(/your car's price, fuel economy and upkeep, your yearly driving and your fuel price/);
    expect(line.textContent).not.toMatch(/simulat|engine|model|payload|schema|api|scenario|revision/i);
    expect(line.querySelectorAll("p, li, br")).toHaveLength(0);
  });

  it("the swap says it ran with and without the switch, using both cars", () => {
    render(<ExplainContent journey={selected(journeySwitchSelected, "swap")} impact={impact()} />);
    expect(screen.getByTestId("source-line")).toHaveTextContent(/with the switch and without it, using both cars/);
  });
});

describe("ExplainContent: what changes", () => {
  const kid = selected(journeySwitchSelected, "kid");

  it("a cost that goes up says so with its figure and where the figure comes from", () => {
    render(<ExplainContent journey={kid} impact={impact({ costDelta: 3763.4, changesCost: true, modeled: true })} />);
    const row = screen.getByTestId("change-cost");
    expect(row).toHaveTextContent("Adds $3,763 to your five-year cost");
    expect(badgeOf(row)).toHaveAttribute("data-source", "illustrative"); // the switch future's own cost label
  });

  it("a cost that goes down saves", () => {
    render(<ExplainContent journey={kid} impact={impact({ costDelta: -1200, changesCost: true, modeled: true })} />);
    expect(screen.getByTestId("change-cost")).toHaveTextContent("Saves $1,200 on your five-year cost");
  });

  it("takes the cost label from the future the event is read in", () => {
    const keep = { ...journeyCompared, selectedEventId: "kid", keep: { ...journeyCompared.keep, costSource: "user" as const }, switch: { ...journeyCompared.switch!, costSource: "estimated" as const } };
    const { unmount } = render(<ExplainContent journey={keep} impact={impact({ costDelta: 500, changesCost: true, modeled: true })} />);
    expect(badgeOf(screen.getByTestId("change-cost"))).toHaveAttribute("data-source", "user");
    unmount();
    // the swap only exists in the switch future, wherever you are looking
    render(<ExplainContent journey={{ ...keep, selectedEventId: "swap" }} impact={impact({ costDelta: 500, changesCost: true, carChangeMonth: 12, modeled: true })} />);
    expect(badgeOf(screen.getByTestId("change-cost"))).toHaveAttribute("data-source", "estimated");
  });

  it("every figure has a badge: cost, fuel and miles", () => {
    render(
      <ExplainContent
        journey={selected(journeyCompared, "miles")}
        impact={impact({ costDelta: 5912, changesCost: true, fuelDelta: 3750, milesDelta: 40000, modeled: true })}
      />,
    );
    for (const id of ["change-cost", "change-fuel", "change-miles"]) {
      const row = screen.getByTestId(id);
      expect(row.textContent, id).toMatch(/\d/);
      expect(badgeOf(row), id).not.toBeNull();
    }
    expect(screen.getByTestId("change-fuel")).toHaveTextContent("Adds $3,750 in fuel over five years");
    expect(screen.getByTestId("change-miles")).toHaveTextContent("Adds about 40,000 miles over five years");
  });

  it("fuel and miles that go down say saves and removes", () => {
    render(<ExplainContent journey={selected(journeyCompared, "miles")} impact={impact({ fuelDelta: -1374, milesDelta: -3000, modeled: true })} />);
    expect(screen.getByTestId("change-fuel")).toHaveTextContent("Saves $1,374 in fuel over five years");
    expect(screen.getByTestId("change-miles")).toHaveTextContent("Removes about 3,000 miles over five years");
  });

  it("the swap says when the car changes", () => {
    render(<ExplainContent journey={selected(journeySwitchSelected, "swap")} impact={impact({ costDelta: 4352, changesCost: true, carChangeMonth: 12, modeled: true })} />);
    expect(screen.getByTestId("change-car")).toHaveTextContent("Changes your car in Oct 2027.");
  });

  it("fit and hard constraints are listed in words, with no figure to badge", () => {
    render(
      <ExplainContent
        journey={kid}
        impact={impact({
          fit: ["Passenger fit goes from good to tight from Jun 2029"],
          constraints: ["There are fewer seats than people in your household, from Jun 2029"],
          modeled: true,
        })}
      />,
    );
    expect(screen.getByTestId("change-fit")).toHaveTextContent("Passenger fit goes from good to tight from Jun 2029.");
    expect(screen.getByTestId("change-constraint")).toHaveTextContent("There are fewer seats than people in your household, from Jun 2029.");
    expect(screen.getByTestId("change-cost")).toHaveTextContent("No direct vehicle-cost change modeled.");
    expect(screen.queryByTestId("not-modeled")).toBeNull();
  });

  it("costs that shift but end about the same say that", () => {
    render(<ExplainContent journey={kid} impact={impact({ changesCost: true, modeled: true })} />);
    expect(screen.getByTestId("change-cost")).toHaveTextContent("Costs shift along the way, but your five-year cost ends about the same.");
  });

  it("an event the model gives no number to says 'no direct vehicle-cost change modeled' and that it may still matter, never 'no effect'", () => {
    render(<ExplainContent journey={selected(journeyCompared, "move")} impact={impact()} />);
    expect(screen.getByTestId("change-cost")).toHaveTextContent("No direct vehicle-cost change modeled.");
    expect(screen.getByTestId("not-modeled")).toHaveTextContent("Fork does not put a number on this one yet, so it is not in your cost. It may still matter in ways Fork cannot measure.");
    expect(section("explain-changes").textContent).not.toMatch(/no effect|doesn'?t matter/i);
    expect(section("explain-changes").querySelector("[data-source]")).toBeNull(); // no figure, so nothing to badge
  });

  it("shows the simulation's own note about the event", () => {
    render(<ExplainContent journey={kid} impact={impact({ warning: "One value could not be used, so it is left out." })} />);
    expect(screen.getByTestId("change-warning")).toHaveTextContent("One value could not be used, so it is left out.");
  });

  it("says it is working on it with no result yet, and that it is updating when it is", () => {
    const { unmount } = render(<ExplainContent journey={kid} impact={null} />);
    expect(screen.getByTestId("changes-pending")).toHaveTextContent("Working out what this changes.");
    expect(screen.getByTestId("explain-updating")).toHaveTextContent("");
    unmount();
    render(<ExplainContent journey={{ ...kid, updating: true }} impact={null} />);
    expect(screen.getByTestId("changes-pending")).toHaveTextContent("Updating what this changes.");
    expect(screen.getByTestId("explain-updating")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByTestId("explain-updating")).toHaveTextContent("Updating");
  });
});

describe("ExplainContent: no event selected", () => {
  it("says where the month stands, what has happened, and what the future costs, each with its source", () => {
    render(<ExplainContent journey={{ ...journeyCompared, month: 12, monthLabel: "Oct 2027" }} />);
    expect(content()).toHaveAttribute("data-mode", "moment");
    expect(screen.getByTestId("explain-title")).toHaveTextContent("Oct 2027");
    expect(screen.getByTestId("moment-sentence")).toHaveTextContent("You are in the Camry, with 2 changes so far. The switch future changes cars this month.");
    expect(within(section("explain-sofar")).getAllByTestId("sofar-line").map((l) => l.textContent)).toEqual(["20,000 miles a yearOct 2026", "Move to DenverOct 2027"]);
    const through = screen.getByTestId("cost-through");
    expect(through).toHaveTextContent("Net cost through Oct 2027: $18,500");
    expect(badgeOf(through)).toHaveAttribute("data-source", "illustrative");
    const five = screen.getByTestId("cost-five-year");
    expect(five).toHaveTextContent("Net cost over five years: $31,287");
    expect(badgeOf(five)).toHaveAttribute("data-source", "illustrative");
    expect(screen.getByTestId("source-line")).toHaveTextContent("The same five-year run as the road");
  });

  it("speaks about the selected future", () => {
    render(<ExplainContent journey={{ ...journeySwitchSelected, selectedEventId: null, month: 12, monthLabel: "Oct 2027" }} />);
    expect(screen.getByText("Switch to the RAV4")).toBeInTheDocument();
    expect(screen.getByTestId("cost-five-year")).toHaveTextContent("$35,639");
  });

  it("is honest with nothing yet: no changes, and no cost until the other car is compared", () => {
    render(<ExplainContent journey={{ ...journeyEmpty, switch: { ...journeyEmpty.switch!, priced: false }, keep: { ...journeyEmpty.keep, priced: false, fiveYearCost: null, costThroughMonth: null } }} />);
    expect(screen.getByTestId("sofar-empty")).toHaveTextContent("Nothing you told Fork has happened by this month.");
    expect(screen.getByTestId("cost-empty")).toHaveTextContent("Compare with the other car to see what this future costs.");
    expect(content().querySelector("[data-source]")).toBeNull();
  });

  it("does not show a through-month figure it does not have", () => {
    render(<ExplainContent journey={{ ...journeyCompared, keep: { ...journeyCompared.keep, costThroughMonth: null } }} />);
    expect(screen.queryByTestId("cost-through")).toBeNull();
    expect(screen.getByTestId("cost-five-year")).toBeInTheDocument();
  });

  it("only lists the changes that have happened by the selected month", () => {
    render(<ExplainContent journey={{ ...journeyOffer, month: 5, monthLabel: "Mar 2027" }} />);
    expect(within(section("explain-sofar")).getAllByTestId("sofar-line")).toHaveLength(1);
  });
});

describe("ExplainContent: words", () => {
  it("never says demo, data or no effect, and has no dashes, in any state", () => {
    const journeys: Journey[] = [
      journeyCompared, journeyOffer, journeyEmpty, journeySwitchSelected,
      ...fixtureEvents.map((e) => selected(journeyCompared, e.id)),
      ...fixtureEvents.map((e) => selected({ ...journeyCompared, updating: true }, e.id)),
    ];
    const impacts: Array<EventImpact | null> = [
      null,
      impact(),
      impact({ costDelta: 4352, changesCost: true, fuelDelta: 1200, milesDelta: 8000, carChangeMonth: 12, fit: ["Passenger fit goes from good to tight from Jun 2029"], constraints: ["There are fewer seats than people in your household, from Jun 2029"], modeled: true, warning: "Part of what you said is not something Fork models, so it is left out." }),
    ];
    for (const journey of journeys) {
      for (const i of impacts) {
        const { container, unmount } = render(<ExplainContent journey={journey} impact={i} />);
        expect(container.textContent).not.toMatch(/\bdemo\b|\bdata\b|no effect|doesn'?t matter/i);
        expect(container.textContent).not.toContain(EM_DASH);
        for (const el of container.querySelectorAll("[title], [aria-label], [placeholder]")) {
          const words = [el.getAttribute("title"), el.getAttribute("aria-label"), el.getAttribute("placeholder")].join(" ");
          expect(words).not.toMatch(/\bdemo\b|\bdata\b/i);
        }
        // the source badge is the shared component, which sets its own small label; everything else in the drawer is 12px or more
        const mine = container.cloneNode(true) as HTMLElement;
        mine.querySelectorAll("[data-source]").forEach((badge) => badge.remove());
        expect(mine.innerHTML).not.toMatch(/text-\[(?:[0-9]|1[01])px\]/);
        unmount();
      }
    }
  });

  it("passes the quote, title and labels from the journey through customerText", () => {
    const journey = withEvent(selected(journeyCompared, "move"), "move", { title: "Move with demo data", quote: "it is demo data", assumptions: ["Uses demo data for the trade-in value"] });
    render(<ExplainContent journey={journey} impact={impact()} />);
    expect(screen.getByTestId("explain-title")).toHaveTextContent("Move with illustrative figures");
    expect(section("explain-said")).toHaveTextContent("it is illustrative figures");
    expect(section("explain-assumed")).toHaveTextContent("Uses illustrative figures for the trade-in value.");
  });
});

// ---------------------------------------------------------------------------
// The real thing: Alex confirmed, compared, and the drawer reading the store.
// ---------------------------------------------------------------------------

async function compareAlex() {
  vi.spyOn(ai, "interpret").mockResolvedValue({ aiAvailable: false });
  await actions().startFromSample("camry-2022-se");
  actions().onRevealStage("done");
  await actions().submitDump(data.demo.brainDump);
  actions().confirmDrafts(state().explore.draftChanges.map((d) => d.id));
  await actions().openReplaceComparison();
}

const scenarioById = (id: string): Scenario => state().explore.scenarios.find((s) => s.id === id)!;
const keepScenario = () => scenarioById(state().comparison!.keepId);
const replaceScenario = () => scenarioById(state().comparison!.replaceId);
const idOf = (s: Scenario, type: LifeEvent["type"]) => s.events.find((e) => e.type === type)!.id;

/** A Journey over the store's real events, with the fixture's branch shapes. The drawer only reads these parts of it. */
function journeyOf(selectedEventId: string | null, selectedFuture: FutureKind = "switch"): Journey {
  const s = state();
  const replace = replaceScenario();
  const events: JourneyEvent[] = replace.events
    .filter((e) => e.status === "confirmed")
    .sort((a, b) => a.month - b.month)
    .map((e) => ({
      id: e.id,
      type: e.type,
      kind: e.type === "vehicle_replacement" ? "swap" : "life",
      month: e.month,
      title: e.type === "vehicle_replacement" ? "Switch to the RAV4" : eventTitle(e),
      dateLabel: calendarLabel(s.todayISO, e.month),
      whenLabel: `Month ${e.month}`,
      futures: e.type === "vehicle_replacement" ? ["switch"] : ["keep", "switch"],
      certainty: e.certainty,
      quote: e.quote,
      assumptions: e.assumptions,
      payload: e.payload,
      changed: false,
    }));
  const base = journeyCompared;
  return {
    ...base,
    events,
    selectedEventId,
    selectedFuture,
    keep: { ...base.keep, scenarioId: keepScenario().id, selected: selectedFuture === "keep" },
    switch: { ...base.switch!, scenarioId: replace.id, selected: selectedFuture === "switch" },
  };
}

function worked(scenario: Scenario, eventId: string) {
  const inputs = simulationInputs(state())!;
  return computeImpact({ scenario, eventId, simulate: (sc) => sim.simulate(inputs.twin, sc, inputs.ctx), dateLabel: (m) => calendarLabel(state().todayISO, m) })!;
}

describe("ExplainContent on the real store: Alex", () => {
  it("the driving change shows the engine's own cost, fuel and miles, each with the label the profile gives it", async () => {
    await compareAlex();
    const id = idOf(keepScenario(), "mileage_change");
    const want = worked(replaceScenario(), id);
    render(<ExplainContent journey={journeyOf(id)} />);

    expect(screen.getByTestId("explain-title")).toHaveTextContent("20,000 miles a year");
    expect(screen.getByTestId("change-cost")).toHaveTextContent(`Adds ${usd(Math.round(want.costDelta))} to your five-year cost`);
    expect(screen.getByTestId("change-fuel")).toHaveTextContent(`${usd(Math.round(want.fuelDelta!))} in fuel`);
    expect(screen.getByTestId("change-miles")).toHaveTextContent(`about ${Math.round(want.milesDelta!).toLocaleString("en-US")} miles`);

    const profile = state().explore.confirmedProfile;
    const spec = specsFor(replaceScenario().events.find((e) => e.type === "vehicle_replacement")!.payload.vehicleId as string);
    expect(badgeOf(screen.getByTestId("change-fuel"))).toHaveAttribute("data-source", metricSource("fuelSpend", profile, spec) ?? "none");
    expect(badgeOf(screen.getByTestId("change-miles"))).toHaveAttribute("data-source", metricSource("mileage", profile, spec) ?? "none");
    expect(section("explain-said")).toHaveTextContent("driving 20,000 miles annually");
    // the date note: the dump said nothing about when
    expect(section("explain-assumed")).toHaveTextContent("You did not say when, so this starts this month.");
  });

  it("moving to Denver is not modeled, and says so without saying it has no effect", async () => {
    await compareAlex();
    const id = idOf(keepScenario(), "relocation");
    render(<ExplainContent journey={journeyOf(id)} />);
    expect(screen.getByTestId("explain-title")).toHaveTextContent("Move to Denver");
    expect(screen.getByTestId("change-cost")).toHaveTextContent("No direct vehicle-cost change modeled.");
    expect(screen.getByTestId("not-modeled")).toBeInTheDocument();
    expect(content().textContent).not.toMatch(/no effect/i);
  });

  it("the second child lists fit exactly as the engine's two runs differ, and its date as a guess", async () => {
    await compareAlex();
    const id = idOf(keepScenario(), "family_change");
    const want = worked(replaceScenario(), id);
    render(<ExplainContent journey={journeyOf(id)} />);
    expect(screen.queryAllByTestId("change-fit")).toHaveLength(want.fit.length);
    expect(screen.queryAllByTestId("change-constraint")).toHaveLength(want.constraints.length);
    if (want.changesCost) expect(screen.getByTestId("change-cost")).toHaveTextContent(usd(Math.round(want.costDelta)));
    else expect(screen.getByTestId("change-cost")).toHaveTextContent("No direct vehicle-cost change modeled.");
    expect(screen.getByTestId("assumed-date")).toHaveTextContent("June is assumed because you provided only the year.");
    expect(section("explain-assumed").textContent).not.toMatch(/mapped to|confirm the assumed/i);
  });

  it("the swap shows the whole gap between the two futures, and the month the car changes", async () => {
    await compareAlex();
    const id = idOf(replaceScenario(), "vehicle_replacement");
    const inputs = simulationInputs(state())!;
    const gap = sim.simulate(inputs.twin, replaceScenario(), inputs.ctx).points[59].netEconomicCost - sim.simulate(inputs.twin, keepScenario(), inputs.ctx).points[59].netEconomicCost;
    render(<ExplainContent journey={journeyOf(id, "keep")} />);
    expect(screen.getByTestId("change-cost")).toHaveTextContent(`${gap > 0 ? "Adds" : "Saves"} ${usd(Math.abs(Math.round(gap)))}`);
    expect(screen.getByTestId("change-car")).toHaveTextContent(`Changes your car in ${calendarLabel(state().todayISO, replaceScenario().events.find((e) => e.id === id)!.month)}.`);
    expect(screen.queryByTestId("change-miles")).toBeNull(); // two different odometers are not a difference in driving
    expect(screen.getByTestId("assumed-date")).toHaveTextContent("The swap is placed in the same month as your first big life change.");
    expect(screen.queryByTestId("explain-said")).toBeNull();
  });

  it("follows the store: a change to the future updates the drawer to the new numbers", async () => {
    await compareAlex();
    const id = idOf(keepScenario(), "mileage_change");
    render(<ExplainContent journey={journeyOf(id, "keep")} />);
    const before = screen.getByTestId("change-cost").textContent;
    act(() => actions().moveEvent(keepScenario().id, id, 36));
    const after = screen.getByTestId("change-cost").textContent;
    expect(after).not.toBe(before);
    expect(after).toContain(usd(Math.round(worked(keepScenario(), id).costDelta)));
  });

  it("uses a result it is handed instead of working one out", async () => {
    await compareAlex();
    const id = idOf(keepScenario(), "mileage_change");
    render(<ExplainContent journey={journeyOf(id)} impact={impact({ costDelta: 111, changesCost: true, modeled: true })} />);
    expect(screen.getByTestId("change-cost")).toHaveTextContent("Adds $111 to your five-year cost");
  });

  it("everything in it is free of the words demo and data, with the real strings", async () => {
    await compareAlex();
    for (const e of replaceScenario().events) {
      const { container, unmount } = render(<ExplainContent journey={journeyOf(e.id)} />);
      expect(container.textContent, e.type).not.toMatch(/\bdemo\b|\bdata\b|no effect/i);
      expect(container.textContent).not.toContain(EM_DASH);
      unmount();
    }
  });
});
