"use client";

import { Check } from "lucide-react";
import type { TradeoffPick } from "@/contracts";
import { cn } from "@/lib/utils";
import { useForkStore } from "@/ui/store/useForkStore";

export interface TradeoffCardsProps {
  className?: string;
}

interface TradeoffDef {
  pairId: TradeoffPick["pairId"];
  title: string;
  optionA: { label: string; detail: string };
  optionB: { label: string; detail: string };
}

const TRADEOFF_DEFS: TradeoffDef[] = [
  {
    pairId: "cost_vs_cargo",
    title: "Cost vs. Cargo Space",
    optionA: { label: "Minimize cost", detail: "Prioritize lower monthly total ownership cost" },
    optionB: { label: "Max cargo", detail: "Prioritize cargo volume for gear and family" },
  },
  {
    pairId: "longevity_vs_fuel",
    title: "Durability vs. Efficiency",
    optionA: { label: "Long-term lifespan", detail: "Keep vehicle for 8+ years with proven durability" },
    optionB: { label: "High MPG", detail: "Maximize gas mileage and lower pump visits" },
  },
  {
    pairId: "comfort_vs_cost",
    title: "Comfort vs. Budget",
    optionA: { label: "Cabin comfort", detail: "Smoother ride, quiet cabin, and modern amenities" },
    optionB: { label: "Strict budget", detail: "Keep financial outlay as low as possible" },
  },
];

export function TradeoffCards({ className }: TradeoffCardsProps) {
  const tradeoffPicks = useForkStore((s) => s.tradeoffPicks);
  const pickTradeoff = useForkStore((s) => s.actions.pickTradeoff);

  const getChoice = (pairId: TradeoffPick["pairId"]) => {
    return tradeoffPicks.find((p) => p.pairId === pairId)?.choice;
  };

  return (
    <div data-testid="tradeoff-cards" className={cn("space-y-3 text-left", className)}>
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-medium tracking-wide uppercase text-ink/60">
            Priority Trade-offs
          </h4>
          <p className="text-xs text-ink/55">
            A vs. B picks calibrate your recommendation weights without subjective sliders.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {TRADEOFF_DEFS.map((def) => {
          const currentChoice = getChoice(def.pairId);

          return (
            <div
              key={def.pairId}
              className="flex flex-col justify-between rounded-lg border border-line bg-ink/[0.02] p-3 text-xs"
            >
              <span className="font-medium text-ink">{def.title}</span>

              <div className="mt-2.5 flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => pickTradeoff({ pairId: def.pairId, choice: "A" })}
                  className={cn(
                    "flex flex-col rounded p-2 text-left transition-colors cursor-pointer",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                    currentChoice === "A"
                      ? "bg-ink text-canvas font-medium"
                      : "bg-ink/5 text-ink hover:bg-ink/10",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span>{def.optionA.label}</span>
                    {currentChoice === "A" && <Check className="size-3" />}
                  </div>
                  <span className={cn("text-xs", currentChoice === "A" ? "text-canvas/70" : "text-ink/55")}>
                    {def.optionA.detail}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => pickTradeoff({ pairId: def.pairId, choice: "B" })}
                  className={cn(
                    "flex flex-col rounded p-2 text-left transition-colors cursor-pointer",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                    currentChoice === "B"
                      ? "bg-ink text-canvas font-medium"
                      : "bg-ink/5 text-ink hover:bg-ink/10",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span>{def.optionB.label}</span>
                    {currentChoice === "B" && <Check className="size-3" />}
                  </div>
                  <span className={cn("text-xs", currentChoice === "B" ? "text-canvas/70" : "text-ink/55")}>
                    {def.optionB.detail}
                  </span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
