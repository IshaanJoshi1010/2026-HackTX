# Demo story A: the numbers behind steps 3 to 6

Team decision: after the Denver brain dump, keep vs replace is a close call. The app says so honestly, shows exactly what would make keeping win, and gives a concrete next step. Pinned by `decision/__tests__/demoStory.test.ts`. If that test fails, the demo story changed.

## Inputs that must hold

| Input | Value | Owner |
| --- | --- | --- |
| Car | 2022 Camry SE, 48,000 mi, sample VIN | Dev 3 registry |
| Alex | cargoNeed **low**, carSeats **0**, priorities **0.2 each** (no trade-off picks in the demo) | Dev 3 demo preset |
| Brain dump events | relocation month 12 (Denver), annualMiles 20,000 from month 0, children 2 at month 32 | Dev 3 extraction, confirmed in the UI |
| Replacement | `makeReplaceScenario(keep, rav4)`, default price (modeled market value), month 12 | Dev 4 |

Cargo need is the fragile part. If it ends up "medium" (for example, from a household-size default), the verdict flips to a clear RAV4 win and story A no longer holds.

## What each step shows

| Step | Call | What appears |
| --- | --- | --- |
| 3. Dump, confirm, timeline splits | `fork(baseline, 0, confirmedEvents, "Denver move")`, `simulate` | Branch with 20,000 mi/yr, the Denver move at month 12, a second child at month 32 |
| 4. "Would switching to a RAV4 Hybrid make more sense?" | `makeReplaceScenario`, `simulate` x2, `evaluate` | **Close call**, 0.50 vs 0.50. Keeping costs less (net about $31.3k vs $35.9k over 5 years); the RAV4 spends about $1.4k less on fuel and has more miles left at the end |
| 5. "What would have to change for keeping the Camry to be the better option?" | `findBreakEven({ ..., parameter: "annualMiles" })`, `reproduceBreakEven` | **Keeping wins below about 14,400 mi/yr** (Alex drives 20,000). Just below: keep. Just above: no clear winner. Fuel price: nothing between $2 and $8 changes it |
| 6. Recommendation and next step | `withSensitivity(e, sensitivity(...))`, `nextAction(e, twin, be, results)` | **"Reevaluate if your driving drops below 14,434 mi/yr"**, held in 9 of 9 tested cases |

## Talking points

- "Fork didn't push the new car. It's a close call, so it says so."
- "Every number came from deterministic code. The AI only turned my sentence into events and explains the result."
- "The break-even is a real search: below 14,400 miles a year, keeping the Camry wins, and you can check it by typing the number in."
- "Held in 9 of 9 tested cases" means the close-call verdict survived every depreciation and fuel price combination we tested. It's a count, not a probability.

## If someone asks

- **Why not a winner?** The RAV4 saves fuel and has more life left, but costs more to own over 5 years. On balanced priorities those cancel out within the 0.05 margin.
- **Would a family change it?** Only if the family needs more cargo space or car seats, and the user has to say so. Fork never assumes kids mean an SUV.
- **Are these prices real?** No. They're illustrative and synthetic (see the README's disclosure list).
