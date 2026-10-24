# Dev 4: Anirudh, simulation and decisions

Branch: `dev4-sim`
You own: `/sim`, `/decision`. You co-write `/contracts` with Paarth.
Do not touch or import from: `/data`, `/ai` (Paarth), `/ui` (Ishaan, Kareem). Ishaan passes `VehicleConfig`, `DriverProfile` and `SpecSheet` into your functions as arguments.

## Do this first

1. Sync: `git fetch origin && git checkout dev4-sim && git merge origin/main && npm ci`
2. Run the kickoff prompt `D4-00` from `docs/prompts/dev4-sim.md`. It only confirms you understand the job. No code yet.
3. While Paarth writes the contract skeleton, draft `/sim/ECONOMICS.md` in your own folder. It holds the accounting identity: `netEconomicCost_t = cumulativeCash_t + (loanBalance_t - loanBalance_0) - (vehicleValue_t - vehicleValue_0)`.
4. When Paarth pushes `/contracts/index.ts` and the schemas (his `D3-C0`), run `git fetch origin && git merge origin/dev3-data-ai`. Then run `D4-S0`: add only your own types (Fit, SuitabilityResult, SimContext, MonthState, BreakEvenResult, SensitivityResult, NextAction) and their Zod schemas at the bottom of those files, so the two of you do not conflict. Then publish your mocks in `/contracts/mocks`: `mockSimulationResult`, `mockEvaluation`, `mockBreakEven`, `mockSensitivity`.
5. Then `D4-S1`, the simulation core.

## What you owe

| When | To | What |
| --- | --- | --- |
| Hour 1 | Everyone | Frozen contracts, co-written with Paarth |
| Hour 2 | Ishaan | Sim mocks |
| Hour 5 | Ishaan | Real `simulate` |
| Hour 8 | Ishaan | Real `applyEvents` and `fork` (Gate 1) |
| Hour 11 | Ishaan | Real `assessSuitability` and `evaluate` |
| Hour 14 | Ishaan | Real `findBreakEven` and `sensitivity` |
| Hour 15 | Ishaan | Real `nextAction` |

## What you are waiting on

Paarth's contract skeleton (hour 1), then his real `SpecSheet`s (hour 6). Until then, build against the mocks.

## Rules that are easy to get wrong

- Pure functions, immutable data. No `Date.now`, no randomness, no I/O, no LLM, no network.
- Only `confirmed` events take effect.
- Keep three separate outputs: cumulative cash, remaining assets and liabilities, net economic cost. Never merge them.
- No upsell bias. `evaluate` must be able to return keep or inconclusive, and a test must show keep winning when needs are met and costs are close.
- Break-even is bisection between tested bounds. If the preferred scenario never changes, return `found: false`.
- Report robustness as "held in X of Y tested cases." Never a probability or a percentage.

## Cut line

Cut in this order: robustness count, `moveEvent`, insurance modeling, `editEvent`. Never cut `simulate`, replacement economics, `fork`, `evaluate`, or one working break-even.

## Every session

End by printing files created, exported signatures, and the test command. When you finish a stretch, fill your row in `docs/HANDOFF.md`.
