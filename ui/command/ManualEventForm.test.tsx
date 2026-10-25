import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetForkStoreForTests, useForkStore } from "@/ui/store/useForkStore";
import { EMPTY_FIELDS, ManualEventForm, buildManualEvent, resolveMonthYear } from "./ManualEventForm";

const drafts = () => useForkStore.getState().explore.draftChanges;
const add = () => screen.getByRole("button", { name: /add change/i });
const pick = (type: string) => fireEvent.change(screen.getByLabelText("What is changing"), { target: { value: type } });
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const hint = () => screen.getByTestId("manual-hint").textContent;
const TODAY = "2026-10-24";

beforeEach(() => {
  localStorage.clear();
  resetForkStoreForTests();
  useForkStore.setState({ hydrated: true, todayISO: TODAY });
});

afterEach(() => cleanup());

describe("buildManualEvent", () => {
  const f = EMPTY_FIELDS;
  const ev = (t: Parameters<typeof buildManualEvent>[0], fields: Partial<typeof f>, month = 0) => buildManualEvent(t, { ...f, ...fields }, month);

  it("an empty field is not a value", () => {
    for (const t of ["relocation", "mileage_change", "family_change", "cargo_change", "budget_change", "fuel_price_change"] as const) {
      expect(ev(t, {}).ok, t).toBe(false);
    }
  });

  it("zero is a real answer: no children, no miles, no budget", () => {
    expect(ev("family_change", { children: "0" })).toMatchObject({ ok: true, event: { payload: { children: 0 } } });
    expect(ev("mileage_change", { miles: "0" })).toMatchObject({ ok: true, event: { payload: { annualMiles: 0 } } });
    expect(ev("budget_change", { budget: "0" })).toMatchObject({ ok: true, event: { payload: { monthlyBudget: 0 } } });
  });

  it("yearly miles below 1,000 are accepted", () => {
    expect(ev("mileage_change", { miles: "500" })).toMatchObject({ ok: true, event: { payload: { annualMiles: 500 } } });
  });

  it("a budget change is a budget and nothing else", () => {
    const r = ev("budget_change", { budget: "450" }, 6);
    expect(r).toMatchObject({ ok: true, event: { type: "budget_change", month: 6, payload: { monthlyBudget: 450 } } });
  });

  it("gives the keys the simulation reads, and nothing it was not told", () => {
    expect(ev("relocation", { city: "  Seattle " })).toMatchObject({ ok: true, event: { payload: { location: "Seattle" } } });
    expect(ev("family_change", { children: "2" })).toMatchObject({ ok: true, event: { payload: { children: 2 } } });
    expect(ev("cargo_change", { cargo: "low" })).toMatchObject({ ok: true, event: { payload: { cargoNeed: "low" } } });
    expect(ev("fuel_price_change", { fuel: "4.25" })).toMatchObject({ ok: true, event: { payload: { fuelPricePerGal: 4.25 } } });
  });

  it("is a proposal that was checked by Dev 3's validator: never confirmed, no id, no household size or car seats", () => {
    const r = ev("family_change", { children: "2" });
    if (!r.ok) throw new Error("expected ok");
    expect(r.event.status).toBe("proposed");
    expect(r.event).not.toHaveProperty("id");
    expect(r.event.payload).not.toHaveProperty("householdSize");
    expect(r.event.payload).not.toHaveProperty("carSeats");
  });

  it("refuses values that cannot be right, and says what to fix", () => {
    expect(ev("mileage_change", { miles: "-5" })).toMatchObject({ ok: false, missing: expect.stringMatching(/negative/) });
    expect(ev("mileage_change", { miles: "abc" }).ok).toBe(false);
    expect(ev("family_change", { children: "1.5" })).toMatchObject({ ok: false, missing: expect.stringMatching(/whole number/) });
    expect(ev("family_change", { children: "-1" }).ok).toBe(false);
    expect(ev("budget_change", { budget: "-1" }).ok).toBe(false);
    expect(ev("fuel_price_change", { fuel: "0" }).ok).toBe(false);
    expect(ev("relocation", { city: "   " }).ok).toBe(false);
  });

  it("a month outside the five-year timeline is refused by the validator", () => {
    expect(ev("relocation", { city: "Boise" }, 61).ok).toBe(false);
    expect(ev("relocation", { city: "Boise" }, 60).ok).toBe(true);
  });
});

describe("resolveMonthYear: an explicit month and year, counted from the session's date", () => {
  it("places a month on the timeline", () => {
    expect(resolveMonthYear("March", 2027, TODAY)).toEqual({ ok: true, month: 5 });
    expect(resolveMonthYear("November", 2026, TODAY)).toEqual({ ok: true, month: 1 });
    expect(resolveMonthYear("October", 2031, TODAY)).toEqual({ ok: true, month: 60 });
  });

  it("says in plain words when it has passed or is beyond five years", () => {
    expect(resolveMonthYear("September", 2026, TODAY)).toEqual({ ok: false, reason: "That month has already passed." });
    expect(resolveMonthYear("December", 2031, TODAY)).toEqual({ ok: false, reason: "That's past the five-year timeline." });
  });

  it("counts from the date it is given, not from the clock", () => {
    expect(resolveMonthYear("March", 2027, "2026-06-01")).toEqual({ ok: true, month: 9 });
  });
});

