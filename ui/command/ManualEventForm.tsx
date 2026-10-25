"use client";

import { useId, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { EventType, LifeEvent } from "@/contracts";
import { cn } from "@/lib/utils";
import { ai } from "@/ui/mocks";
import { monthLabel } from "@/ui/profile/format";
import { EVENT_LABEL } from "@/ui/store/eventLabels";
import { MONTH_MAX, useForkStore } from "@/ui/store/useForkStore";

export interface ManualEventFormProps {
  className?: string;
  onAdded?: () => void;
}

const SUPPORTED_TYPES: EventType[] = ["relocation", "mileage_change", "family_change", "cargo_change", "budget_change", "fuel_price_change"];

type Cargo = "low" | "medium" | "high";

export interface Fields {
  city: string;
  miles: string;
  children: string;
  cargo: Cargo | null;
  budget: string;
  fuel: string;
}

export const EMPTY_FIELDS: Fields = { city: "", miles: "", children: "", cargo: null, budget: "", fuel: "" };

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** A number the person typed, or null if the box is empty or not a number. An empty box is not a value. */
const num = (text: string): number | null => (text.trim() === "" || !Number.isFinite(Number(text)) ? null : Number(text));

/**
 * What the person typed, checked by Dev 3's validator, or what is still missing. Nothing is filled in for them.
 * Zero is a real answer (no children, no miles). A change to a family states the number of children the person
 * gave and nothing else: no household size or car seats are worked out for them.
 */
export function buildManualEvent(
  type: EventType,
  f: Fields,
  month: number,
): { ok: true; event: Omit<LifeEvent, "id"> } | { ok: false; missing: string } {
  let input: Record<string, unknown>;
  switch (type) {
    case "relocation":
      if (!f.city.trim()) return { ok: false, missing: "Enter a city." };
      input = { location: f.city.trim() };
      break;
    case "mileage_change": {
      const n = num(f.miles);
      if (n === null) return { ok: false, missing: "Enter yearly miles. Zero is fine." };
      if (n < 0) return { ok: false, missing: "Miles can't be negative." };
      input = { annualMiles: Math.round(n) };
      break;
    }
    case "family_change": {
      const n = num(f.children);
      if (n === null) return { ok: false, missing: "Enter how many children you will have. Zero is fine." };
      if (!Number.isInteger(n) || n < 0) return { ok: false, missing: "Children has to be a whole number, zero or more." };
      input = { children: n };
      break;
    }
    case "cargo_change":
      if (!f.cargo) return { ok: false, missing: "Pick how much cargo space you need." };
      input = { cargoNeed: f.cargo };
      break;
    case "budget_change": {
      const n = num(f.budget);
      if (n === null) return { ok: false, missing: "Enter a monthly budget in dollars. Zero is fine." };
      if (n < 0) return { ok: false, missing: "A budget can't be negative." };
      input = { monthlyBudget: n };
      break;
    }
    case "fuel_price_change": {
      const n = num(f.fuel);
      if (n === null) return { ok: false, missing: "Enter a fuel price in dollars per gallon." };
      if (n < 0.5 || n > 20) return { ok: false, missing: "Enter a fuel price between $0.50 and $20 a gallon." };
      input = { fuelPricePerGal: n };
      break;
    }
    default:
      return { ok: false, missing: "That kind of change is not supported here." };
  }
  const checked = ai.prepareManualEvent({ type, month, ...input });
  return checked.ok ? { ok: true, event: checked.event } : { ok: false, missing: checked.error };
}

/** A month and year as a month on the timeline, or why it cannot be one, in plain words. */
export function resolveMonthYear(
  monthName: string,
  year: number,
  todayISO: string,
): { ok: true; month: number } | { ok: false; reason: string } {
  const timing = ai.resolveEventMonth(`${monthName} ${year}`, todayISO);
  if (!timing.resolved) return { ok: false, reason: /past/i.test(timing.reason) ? "That month has already passed." : "That date can't be placed. Try another month." };
  if (timing.month > MONTH_MAX) return { ok: false, reason: "That's past the five-year timeline." };
  return { ok: true, month: timing.month };
}

const inputClass =
  "h-9 rounded border border-line bg-ink/5 px-2.5 text-sm text-ink placeholder:text-ink/50 focus:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/** The way in when you would rather type a change as a form. Works with no AI and no network. */
export function ManualEventForm({ className, onAdded }: ManualEventFormProps) {
  const id = useId();
  const todayISO = useForkStore((s) => s.todayISO);
  const addDraft = useForkStore((s) => s.actions.addDraft);

  const [type, setType] = useState<EventType>("relocation");
  const [whenMode, setWhenMode] = useState<"months" | "date">("months");
  const [month, setMonth] = useState(0);
  const [monthTouched, setMonthTouched] = useState(false);
  const [fields, setFields] = useState<Fields>(EMPTY_FIELDS);

  // The calendar picker: this year and the next five, counted from the session's date, never from the clock.
  const baseYear = Number(todayISO.slice(0, 4));
  const years = useMemo(() => Array.from({ length: 6 }, (_, i) => baseYear + i), [baseYear]);
  const [pickMonth, setPickMonth] = useState<string>("");
  const [pickYear, setPickYear] = useState<string>("");
  const picked = whenMode === "date" && pickMonth && pickYear ? resolveMonthYear(pickMonth, Number(pickYear), todayISO) : null;
  const effectiveMonth = whenMode === "date" ? (picked?.ok ? picked.month : null) : month;

  const set = <K extends keyof Fields>(key: K, value: Fields[K]) => setFields((f) => ({ ...f, [key]: value }));

  const whenProblem =
    whenMode === "date" ? (!pickMonth || !pickYear ? "Pick a month and a year." : picked && !picked.ok ? picked.reason : null) : null;
  const built = whenProblem ? { ok: false as const, missing: whenProblem } : buildManualEvent(type, fields, effectiveMonth ?? 0);
  // Picking a month or moving the slider is the person choosing a time. Leaving it alone is not, and it says so.
  const chose = whenMode === "date" || monthTouched;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!built.ok) return;
    addDraft({
      type: built.event.type,
      month: built.event.month,
      payload: built.event.payload,
      source: "user",
      assumptions: chose ? [] : ["You didn't pick a time, so this starts now."],
      certainty: chose ? "clear" : "inferred",
    });
    setFields(EMPTY_FIELDS);
    setMonth(0);
    setMonthTouched(false);
    setPickMonth("");
    setPickYear("");
    onAdded?.();
  };

  return (
    <form data-testid="manual-event-form" onSubmit={handleSubmit} className={cn("space-y-4 text-left", className)}>
      <div className="flex items-baseline justify-between">
        <h4 className="text-sm font-medium text-ink">Add a change yourself</h4>
        <span className="text-xs text-ink/55">Works without AI</span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-type`} className="text-xs text-ink/60">
            What is changing
          </label>
          <select id={`${id}-type`} value={type} onChange={(e) => setType(e.target.value as EventType)} className={cn(inputClass, "cursor-pointer")}>
            {SUPPORTED_TYPES.map((t) => (
              <option key={t} value={t} className="bg-canvas text-ink">
                {EVENT_LABEL[t]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <label htmlFor={`${id}-when`} className="text-xs text-ink/60">
              When:{" "}
              <span className="tabular-nums text-ink">{whenMode === "date" ? (effectiveMonth === null ? "pick a date" : monthLabel(effectiveMonth)) : monthLabel(month)}</span>
            </label>
            <button
              type="button"
              onClick={() => setWhenMode((m) => (m === "months" ? "date" : "months"))}
              className="border-b border-ink/30 pb-px text-xs text-ink/70 transition-colors hover:border-ink hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {whenMode === "months" ? "Pick a month and year" : "Use a slider"}
            </button>
          </div>
          {whenMode === "months" ? (
            <input
              id={`${id}-when`}
              type="range"
              min={0}
              max={MONTH_MAX}
              value={month}
              onChange={(e) => {
                setMonth(Number(e.target.value));
                setMonthTouched(true);
              }}
              className="h-9 cursor-pointer accent-ink"
            />
          ) : (
            <div id={`${id}-when`} className="flex gap-2">
              <select aria-label="Month" value={pickMonth} onChange={(e) => setPickMonth(e.target.value)} className={cn(inputClass, "min-w-0 flex-1 cursor-pointer")}>
                <option value="" className="bg-canvas text-ink">
                  Month
                </option>
                {MONTH_NAMES.map((m) => (
                  <option key={m} value={m} className="bg-canvas text-ink">
                    {m}
                  </option>
                ))}
              </select>
              <select aria-label="Year" value={pickYear} onChange={(e) => setPickYear(e.target.value)} className={cn(inputClass, "w-24 cursor-pointer")}>
                <option value="" className="bg-canvas text-ink">
                  Year
                </option>
                {years.map((y) => (
                  <option key={y} value={y} className="bg-canvas text-ink">
                    {y}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-line pt-4">
        {type === "relocation" && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-city`} className="text-xs text-ink/60">
              Moving to
            </label>
            <input id={`${id}-city`} type="text" value={fields.city} onChange={(e) => set("city", e.target.value)} placeholder="City" className={cn(inputClass, "w-full sm:w-64")} />
          </div>
        )}

        {type === "mileage_change" && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-miles`} className="text-xs text-ink/60">
              Miles per year
            </label>
            <input
              id={`${id}-miles`}
              type="number"
              inputMode="numeric"
              min={0}
              step={500}
              value={fields.miles}
              onChange={(e) => set("miles", e.target.value)}
              placeholder="For example 15000"
              className={cn(inputClass, "w-48 tabular-nums")}
            />
          </div>
        )}

        {type === "family_change" && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-children`} className="text-xs text-ink/60">
              Children, in total
            </label>
            <input
              id={`${id}-children`}
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={fields.children}
              onChange={(e) => set("children", e.target.value)}
              placeholder="After this change"
              className={cn(inputClass, "w-48 tabular-nums")}
            />
          </div>
        )}

        {type === "cargo_change" && (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-xs text-ink/60">Cargo space you need</legend>
            <div className="flex gap-2">
              {(["low", "medium", "high"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={fields.cargo === c}
                  onClick={() => set("cargo", c)}
                  className={cn(
                    "h-9 rounded px-4 text-sm capitalize transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                    fields.cargo === c ? "bg-ink text-canvas" : "bg-ink/10 text-ink hover:bg-ink/20",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {type === "budget_change" && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-budget`} className="text-xs text-ink/60">
              Monthly budget, dollars
            </label>
            <input
              id={`${id}-budget`}
              type="number"
              inputMode="decimal"
              min={0}
              step={25}
              value={fields.budget}
              onChange={(e) => set("budget", e.target.value)}
              placeholder="For example 500"
              className={cn(inputClass, "w-48 tabular-nums")}
            />
          </div>
        )}

        {type === "fuel_price_change" && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-fuel`} className="text-xs text-ink/60">
              Fuel price, dollars per gallon
            </label>
            <input
              id={`${id}-fuel`}
              type="number"
              inputMode="decimal"
              min={0.5}
              step={0.05}
              value={fields.fuel}
              onChange={(e) => set("fuel", e.target.value)}
              placeholder="For example 4.25"
              className={cn(inputClass, "w-48 tabular-nums")}
            />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 pt-1">
        <p role="status" data-testid="manual-hint" className="text-xs text-ink/50">
          {built.ok ? "It will wait for your confirm before anything changes." : built.missing}
        </p>
        <button
          type="submit"
          disabled={!built.ok}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-medium text-canvas transition-colors hover:bg-ink/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="size-4" />
          <span>Add change</span>
        </button>
      </div>
    </form>
  );
}
