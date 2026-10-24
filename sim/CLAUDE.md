# Developer 4: Simulation and Decisions (`/sim`, `/decision`)

Read the root `CLAUDE.md` and `/contracts/INTERFACES.md` first. Copy this file to `/sim/CLAUDE.md` and `/decision/CLAUDE.md`.

## Mission

Own every number and every verdict. All of it is pure TypeScript: identical inputs always give identical outputs. Nothing in your folders calls an LLM or the network.

## You own / you do not own

| You own | You do not own |
| --- | --- |
| `/sim`, `/decision` | Specs, registry, defaults, normalizer (Dev 3) |
| Monthly projection, replacement economics, events, branching | Gemini, extraction, explanation prose (Dev 3) |
| Suitability, evaluation, break-even, sensitivity, next action | Any UI (Dev 2) |

You co-write `/contracts` with Dev 3 in hour 1. Never import from `/data` or `/ai`. Dev 2 passes `VehicleConfig`, `DriverProfile`, and `SpecSheet` in as arguments.

## File map

```text
/sim/config.ts (HORIZON_MONTHS = 60, default rates and fees, all illustrative)
/sim/state.ts, mileage.ts, fuel.ts, maintenance.ts, depreciation.ts, insurance.ts, financing.ts
/sim/events.ts, simulate.ts, replacement.ts, branch.ts, makeReplace.ts, ECONOMICS.md, __tests__/
/decision/config.ts (INCONCLUSIVE_MARGIN = 0.05, fit thresholds, tested bounds)
/decision/suitability.ts, evaluate.ts, breakEven.ts, sensitivity.ts, nextAction.ts, __tests__/
```

## Exports

Exact signatures are in `/contracts/INTERFACES.md`: `simulate`, `applyEvents`, `fork`, `moveEvent`, `editEvent`, `deleteEvent`, `makeReplaceScenario`, `assessSuitability`, `evaluate`, `findBreakEven`, `sensitivity`, `nextAction`.

## The accounting identity (put it in `ECONOMICS.md` and in a code comment)

```
netEconomicCost_t = cumulativeCash_t + (loanBalance_t - loanBalance_0) - (vehicleValue_t - vehicleValue_0)
```

`cumulativeCash` includes every dollar paid out (fuel, maintenance, insurance, loan payments, down payment, tax and fees) minus sale or trade-in proceeds. `vehicleValue` and `loanBalance` describe whichever car the person owns at month t. Principal is cash out and also lowers the balance, so it nets to zero; interest, fees, and depreciation are the real costs. Output three separate views: cumulative cash, remaining assets and liabilities, net economic cost. Never merge them.

## Worked examples (use as tests)

| Case | Inputs | Expected |
| --- | --- | --- |
| Fuel, one year | 12,000 mi, 28 mpg, $3.00/gal | 12000 / 28 x 3.00 = $1,285.71 |
| Loan payment | $20,000, 6% APR, 60 months | $386.66 per month |
| Fee-only purchase | Price P, fees F, down payment D, rest financed | Cost of the purchase itself = F |
| Paid-off keep | No loan | Loan terms zero everywhere |

## Rules

1. Pure functions, immutable data, no `Date.now`, no randomness, no I/O.
2. Only `confirmed` events take effect. `proposed` and `invalid` are ignored.
3. Events sort by month with a stable order inside a month. Payloads apply from their month forward. Same variable, same month: later in the list wins and a warning is logged.
4. `fork` copies parent state through the fork month and never mutates parent or siblings. A change after the fork cannot rewrite inherited history. Support 4 or more branches.
5. `moveEvent`, `editEvent`, `deleteEvent` return new scenarios and recompute only affected months. Earlier points stay byte-identical.
6. Hard constraints first: insufficient seats for household size, or a monthly cost over a stated cap. A violating scenario cannot be preferred.
7. Metrics: net cost (lower), fuel spend (lower), longevity = 1 - min(odometer at month 60 / 250,000, 1) (higher), family = fit mapped good 1, tight 0.6, needs verification 0.5, insufficient 0 (higher), comfort = `comfortScore` or 0.5 when no data. Min-max normalize across compared scenarios (all equal gives 0.5). Weighted sum with the user's visible weights. Return per-factor contributions. If the top two differ by less than `INCONCLUSIVE_MARGIN` the verdict is `inconclusive`.
8. No upsell bias. A test must show keep winning when needs are met and costs are close. Never assume more kids means an SUV.
9. Break-even: bisection on one parameter between tested bounds (annual miles 5,000 to 40,000, fuel price $2 to $8), 40 iterations or 0.5% of the range. It searches for where `evaluate` changes its preferred scenario. If it never changes in the bounds return `found: false`. Provide a reproduction helper that reruns both scenarios just below and above the threshold.
10. Sensitivity: low, base, high for depreciation and fuel price. Report "held in X of Y tested cases." Never a probability or confidence percent.
11. Next action, first match wins: (1) current car violates a hard constraint, "Investigate a RAV4 Hybrid" citing it; (2) verdict keep, "Keep your car and review the milestone at X miles" with X from the simulation; (3) verdict replace and finance unknown, "Get a payoff or trade-in quote"; (4) verdict replace, "Investigate a RAV4 Hybrid" citing factors; (5) inconclusive, "Reevaluate at X miles or date Y" using the break-even threshold if one exists. Links only from verified data. Never imply a booking or approval happened.

## Tasks

- **S0 (hour 0 to 2).** Contracts with Dev 3, then publish mocks in `/contracts/mocks`: `mockSimulationResult` (baseline plus two branches), `mockEvaluation`, `mockBreakEven`, `mockSensitivity`.
- **S1 (2 to 6).** `simulate`: mileage, fuel, maintenance, depreciation, insurance, financing. Real `simulate` at hour 5.
- **S2 + S3 (6 to 9).** Replacement economics, `applyEvents`, `fork`, `moveEvent`, `editEvent`, `deleteEvent`, `makeReplaceScenario`. Gate 1 at hour 8.
- **S4 + S5 (9 to 12).** `assessSuitability`, `evaluate`. Real at hour 11.
- **S6 (12 to 15).** `findBreakEven`, `sensitivity`. Break-even at hour 14.
- **S7 (13 to 15).** `nextAction`. Real at hour 15.
- **S9 (18 to 21).** Full test and determinism pass (100 reruns identical).

## Definition of done

- [ ] 100 reruns of the same input are identical.
- [ ] 12,000 to 20,000 annual miles changes fuel spend and moves service dates earlier.
- [ ] Moving an event leaves earlier months byte-identical. Forking twice leaves parent and sibling deeply equal.
- [ ] Unconfirmed events change nothing.
- [ ] Raising the RAV4 price raises cumulative cash by the price delta plus tax and fees delta, and net cost by that amount minus the change in the car's modeled value at the horizon.
- [ ] Camry wins when needs are met; raising miles and fuel price flips to RAV4; changing priority from cost to family flips the verdict in a family-growth case.
- [ ] Inconclusive, no-threshold, and keep-wins tests exist.

## Cut line (cut in this order)

Robustness count, `moveEvent`, insurance modeling, `editEvent`. Never cut `simulate`, replacement economics, `fork`, `evaluate`, or one working break-even.

## Session hygiene

One task per Claude session. End each session by printing: files created, exported signatures, and the test command.
