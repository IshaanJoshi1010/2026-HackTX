import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetForkStoreForTests, useForkStore } from "@/ui/store/useForkStore";
import { ManualEventForm, payloadFor } from "./ManualEventForm";

const drafts = () => useForkStore.getState().explore.draftChanges;
const add = () => screen.getByRole("button", { name: /add change/i });
const pick = (type: string) => fireEvent.change(screen.getByLabelText("What is changing"), { target: { value: type } });
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  localStorage.clear();
  resetForkStoreForTests();
  useForkStore.setState({ hydrated: true });
});

afterEach(() => cleanup());

describe("payloadFor", () => {
  const f = { city: "", miles: "", children: "", cargo: null, fuel: "" } as const;

  it("an empty field is not a value", () => {
    for (const t of ["relocation", "mileage_change", "family_change", "cargo_change", "fuel_price_change"] as const) {
      expect(payloadFor(t, f).ok).toBe(false);
    }
  });

  it("gives the keys the simulation reads, and nothing it was not told", () => {
    expect(payloadFor("relocation", { ...f, city: "  Seattle " })).toEqual({ ok: true, payload: { location: "Seattle" } });
    expect(payloadFor("mileage_change", { ...f, miles: "15000" })).toEqual({ ok: true, payload: { annualMiles: 15000 } });
    expect(payloadFor("family_change", { ...f, children: "2" })).toEqual({ ok: true, payload: { children: 2 } });
    expect(payloadFor("cargo_change", { ...f, cargo: "low" })).toEqual({ ok: true, payload: { cargoNeed: "low" } });
    expect(payloadFor("fuel_price_change", { ...f, fuel: "4.25" })).toEqual({ ok: true, payload: { fuelPricePerGal: 4.25 } });
  });

  it("refuses values that cannot be right, and says what to fix", () => {
    expect(payloadFor("mileage_change", { ...f, miles: "50" })).toMatchObject({ ok: false, missing: expect.stringMatching(/1,000/) });
    expect(payloadFor("mileage_change", { ...f, miles: "abc" }).ok).toBe(false);
    expect(payloadFor("family_change", { ...f, children: "0" }).ok).toBe(false);
    expect(payloadFor("family_change", { ...f, children: "1.5" }).ok).toBe(false);
    expect(payloadFor("fuel_price_change", { ...f, fuel: "-3" }).ok).toBe(false);
    expect(payloadFor("relocation", { ...f, city: "   " }).ok).toBe(false);
  });
});

describe("ManualEventForm: nothing is filled in for you", () => {
  it("starts empty, with Add off and a hint about what is missing", () => {
    render(<ManualEventForm />);
    expect(screen.getByLabelText("Moving to")).toHaveValue("");
    expect(add()).toBeDisabled();
    expect(screen.getByTestId("manual-hint")).toHaveTextContent("Enter a city.");
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
});

describe("ManualEventForm: adding a change", () => {
  it("a move names only where: no miles, no household, nothing else", () => {
    const onAdded = vi.fn();
    render(<ManualEventForm onAdded={onAdded} />);
    type("Moving to", "Seattle");
    fireEvent.click(add());
    expect(drafts()).toHaveLength(1);
    expect(drafts()[0]).toMatchObject({ type: "relocation", status: "proposed", source: "user", payload: { location: "Seattle" } });
    expect(onAdded).toHaveBeenCalledOnce();
  });

  it("children are the count you gave; the household is not worked out for you", () => {
    render(<ManualEventForm />);
    pick("family_change");
    type("Children, in total", "2");
    fireEvent.click(add());
    expect(drafts()[0].payload).toEqual({ children: 2 });
  });

  it("yearly miles, cargo and fuel price each carry what you entered", () => {
    render(<ManualEventForm />);
    pick("mileage_change");
    type("Miles per year", "15000");
    fireEvent.click(add());
    pick("cargo_change");
    fireEvent.click(screen.getByRole("button", { name: "high" }));
    fireEvent.click(add());
    pick("fuel_price_change");
    type("Fuel price, dollars per gallon", "4.25");
    fireEvent.click(add());
    expect(drafts().map((d) => [d.type, d.payload])).toEqual([
      ["mileage_change", { annualMiles: 15000 }],
      ["cargo_change", { cargoNeed: "high" }],
      ["fuel_price_change", { fuelPricePerGal: 4.25 }],
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
