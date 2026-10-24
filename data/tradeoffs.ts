import type { DriverProfile, TradeoffPick } from "../contracts";
import { TradeoffPickSchema } from "../contracts/schemas";

const keys = ["cost", "family", "longevity", "fuel", "comfort"] as const;
const pairs = {
  cost_vs_cargo: ["cost", "family"], // Cargo maps to family fit; the frozen priorities type has no cargo key.
  longevity_vs_fuel: ["longevity", "fuel"], comfort_vs_cost: ["comfort", "cost"],
} as const;
export function mapTradeoffs(picks: TradeoffPick[]): DriverProfile["priorities"] {
  const checked = picks.map(pick => TradeoffPickSchema.parse(pick));
  if (new Set(checked.map(pick => pick.pairId)).size !== checked.length) throw new Error("Choose each tradeoff pair at most once");
  let weights: DriverProfile["priorities"] = { cost: 0.2, family: 0.2, longevity: 0.2, fuel: 0.2, comfort: 0.2 };
  // Canonical order gives the same result for the same selections in any UI order.
  for (const pairId of Object.keys(pairs) as (keyof typeof pairs)[]) {
    const pick = checked.find(p => p.pairId === pairId);
    if (!pick) continue;
    const pair = pairs[pairId], winner = pair[pick.choice === "A" ? 0 : 1], loser = pair[pick.choice === "A" ? 1 : 0];
    weights[winner] += 0.1;
    weights[loser] = Math.max(0.05, weights[loser] - 0.1);
    const total = keys.reduce((sum, key) => sum + weights[key], 0);
    const cents = Object.fromEntries(keys.map(key => [key, Math.round(weights[key] / total * 100)])) as Record<typeof keys[number], number>;
    const largest = keys.reduce((best, key) => weights[key] > weights[best] ? key : best, keys[0]);
    cents[largest] += 100 - keys.reduce((sum, key) => sum + cents[key], 0);
    weights = Object.fromEntries(keys.map(key => [key, cents[key] / 100])) as DriverProfile["priorities"];
  }
  return weights;
}
