import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ai } from "@/ui/mocks";
import { AssumptionsReview, type AssumptionsReviewProps } from "./AssumptionsReview";

afterEach(() => cleanup());

const current: AssumptionsReviewProps["current"] = {
  insurancePerMonth: { value: 130, source: "illustrative" },
  replacementPrice: { value: 31250, source: "estimated" },
  downPayment: { value: 3125, source: "estimated" },
  purchaseFees: { value: 450, source: "illustrative" },
  salesTaxPercent: { value: 6.25, source: "illustrative" },
  newLoanAprPercent: { value: 6.5, source: "illustrative" },
  newLoanTermMonths: { value: 60, source: "illustrative" },
  loanAprPercent: { value: 6.1, source: "estimated" },
};

function setup(over: Partial<AssumptionsReviewProps> = {}) {
  const onConfirm = vi.fn();
  const onReset = vi.fn();
  render(<AssumptionsReview fields={ai.scenarioTermFields} current={current} applied={{}} prepare={ai.prepareScenarioTerms} onConfirm={onConfirm} onReset={onReset} {...over} />);
  return { onConfirm, onReset };
}
const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const review = () => fireEvent.click(screen.getByRole("button", { name: "Review" }));
const problem = () => screen.getByTestId("terms-problem").textContent;

describe("AssumptionsReview: entering terms", () => {
  it("shows every term with what is in use now and where that came from", () => {
    setup();
    const fieldCount = ai.scenarioTermFields.length;
    expect(screen.getAllByText(/^Now /)).toHaveLength(fieldCount);
    expect(screen.getByText("Now $130 a month")).toBeInTheDocument();
    expect(screen.getByText("Now 6.25%")).toBeInTheDocument();
    expect(screen.getByTestId("terms-review").querySelectorAll("[data-source]").length).toBe(fieldCount);
    expect(screen.getByTestId("terms-review").querySelector('[data-source="none"]')).toBeNull();
  });

  it("is honest when a term is not used yet (no replacement car in the comparison)", () => {
    setup({ current: { ...current, replacementPrice: undefined } });
    expect(screen.getAllByText("Not used until you compare with a car.")).toHaveLength(1);
  });

  it("starts empty, with Review off, because nothing has been entered", () => {
    setup();
    for (const f of ai.scenarioTermFields) expect(screen.getByLabelText(new RegExp(f.label))).toHaveValue("");
    expect(screen.getByRole("button", { name: "Review" })).toBeDisabled();
    expect(problem()).toBe("Nothing entered yet.");
  });

  it("names a box that is not a number, and does not move on", () => {
    setup();
    type(/Insurance per month/, "lots");
    review();
    expect(problem()).toMatch(/insurance per month: that isn't a number/i);
    expect(screen.queryByTestId("terms-review-step")).toBeNull();
  });

  it("refuses a down payment that is more than the price in use, when it is the only thing entered", () => {
    setup();
    type(/Down payment/, "40000");
    review();
    expect(problem()).toMatch(/more than the purchase price in use \(\$31,250\)/);
  });

  it("refuses what the shared validator refuses, with its words", () => {
    setup();
    type(/Replacement loan term/, "0");
    review();
    expect(problem()).toMatch(/check the purchase and insurance values/i);
  });
});

describe("AssumptionsReview: review, then confirm", () => {
  it("shows what would change and what stays, and applies nothing before the confirm", () => {
    const { onConfirm } = setup();
    type(/Insurance per month/, "150");
    type(/Sales tax/, "7.5");
    review();
    expect(onConfirm).not.toHaveBeenCalled();

    const changed = screen.getAllByTestId("terms-changed");
    expect(changed).toHaveLength(2);
    expect(changed[0]).toHaveTextContent("Insurance per month");
    expect(changed[0]).toHaveTextContent("$150 a month");
    expect(changed[0]).toHaveTextContent("was $130 a month");
    expect(within(changed[0]).getByText("your input")).toBeInTheDocument(); // the entered value is labeled as theirs
    expect(changed[1]).toHaveTextContent("7.5%");
    expect(changed[1]).toHaveTextContent("was 6.25%");

    const unchanged = screen.getByTestId("terms-unchanged");
    expect(unchanged).toHaveTextContent(/Replacement purchase price:\s*\$31,250/);
    expect(unchanged.querySelectorAll("[data-source]").length).toBe(ai.scenarioTermFields.length - 2); // each carries its label
    expect(unchanged).not.toHaveTextContent("Insurance per month");
  });

  it("confirm sends only what was entered, with percent converted once, in code", () => {
    const { onConfirm } = setup();
    type(/Insurance per month/, "150");
    type(/Sales tax/, "6.25");
    type(/Replacement loan APR/, "6.5");
    review();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith({ insurancePerMonth: 150, salesTaxRate: 0.0625, newLoanApr: 0.065 });
  });

  it("zero is a value, not a skip", () => {
    const { onConfirm } = setup();
    type(/Down payment/, "0");
    review();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledWith({ downPayment: 0 });
  });

  it("Edit goes back with everything still typed, and nothing was applied", () => {
    const { onConfirm } = setup();
    type(/Insurance per month/, "150");
    review();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText(/Insurance per month/)).toHaveValue("150");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("after confirming it is ready for the next change, empty again", () => {
    setup();
    type(/Insurance per month/, "150");
    review();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.getByLabelText(/Insurance per month/)).toHaveValue("");
    expect(screen.queryByTestId("terms-review-step")).toBeNull();
  });
});

describe("AssumptionsReview: the terms in effect", () => {
  it("lists them in the person's own units, labeled as theirs, with a way back to the estimates", () => {
    const { onReset } = setup({ applied: { insurancePerMonth: 150, salesTaxRate: 0.0625 } });
    const inEffect = screen.getByTestId("terms-in-effect");
    expect(inEffect).toHaveTextContent("Insurance per month $150 a month");
    expect(inEffect).toHaveTextContent("Sales tax 6.25%");
    expect(inEffect.querySelectorAll('[data-source="user"]').length).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "Back to estimates" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("shows nothing when none were entered", () => {
    setup();
    expect(screen.queryByTestId("terms-in-effect")).toBeNull();
  });
});
