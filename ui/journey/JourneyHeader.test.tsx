import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { journeyCompared, journeyEmpty, journeyOffer, journeySwitchWins } from "./fixtures";
import { JourneyHeader, headingFor } from "./JourneyHeader";
import type { Journey } from "./types";

// Built from the code point so this file has none itself.
const EM_DASH = String.fromCharCode(0x2014);

afterEach(() => cleanup());

function setup(journey: Journey, nextActionLabel = "") {
  const calls = { recommendation: vi.fn(), costs: vi.fn(), compare: vi.fn() };
  const view = render(
    <JourneyHeader
      journey={journey}
      nextActionLabel={nextActionLabel}
      onOpenRecommendation={calls.recommendation}
      onOpenCosts={calls.costs}
      onCompare={calls.compare}
    />,
  );
  return { ...view, calls };
}

const badges = (root: HTMLElement) => root.querySelectorAll("[data-source]");

/** Everything a person could read or hear: text, tooltips, labels. */
function words(root: HTMLElement): string {
  const out = [root.textContent ?? ""];
  for (const el of root.querySelectorAll("*")) {
    for (const a of ["title", "aria-label", "placeholder", "alt"]) {
      const v = el.getAttribute(a);
      if (v) out.push(v);
    }
  }
  return out.join(" ");
}

describe("JourneyHeader, compared", () => {
  it("says Close call as the heading and opens the recommendation from it", () => {
    const { calls } = setup(journeyCompared);
    expect(screen.getByText("Life takes turns.")).toBeInTheDocument();
    const heading = screen.getByRole("heading", { level: 1 });
    const button = within(heading).getByRole("button", { name: "Close call" });
    expect(button.querySelector("svg")).not.toBeNull(); // the small chevron
    fireEvent.click(button);
    expect(calls.recommendation).toHaveBeenCalledTimes(1);
    expect(calls.costs).not.toHaveBeenCalled();
    expect(calls.compare).not.toHaveBeenCalled();
  });

  it("follows the engine's call: keep, close, switch", () => {
    expect(headingFor({ ...journeyCompared, call: "keep" })).toBe("Keep your Camry");
    expect(headingFor(journeyCompared)).toBe("Close call");
    expect(headingFor(journeySwitchWins)).toBe("Switch to the RAV4");
    expect(headingFor(journeyOffer)).toBeNull();
  });

  it("shows Keep your Camry and Switch to the RAV4 as the heading", () => {
    setup({ ...journeyCompared, call: "keep" });
    expect(screen.getByRole("button", { name: "Keep your Camry" })).toBeInTheDocument();
    cleanup();
    setup(journeySwitchWins);
    expect(screen.getByRole("button", { name: "Switch to the RAV4" })).toBeInTheDocument();
  });

  it("states the difference over five years in one sentence", () => {
    setup(journeyCompared);
    expect(screen.getByTestId("journey-difference")).toHaveTextContent("Switching adds $4,352 over five years.");
    cleanup();
    setup(journeySwitchWins);
    expect(screen.getByTestId("journey-difference")).toHaveTextContent("Switching saves $2,100 over five years.");
  });

  it("has exactly one source label, next to a Modeled net cost caption", () => {
    const { container } = setup(journeyCompared);
    expect(badges(container)).toHaveLength(1);
    expect(badges(container)[0]).toHaveAttribute("data-source", "illustrative");
    expect(screen.getByTestId("journey-source")).toHaveTextContent("Modeled net cost");
    cleanup();
    const wins = setup(journeySwitchWins);
    expect(badges(wins.container)).toHaveLength(1);
  });

  it("has no Compare with button once compared", () => {
    setup(journeyCompared);
    expect(screen.queryByRole("button", { name: /^Compare with/ })).toBeNull();
  });

  it("opens the costs from Compare costs", () => {
    const { calls } = setup(journeyCompared);
    fireEvent.click(screen.getByRole("button", { name: "Compare costs" }));
    expect(calls.costs).toHaveBeenCalledTimes(1);
    expect(calls.recommendation).not.toHaveBeenCalled();
  });
});

describe("JourneyHeader, before comparing", () => {
  it("heads the page Your next five years as plain text, not a button", () => {
    setup(journeyOffer);
    const heading = screen.getByRole("heading", { level: 1, name: "Your next five years" });
    expect(within(heading).queryByRole("button")).toBeNull();
    expect(screen.queryByRole("button", { name: "Your next five years" })).toBeNull();
  });

  it("offers to compare with the other car by name", () => {
    const { calls } = setup(journeyOffer);
    fireEvent.click(screen.getByRole("button", { name: "Compare with the RAV4" }));
    expect(calls.compare).toHaveBeenCalledTimes(1);
    expect(calls.recommendation).not.toHaveBeenCalled();
  });

  it("makes no claim about the difference, and still labels the figures it shows once", () => {
    const { container } = setup(journeyOffer);
    expect(screen.getByTestId("journey-difference")).toHaveTextContent("Compare to see what switching would change over five years.");
    expect(screen.getByTestId("journey-difference")).not.toHaveTextContent(/\$/);
    expect(badges(container)).toHaveLength(1);
  });

  it("still lets you open the costs", () => {
    const { calls } = setup(journeyEmpty);
    fireEvent.click(screen.getByRole("button", { name: "Compare costs" }));
    expect(calls.costs).toHaveBeenCalledTimes(1);
  });

  it("has no compare button and no crash when there is no other car", () => {
    setup({ ...journeyOffer, switch: null });
    expect(screen.queryByRole("button", { name: /^Compare with/ })).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Your next five years" })).toBeInTheDocument();
  });
});

describe("JourneyHeader, next step", () => {
  it("shows the engine's next step as one truncated line and opens the recommendation from it", () => {
    const { calls } = setup(journeyCompared, "Reevaluate at 68,000 miles or in 12 months.");
    const next = screen.getByRole("button", { name: "Next: Reevaluate at 68,000 miles or in 12 months." });
    expect(next.className).toContain("truncate");
    fireEvent.click(next);
    expect(calls.recommendation).toHaveBeenCalledTimes(1);
  });

  it("shows nothing when there is no next step", () => {
    setup(journeyCompared, "");
    expect(screen.queryByTestId("journey-next")).toBeNull();
    cleanup();
    setup(journeyCompared, "   ");
    expect(screen.queryByTestId("journey-next")).toBeNull();
  });
});

describe("JourneyHeader, updating", () => {
  it("says Updating in a polite live region while a change is worked out", () => {
    setup({ ...journeyCompared, updating: true });
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Updating");
  });

  it("keeps the live region but says nothing when it is not updating", () => {
    setup(journeyCompared);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.queryByText("Updating")).toBeNull();
  });
});

describe("JourneyHeader, words", () => {
  it("has no em dash, and never says demo or data, in any state", () => {
    const states: Array<[Journey, string]> = [
      [journeyCompared, "Reevaluate at 68,000 miles or in 12 months."],
      [journeyOffer, ""],
      [journeySwitchWins, "Keep an eye on resale value."],
      [{ ...journeyCompared, updating: true }, ""],
    ];
    for (const [journey, next] of states) {
      const { container } = setup(journey, next);
      const text = words(container);
      expect(text).not.toContain(EM_DASH);
      expect(text).not.toMatch(/demo|data/i);
      cleanup();
    }
  });

  it("puts a sample or data word from another module into plain words", () => {
    setup(journeyCompared, "Check the demo data.");
    expect(words(document.body)).not.toMatch(/demo|data/i);
  });
});
