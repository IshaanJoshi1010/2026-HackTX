"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { EventType } from "@/contracts";
import { cn } from "@/lib/utils";
import { monthLabel } from "@/ui/profile/format";
import { EVENT_LABEL } from "@/ui/store/eventLabels";
import { useForkStore } from "@/ui/store/useForkStore";

export interface ManualEventFormProps {
  className?: string;
  onAdded?: () => void;
}

const SUPPORTED_TYPES: EventType[] = [
  "relocation",
  "mileage_change",
  "family_change",
  "cargo_change",
  "fuel_price_change",
];

export function ManualEventForm({ className, onAdded }: ManualEventFormProps) {
  const [type, setType] = useState<EventType>("relocation");
  const [month, setMonth] = useState<number>(12);
  const [city, setCity] = useState("Denver");
  const [annualMiles, setAnnualMiles] = useState(20000);
  const [children, setChildren] = useState(1);
  const [cargoNeed, setCargoNeed] = useState<"low" | "medium" | "high">("medium");
  const [fuelPrice, setFuelPrice] = useState(4.0);

  const addDraft = useForkStore((s) => s.actions.addDraft);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let payload: Record<string, string | number> = {};
    if (type === "relocation") {
      payload = { city, annualMiles };
    } else if (type === "mileage_change") {
      payload = { annualMiles };
    } else if (type === "family_change") {
      payload = { children, householdSize: children + 2 };
    } else if (type === "cargo_change") {
      payload = { cargoNeed };
    } else if (type === "fuel_price_change") {
      payload = { fuelPricePerGal: fuelPrice };
    }

    addDraft({
      type,
      month,
      payload,
      source: "user",
      assumptions: [],
      certainty: "clear",
    });

    onAdded?.();
  };

  return (
    <form
      data-testid="manual-event-form"
      onSubmit={handleSubmit}
      className={cn(
        "rounded-xl border border-line bg-canvas/90 p-4 text-left shadow-lg backdrop-blur-md space-y-3",
        className,
      )}
    >
      <div className="flex items-center justify-between pb-2 border-b border-line">
        <h4 className="text-xs font-medium uppercase tracking-wide text-ink/70">
          Add Life Event Manually
        </h4>
        <span className="text-[11px] text-ink/40">Offline Mode</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Event Type */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase text-ink/50">Event Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as EventType)}
            className="h-9 rounded border border-line bg-ink/5 px-2.5 text-xs text-ink focus:border-ink focus:outline-none cursor-pointer"
          >
            {SUPPORTED_TYPES.map((t) => (
              <option key={t} value={t} className="bg-canvas text-ink">
                {EVENT_LABEL[t]}
              </option>
            ))}
          </select>
        </div>

        {/* Month offset */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase text-ink/50">
            Timing: Month {month} ({monthLabel(month)})
          </label>
          <input
            type="range"
            min={1}
            max={60}
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="accent-ink h-9 cursor-pointer"
          />
        </div>
      </div>

      {/* Dynamic Type-specific fields */}
      <div className="pt-2 border-t border-line/60">
        {type === "relocation" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-ink/50">Destination City</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Denver"
                className="h-8 rounded border border-line bg-ink/5 px-2.5 text-xs text-ink focus:border-ink focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-ink/50">Annual Miles</label>
              <input
                type="number"
                step={1000}
                value={annualMiles}
                onChange={(e) => setAnnualMiles(Number(e.target.value))}
                className="h-8 rounded border border-line bg-ink/5 px-2.5 text-xs tabular-nums text-ink focus:border-ink focus:outline-none"
              />
            </div>
          </div>
        )}

        {type === "mileage_change" && (
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-ink/50">New Annual Miles</label>
            <input
              type="number"
              step={1000}
              value={annualMiles}
              onChange={(e) => setAnnualMiles(Number(e.target.value))}
              className="h-8 w-44 rounded border border-line bg-ink/5 px-2.5 text-xs tabular-nums text-ink focus:border-ink focus:outline-none"
            />
          </div>
        )}

        {type === "family_change" && (
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-ink/50">Children Count</label>
            <input
              type="number"
              min={0}
              max={6}
              value={children}
              onChange={(e) => setChildren(Number(e.target.value))}
              className="h-8 w-32 rounded border border-line bg-ink/5 px-2.5 text-xs tabular-nums text-ink focus:border-ink focus:outline-none"
            />
          </div>
        )}

        {type === "cargo_change" && (
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-ink/50">Cargo Requirement</label>
            <select
              value={cargoNeed}
              onChange={(e) => setCargoNeed(e.target.value as "low" | "medium" | "high")}
              className="h-8 w-36 rounded border border-line bg-ink/5 px-2 text-xs text-ink focus:border-ink focus:outline-none cursor-pointer"
            >
              <option value="low" className="bg-canvas">Low</option>
              <option value="medium" className="bg-canvas">Medium</option>
              <option value="high" className="bg-canvas">High</option>
            </select>
          </div>
        )}

        {type === "fuel_price_change" && (
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-ink/50">Fuel Price ($/gal)</label>
            <input
              type="number"
              step={0.1}
              value={fuelPrice}
              onChange={(e) => setFuelPrice(Number(e.target.value))}
              className="h-8 w-32 rounded border border-line bg-ink/5 px-2.5 text-xs tabular-nums text-ink focus:border-ink focus:outline-none"
            />
          </div>
        )}
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          className="flex h-8 items-center gap-1.5 rounded bg-ink px-3 text-xs font-medium text-canvas hover:bg-ink/85 transition-colors cursor-pointer"
        >
          <Plus className="size-3.5" />
          <span>Stage Proposal</span>
        </button>
      </div>
    </form>
  );
}