describe("ManualEventForm: nothing is filled in for you", () => {
  it("starts empty, with Add off and a hint about what is missing", () => {
    render(<ManualEventForm />);
    expect(screen.getByLabelText("Moving to")).toHaveValue("");
    expect(add()).toBeDisabled();
    expect(hint()).toBe("Enter a city.");
  });

  it("cargo space has no answer picked until you pick one", () => {
    render(<ManualEventForm />);
    pick("cargo_change");
    for (const name of ["low", "medium", "high"]) expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
    expect(add()).toBeDisabled();
  });

  it("pressing Add with nothing typed does nothing", () => {
    render(<ManualEventForm />);
    fireEvent.submit(screen.getByTestId("manual-event-form"));
    expect(drafts()).toEqual([]);
  });

  it("offers the six kinds of change, including a budget", () => {
    render(<ManualEventForm />);
    const options = [...screen.getByLabelText("What is changing").querySelectorAll("option")].map((o) => o.textContent);
    expect(options).toEqual(["Move", "Driving change", "Family change", "Cargo change", "Budget change", "Fuel price change"]);
  });
});

describe("ManualEventForm: adding a change", () => {
  it("a move names only where", () => {
    const onAdded = vi.fn();
    render(<ManualEventForm onAdded={onAdded} />);
    type("Moving to", "Seattle");
    fireEvent.click(add());
    expect(drafts()).toHaveLength(1);
    expect(drafts()[0]).toMatchObject({ type: "relocation", status: "proposed", source: "user", payload: { location: "Seattle" } });
    expect(onAdded).toHaveBeenCalledOnce();
  });

  it("zero children, zero miles and a budget can each be added", () => {
    render(<ManualEventForm />);
    pick("family_change");
    type("Children, in total", "0");
    fireEvent.click(add());
    pick("mileage_change");
    type("Miles per year", "0");
    fireEvent.click(add());
    pick("budget_change");
    type("Monthly budget, dollars", "500");
    fireEvent.click(add());
    expect(drafts().map((d) => [d.type, d.payload])).toEqual([
      ["family_change", { children: 0 }],
      ["mileage_change", { annualMiles: 0 }],
      ["budget_change", { monthlyBudget: 500 }],
    ]);
  });

  it("a time you did not pick starts now and says so; a time you picked is yours", () => {
    render(<ManualEventForm />);
    type("Moving to", "Seattle");
    fireEvent.click(add());
    expect(drafts()[0]).toMatchObject({ month: 0, certainty: "inferred", assumptions: ["You didn't pick a time, so this starts now."] });

    type("Moving to", "Boise");
    fireEvent.change(screen.getByLabelText(/^When:/), { target: { value: "24" } });
    fireEvent.click(add());
    expect(drafts()[1]).toMatchObject({ month: 24, certainty: "clear", assumptions: [] });
  });

  it("a proposal changes nothing until it is confirmed", () => {
    render(<ManualEventForm />);
    const before = useForkStore.getState().explore;
    type("Moving to", "Seattle");
    fireEvent.click(add());
    expect(useForkStore.getState().explore.scenarios).toBe(before.scenarios);
    expect(useForkStore.getState().explore.confirmedProfile).toBe(before.confirmedProfile);
  });

  it("clears itself after adding, so the next one starts empty too", () => {
    render(<ManualEventForm />);
    type("Moving to", "Seattle");
    fireEvent.click(add());
    expect(screen.getByLabelText("Moving to")).toHaveValue("");
    expect(add()).toBeDisabled();
  });
});

describe("ManualEventForm: choosing a date as a month and year", () => {
  const openPicker = () => fireEvent.click(screen.getByRole("button", { name: "Pick a month and year" }));
  const choose = (month: string, year: string) => {
    fireEvent.change(screen.getByLabelText("Month"), { target: { value: month } });
    fireEvent.change(screen.getByLabelText("Year"), { target: { value: year } });
  };

  it("lets you resolve a date the reader could not place, and it is a clear, chosen time", () => {
    render(<ManualEventForm />);
    type("Moving to", "Denver");
    openPicker();
    expect(hint()).toBe("Pick a month and a year.");
    expect(add()).toBeDisabled();
    choose("March", "2027");
    expect(screen.getByText(/5 mo/)).toBeInTheDocument(); // month 5 on the timeline
    fireEvent.click(add());
    expect(drafts()[0]).toMatchObject({ type: "relocation", month: 5, certainty: "clear", assumptions: [] });
  });

  it("the years offered start at the session's year and run five more", () => {
    render(<ManualEventForm />);
    openPicker();
    const years = [...screen.getByLabelText("Year").querySelectorAll("option")].map((o) => o.textContent);
    expect(years).toEqual(["Year", "2026", "2027", "2028", "2029", "2030", "2031"]);
  });

  it("says why a month cannot be used, and will not add it", () => {
    render(<ManualEventForm />);
    type("Moving to", "Denver");
    openPicker();
    choose("September", "2026");
    expect(hint()).toBe("That month has already passed.");
    expect(add()).toBeDisabled();
    choose("December", "2031");
    expect(hint()).toBe("That's past the five-year timeline.");
    expect(add()).toBeDisabled();
  });

  it("you can go back to the slider", () => {
    render(<ManualEventForm />);
    openPicker();
    fireEvent.click(screen.getByRole("button", { name: "Use a slider" }));
    expect(screen.getByRole("slider")).toBeInTheDocument();
  });
});
