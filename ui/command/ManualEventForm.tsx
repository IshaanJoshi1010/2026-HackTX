"use client";

import { useId, useState } from "react";
import { Plus } from "lucide-react";
import type { EventType, LifeEvent } from "@/contracts";
import { cn } from "@/lib/utils";
import { monthLabel } from "@/ui/profile/format";
import { EVENT_LABEL } from "@/ui/store/eventLabels";
import { useForkStore } from "@/ui/store/useForkStore";

export interface ManualEventFormProps {
  className?: string;
  onAdded?: () => void;
}

const SUPPORTED_TYPES: EventType[] = ["relocation", "mileage_change", "family_change", "cargo_change", "fuel_price_change"];

type Cargo = "low" | "medium" | "high";

interface Fields {
  city: string;
  miles: string;
  children: string;
  cargo: Cargo | null;
  fuel: string;
}

const EMPTY: Fields = { city: "", miles: "", children: "", cargo: null, fuel: "" };

/**
 * What the person typed, as a payload the simulation reads, or what is still missing.
 * Nothing is filled in for them: an empty field is not a value. A change to a family states the
 * number of children the person gave and nothing else (no household size is worked out for them).
 */
export function payloadFor(
  type: EventType,
  f: Fields,
): { ok: true; payload: LifeEvent["payload"] } | { ok: false; missing: string } {
  switch (type) {
    case "relocation": {
      const location = f.city.trim();
      return location ? { ok: true, payload: { location } } : { ok: false, missing: "Enter a city." };
    }
    case "mileage_change": {
      const n = Number(f.miles);
      return f.miles.trim() !== "" && Number.isFinite(n) && n >= 1000 && n <= 200000
        ? { ok: true, payload: { annualMiles: Math.round(n) } }
        : { ok: false, missing: "Enter yearly miles, 1,000 or more." };
    }
    case "family_change": {
      const n = Number(f.children);
      return f.children.trim() !== "" && Number.isInteger(n) && n >= 1 && n <= 8
        ? { ok: true, payload: { children: n } }
        : { ok: false, missing: "Enter how many children you will have, from 1 to 8." };
    }
    case "cargo_change":
      return f.cargo ? { ok: true, payload: { cargoNeed: f.cargo } } : { ok: false, missing: "Pick how much cargo space you need." };
    case "fuel_price_change": {
      const n = Number(f.fuel);
      return f.fuel.trim() !== "" && Number.isFinite(n) && n >= 0.5 && n <= 20
        ? { ok: true, payload: { fuelPricePerGal: n } }
        : { ok: false, missing: "Enter a fuel price in dollars per gallon." };
    }
    default:
      return { ok: false, missing: "That kind of change is not supported here." };
  }
}

const inputClass =
  "h-9 rounded border border-line bg-ink/5 px-2.5 text-sm text-ink placeholder:text-ink/30 focus:border-ink focus:outline-none";

/** The way in when you would rather type a change as a form. Works with no AI and no network. */
export function ManualEventForm({ className, onAdded }: ManualEventFormProps) {
  const id = useId();
  const [type, setType] = useState<EventType>("relocation");
  const [month, setMonth] = useState(0);
  const [monthTouched, setMonthTouched] = useState(false);
  const [fields, setFields] = useState<Fields>(EMPTY);
  const addDraft = useForkStore((s) => s.actions.addDraft);

  const set = <K extends keyof Fields>(key: K, value: Fields[K]) => setFields((f) => ({ ...f, [key]: value }));
  const built = payloadFor(type, fields);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!built.ok) return;
    addDraft({
      type,
      month,
      payload: built.payload,
      source: "user",
      // Moving the slider is the person choosing a time. Leaving it alone is not, and it says so.
      assumptions: monthTouched ? [] : ["You didn't pick a time, so this starts now."],
      certainty: monthTouched ? "clear" : "inferred",
    });
    setFields(EMPTY);
    setMonth(0);
    setMonthTouched(false);
    onAdded?.();
  };

  return (
    <form data-testid="manual-event-form" onSubmit={handleSubmit} className={cn("space-y-4 text-left", className)}>
      <div className="flex items-baseline justify-between">
        <h4 className="text-sm font-medium text-ink">Add a change yourself</h4>
        <span className="text-xs text-ink/40">Works without AI</span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-type`} className="text-xs text-ink/60">
            What is changing
          </label>
          <select
            id={`${id}-type`}
            value={type}
            onChange={(e) => setType(e.target.value as EventType)}
            className={cn(inputClass, "cursor-pointer")}
          >
            {SUPPORTED_TYPES.map((t) => (
              <option key={t} value={t} className="bg-canvas text-ink">
                {EVENT_LABEL[t]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-when`} className="text-xs text-ink/60">
            When: <span className="tabular-nums text-ink">{monthLabel(month)}</span>
          </label>
          <input
            id={`${id}-when`}
            type="range"
            min={0}
            max={60}
            value={month}
            onChange={(e) => {
              setMonth(Number(e.target.value));
              setMonthTouched(true);
            }}
            className="h-9 cursor-pointer accent-ink"
          />
        </div>
      </div>

      <div className="border-t border-line pt-4">
        {type === "relocation" && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-city`} className="text-xs text-ink/60">
              Moving to
            </label>
            <input
              id={`${id}-city`}
              type="text"
              value={fields.city}
              onChange={(e) => set("city", e.target.value)}
              placeholder="City"
              className={cn(inputClass, "w-full sm:w-64")}
            />
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
              min={1000}
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
              min={1}
              max={8}
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
