# Dev 4: simulation and decisions (`/sim`, `/decision`)

Every number and every verdict in Fork comes from here. It's all pure TypeScript: the same inputs always give the same outputs.

**Offline guarantee.** Nothing in `/sim` or `/decision` calls an LLM, the network, the clock, random numbers, storage or env vars. Neither folder imports `/data`, `/ai` or `/ui`. An automated test (`decision/__tests__/audit.test.ts`) scans the source and fails if any of that shows up. The full demo math runs with Gemini and NHTSA both down.

Accounting rules and replacement mechanics: [ECONOMICS.md](ECONOMICS.md). Defaults: [config.ts](config.ts) and [../decision/config.ts](../decision/config.ts), all labeled illustrative.

## How Dev 2 wires it

```ts
import { simulate, fork, makeReplaceScenario, editEvent, withParameter } from "@/sim";
import { evaluate, findBreakEven, sensitivity, withSensitivity, nextAction } from "@/decision";

const ctx = { vehicles: { [camry.id]: camry, [rav4.id]: rav4 }, specs: { [camry.id]: getSpecs(camry.id), [rav4.id]: getSpecs(rav4.id) } };
const denver = fork(baseline, 12, confirmedEvents, "Denver move");
const replace = makeReplaceScenario(denver, rav4);               // optional: editEvent to add payload.price / mileage
const scenarios = [denver, replace];
const results = scenarios.map(s => simulate(twin, s, ctx));
let e = evaluate({ twin, scenarios, results, priorities });       // e.nextAction already filled
const be = findBreakEven({ twin, keep: denver, replace, parameter: "annualMiles", ctx, priorities });
e = withSensitivity(e, sensitivity({ twin, scenarios, ctx, priorities }));
const action = nextAction(e, twin, be, results);                  // refresh the action with the threshold
e = { ...e, nextAction: { label: action.label, detail: action.detail } };
// then POST e and results to /api/explain
```

Each call takes a few milliseconds. A full pipeline (2 scenarios, both break-evens, sensitivity) runs in about 20 ms.

## `/sim` exports

| Export | Inputs | Output |
| --- | --- | --- |
| `simulate(twin, scenario, ctx)` | `VehicleTwin`, `Scenario`, `SimContext` (vehicles and specs by id) | `SimulationResult`: 60 points (months 1..60, end of month), milestones, warnings, summary |
| `simulateDetailed(twin, scenario, ctx)` | same | `{ result, assumptions: SimAssumption[], timeline: MonthState[] }`. Every input used, each with a `Source` label |
| `applyEvents(twin, scenario)` | twin, scenario | `{ timeline: MonthState[]; warnings }`. Only confirmed events apply; on a same-month conflict the later one wins, with a warning |
| `fork(parent, month, newEvents, name)` | scenario, month, events, name | New `Scenario`, id `parentId/month-slug`. Keeps parent events before the fork; never mutates the parent |
| `makeReplaceScenario(parent, vehicle, month?)` | scenario, `VehicleConfig`, month | New `Scenario` with a confirmed `vehicle_replacement`. Default month: first relocation or family change, else 12 |
| `moveEvent(s, id, month)`, `editEvent(s, id, patch)`, `deleteEvent(s, id)` | scenario, event id | New `Scenario`. Throw `InheritedEventError` on events a branch inherited |
| `canEditEvent(s, id)`, `isInherited(s, e)` | scenario, event | `boolean`. Use to disable controls |
| `affectedFromMonth(before, after)` | two scenarios | First month that can differ, or `null` |
| `purchaseTerms`, `taxAndFees`, `financedAmount`, `newLoanPayment` | assumptions, price | Replacement purchase math |
| `economicViews(result)` | `SimulationResult` | `{ cash, position, net }`, the three separate views |
| `fuelCost`, `loanPayment`, `impliedApr`, `amortizeStep`, `retainedFraction`, `mileageFactor`, `vehicleValue`, `dueBetween`, `occurrencesUpTo` | numbers | Building blocks, each unit tested |

**Event payload keys** (any event type; absolute unless named `*Delta`): `annualMiles`, `commuteMilesOneWay`, `commuteDaysPerWeek`, `householdSize`, `children`, `childrenDelta`, `carSeats`, `fuelPricePerGal`, `monthlyBudget`, `cargoNeed`, `location`. `vehicle_replacement` only: `vehicleId`, `price`, `mileage`. `children` and `childrenDelta` also move `householdSize` by the same amount unless the event states it; car seats are never inferred. Unknown keys and bad values are ignored, with a warning.

**Scenario assumption keys** (all optional): `insurancePerMonth`, `loanApr`, `startYear`, `replacementPrice`, `salesTaxRate`, `purchaseFees`, `downPayment`, `newLoanApr`, `newLoanTermMonths`. What-if keys used by break-even and sensitivity: `annualMilesOverride`, `fuelPricePerGalOverride`, `fuelPriceScale`, `depreciationScale`.

## `/decision` exports

| Export | Inputs | Output |
| --- | --- | --- |
| `assessSuitability(profile, vehicle, spec, month)` | `DriverProfile`, `VehicleConfig`, `SpecSheet`, month | `SuitabilityResult` with short keys. Already on every `ProjectionPoint` |
| `compareVehicles(current, other)` | two `SpecSheet`s | Keys like `more_cargo_and_higher_mpg` |
| `evaluate({ twin, scenarios, results, priorities, maxMonthlyBudget? })` | | `DecisionEvaluation`. `preferredScenarioId` is a scenario id or `"inconclusive"` |
| `evaluateDetailed(...)` | same | `{ evaluation, scores }`: metrics, normalized values, per-factor contributions and the total per scenario |
| `findBreakEven({ twin, keep, replace, parameter, ctx, priorities })` | `parameter`: `"annualMiles"` or `"fuelPricePerGal"` | `BreakEvenResult` (`found: false` when nothing flips within the bounds) |
| `breakEvenDetailed(input, criterion?)` | `"verdict"` (default) or `"netCost"` | Result plus today's verdict, the target and the iteration count |
| `reproduceBreakEven(input, be)` | | Verdicts and net costs just below and just above the threshold, or `null` |
| `withParameter(scenario, parameter, value)` | | Scenario with the value held for all 60 months (the same what-if break-even uses) |
| `sensitivity({ twin, scenarios, ctx, priorities })` | | `SensitivityResult`: low/base/high runs and "held in X of 9" |
| `withSensitivity(evaluation, s)`, `robustnessLine(s)` | | Evaluation with `sensitivity` filled and the robustness line added |
| `nextAction(evaluation, twin, be?, results?)` | Pass `results`: rules 2 to 4 need them | `NextAction` with `factors`. First match wins: current car breaks a hard constraint, keep, replace with unknown finance, replace, inconclusive |
| `metricsOf(result)`, `keepsCurrentCar(result, id)` | | Scoring inputs |

## Decision rules

1. Hard constraints first: too few seats for the household, more car seats than rear positions, or a recurring monthly cost over a stated budget. A violating scenario can't be preferred.
2. Metrics: net cost and fuel (lower is better), longevity `1 - min(odometer at month 60 / 250,000, 1)`, family (the worse of passenger and cargo fit, scored good 1, tight 0.6, needs verification 0.5, insufficient 0, averaged over 60 months), and comfort (`comfortScore`, or 0.5).
3. Normalize: min-max across the compared scenarios, with a floor on the spread ($3,000 for net cost and fuel, 0.25 for longevity, 0.5 for family, 0.25 for comfort). When the spread is at least the floor, it's exactly min-max. Below the floor, scores shrink toward 0.5, so a tiny gap can't swing a whole weight. All equal gives 0.5 each.
4. Score: weighted sum with the user's priorities, returned per factor. If the top two are within 0.05, the verdict is `inconclusive`.
5. Break-even: one parameter, bisection between 5,000 and 40,000 mi/yr or $2 and $8/gal, stopping at 0.5% of the range or after 40 steps. If today's verdict is keep, it finds where replacing would win; otherwise where keeping would.
6. Robustness: every combination of depreciation x0.8/1/1.2 and fuel x0.8/1/1.2, reported as "held in X of 9 tested cases". Never a probability.

## Disclose in the pitch as illustrative

- Depreciation curves and the mileage adjustment (Dev 3 spec sheets, labeled illustrative), and the 12,000 mi/yr mileage baseline.
- Maintenance schedule and costs (spec sheets, illustrative). They aren't Toyota guidance or quotes.
- Insurance $130/month when the user didn't enter one.
- Replacement purchase: 6.25% sales tax, $450 fees, 10% down, 6.5% APR, 60 months. Without a listing price, the price is the modeled market value (labeled `estimated`).
- The existing loan's APR is worked out from balance, payment and term (labeled `estimated`).
- A trade-in is valued at modeled market value. Real trade-in offers are usually lower.
- Vehicle age assumes month 0 is 2026.
- Suitability thresholds: cargo need of 12, 18 and 30 cu ft, the tight cutoff at 80%, and rear positions = seats - 2. Car seat and packing fit are never verified, so those come back "needs verification".
- Scoring floors, the 0.05 inconclusive margin, the break-even bounds and the sensitivity steps are judgment calls, not market data.
- All driver and finance data for Alex is synthetic (Dev 3).

## Tests

`npx vitest run sim decision`. Covered: worked examples ($1,285.71 of fuel, $386.66 payment, fee-only purchase), replacement hand calculations, branching immutability, suitability, scoring, a hand-computed break-even, robustness, next-action rules, and the S9 audit (black-box scenarios, 100 identical reruns, import and purity scans, dollar provenance).
