# Developer 4 Prompt Pack (Simulation and Decisions)

How to use: one fresh Claude session per prompt. The root `CLAUDE.md`, `/contracts/INTERFACES.md`, and `/sim/CLAUDE.md` (also copied to `/decision`) should already be in the repo. Paste ONE prompt at a time. When a prompt says "paste summary," paste the end-of-session summary from the session it depends on.

Every prompt ends the same way: Claude prints files created, exported signatures, and the test command.

Signatures are frozen in `/contracts/INTERFACES.md`. You never import from `/data` or `/ai`: Developer 2 passes `VehicleConfig`, `DriverProfile`, and `SpecSheet` in as arguments.

---

## D4-00 Kickoff (run once)

```
You are helping Developer 4 on Fork, a HackTX 2026 project. Read CLAUDE.md at the repo root, /contracts/INTERFACES.md, and /sim/CLAUDE.md fully.

Confirm back in 10 lines or fewer:
1. The folders I own (/sim, /decision) and the ones I must not touch or import from (/data, /ai, /ui).
2. The accounting identity and why it prevents double counting.
3. The scoring and verdict rules, including the inconclusive margin.
4. My task order (S0 to S9), the hours I owe Developer 2, and the cut line.

Then wait. Do not write code yet.
```

---

## D4-S0 Contracts and mocks (hour 0 to 2)

```
Task: help finish the frozen contracts with Developer 3, then publish the simulation mocks.

Context: read /contracts/INTERFACES.md. All types and signatures there are frozen. If something looks wrong, tell me and stop.

Build:
1. In /contracts/index.ts add the Dev 4 types from INTERFACES.md (Fit, SuitabilityResult, SimContext, MonthState, BreakEvenResult, SensitivityResult, NextAction) with Zod schemas in /contracts/schemas.ts.
2. In /contracts/mocks publish:
   - mockSimulationResult: a baseline scenario plus two branches ("Denver move" and "Replace with RAV4 Hybrid"), 60 monthly points each, with believable monotonic mileage, fuel, maintenance steps at milestones, depreciation, and netEconomicCost. Mark everything illustrative.
   - mockEvaluation: a DecisionEvaluation with preferredScenarioId, rationale lines, sensitivity runs, and a nextAction.
   - mockBreakEven: both a found result and a not-found result.
   - mockSensitivity.
3. Vitest tests: every mock passes its Zod schema.

Acceptance: Developer 2 can render a timeline and a comparison from the mocks alone.
End with the summary.
```

---

## D4-S1 Simulation core (hour 2 to 6, real simulate at hour 5)

```
Task: build the deterministic ownership simulation core.

Context: read CLAUDE.md. Contract types are in /contracts. Use fixtures from /data/fixtures until Developer 3 ships real specs. I own /sim. Paste the P2-D3 summary if available (maintenance milestones, depreciation assumptions).

Build pure functions only (no I/O, no randomness, no Date.now):
1. simulate(twin, scenario): SimulationResult over a 60-month horizon.
2. Mileage: project odometer from annualMiles, with commute changes applied from their event month.
3. Fuel: monthlyMiles / mpg * fuelPricePerGal.
4. Maintenance: apply the maintenance milestones when the odometer crosses each interval. Costs are labeled "illustrative".
5. Depreciation: configurable curve by age and mileage for vehicleValue.
6. Insurance: user-entered or illustrative, labeled.
7. Financing: payment schedule, interest, and remaining loanBalance for loan or lease.
8. Each ProjectionPoint includes cumulativeCash and netEconomicCost. Put assumptions and provenance in the result.
9. Placeholder suitability (a stub returning "needs verification") until S4 lands.

Rules: identical inputs give identical outputs. Never mutate inputs. No hardcoded outcomes.

Tests: determinism; raising annualMiles from 12,000 to 20,000 raises fuel spend and moves service timing earlier; hand-calculated fuel and loan cases match exact numbers; zero-mileage and paid-off edge cases.

Specifics to honor:
- Signature: simulate(twin, scenario, ctx: SimContext): SimulationResult. ctx.vehicles and ctx.specs come in as arguments. Never import from /data.
- Worked examples that must pass exactly: 12,000 mi at 28 mpg and $3.00/gal gives $1,285.71 of fuel per year; a $20,000 loan at 6% APR for 60 months gives $386.66 per month.
- Put HORIZON_MONTHS = 60 and all default rates in /sim/config.ts, each labeled illustrative.
End with the summary.
```

---

## D4-S2 Replacement economics (hour 6 to 9)

```
Task: build the vehicle replacement economics.

Context: read CLAUDE.md. Paste the P3-S1 summary. I own /sim.

Build so a "replace" scenario with a vehicle_replacement event at month N produces a correct comparison against "keep" over the SAME horizon:
- Sale or trade-in proceeds for the current car at month N (from its value curve, labeled illustrative)
- Payoff of any remaining loan or lease balance
- New car purchase price, tax and fees (seeded, labeled illustrative)
- Financing on the new car (down payment, rate, term)
- New car fuel, maintenance, insurance
- New car value at the horizon

Output three SEPARATE views per scenario and never merge them:
1. Cumulative cash outflow (every dollar actually paid)
2. Remaining assets and liabilities (car value left, loan balance left)
3. Net economic ownership cost (cash out minus remaining value plus liabilities)

Rules: no double counting (for example, do not subtract depreciation AND subtract resale value). Document the accounting identity in a comment and in /sim/ECONOMICS.md.

Tests: hand-calculated cases for keep and replace with exact expected totals; raising the RAV4 price raises cash outflow and net cost by the right amounts including tax and fees; a paid-off car has zero payoff; a negative-equity car is handled.

The accounting identity (write it in /sim/ECONOMICS.md and in a code comment):
  netEconomicCost_t = cumulativeCash_t + (loanBalance_t - loanBalance_0) - (vehicleValue_t - vehicleValue_0)
cumulativeCash includes every dollar paid out minus sale or trade-in proceeds. vehicleValue and loanBalance describe whichever car is owned at month t. Principal nets to zero, so interest, fees, and depreciation are the real costs. Add a test: buying at price P with fees F and down payment D (rest financed) has a purchase cost of exactly F at the instant of purchase.
End with the summary.
```

---

## D4-S3 Events and branching (hour 6 to 9, real at hour 8)

```
Task: build the event processor and branching engine.

Context: read CLAUDE.md. Paste the P3-S1 and P3-S2 summaries. I own /sim.

Build:
1. applyEvents(twin, scenario): sorts events by month with a stable order for same-month events, applies each payload only from its month forward. Supported types: relocation, mileage_change, family_change, cargo_change, budget_change, fuel_price_change, maintenance_decision, vehicle_replacement. Only events with status "confirmed" take effect; "proposed" and "invalid" are ignored.
2. Conflict rule: if two events change the same variable in the same month, the later in the list wins and a warning is added to the result.
3. fork(scenario, month, newEvents): returns a NEW scenario whose state through the fork month is copied from the parent (events before the fork month, inherited), plus the new events. It must never mutate the parent or any sibling.
4. moveEvent(scenario, eventId, newMonth), editEvent, deleteEvent: return new scenarios, and recompute only the affected periods (periods before the earliest changed month stay identical, and a test must prove it).
5. Support 4 or more simultaneous branches.

Rules: immutable data, pure functions. Prior months never change after a future change.

Tests: three events in one scenario at months 12, 36, 48 apply in order; same-month conflicts logged; moving an event leaves earlier points byte-identical; forking twice leaves parent and sibling deeply equal to before; unconfirmed events change nothing.

Also build makeReplaceScenario(parent, replacement: VehicleConfig, month?): Scenario. The default month is the first relocation or family_change month in the parent, else 12. It returns a NEW scenario with a vehicle_replacement event (status "confirmed", source "fixture"), named "Replace with <model>", and never mutates the parent. Exports: simulate, applyEvents, fork(parent, month, newEvents, name), moveEvent, editEvent, deleteEvent, makeReplaceScenario.
End with the summary.
```

---

## D4-S4 Suitability engine (hour 9 to 12)

```
Task: build the Toyota life-stage suitability engine.

Context: read CLAUDE.md. Paste the P2-D3 summary (specs). I own /decision.

Build assessSuitability(profile, vehicle, month): SuitabilityResult with:
- passengerFit: "good" | "tight" | "insufficient" | "needs verification", based on household size, children, car seats, seats available
- cargoFit: same scale, based on cargoNeed and cargoCuFt thresholds you define transparently in one config
- tradeoffs: short explanation keys (not prose) such as "more_cargo_but_lower_mpg"
- constraints: hard constraints triggered (for example seats < household)
- an explanation-ready structure that Developer 3's explain() can turn into prose

Rules: never assume more kids means an SUV. A Camry can score "good" when needs are met. If car seat fit or packing dimensions are not verified in specs, output "needs verification" and do not guess. Thresholds live in one config file, labeled "illustrative".

Tests: household of 2, low cargo: Camry good; adding two children with 2 car seats: Camry still good if seats suffice; cargo need high: RAV4 better; a household of 6: both insufficient with a hard constraint; missing verification data yields "needs verification".
End with the summary.
```

---

## D4-S5 Decision framework (hour 9 to 12, real at hour 11)

```
Task: build the transparent decision framework.

Context: read CLAUDE.md. Paste the P3-S2, P3-S3, and P3-S4 summaries. I own /decision.

Build evaluate(results, priorities, constraints): DecisionEvaluation:
Step 1: hard constraints first (insufficient seats, exceeding a stated monthly budget cap). A scenario that violates a hard constraint cannot be preferred.
Step 2: objective metrics: net economic cost, cumulative cash, fuel, maintenance, resale, suitability.
Step 3: weighted trade-offs using the user's priority weights (cost, family, longevity, fuel, comfort). Normalize each metric across scenarios so the scoring is transparent. Return the per-factor contribution for every scenario.
Step 4: verdict: the preferred scenario id, or "inconclusive" when the top two are within a margin defined in one config.

Rules: deterministic, no hidden upsell bias (add a test that keep wins when needs are met and costs are close), no LLM scores, weights visible in the output, rationale lines reference specific modeled factors. Changing priorities must be able to flip the verdict when there is a real trade-off.

Tests: keep wins in a low-need scenario; raising miles and fuel price flips to RAV4; changing priority from cost to family flips the verdict in a family-growth scenario; an inconclusive case is returned; a hard-constraint violation removes a scenario from contention.

Scoring spec: metrics are net economic cost (lower better), fuel spend (lower), longevity = 1 - min(odometer at month 60 / 250,000, 1) (higher), family = fit mapped good 1, tight 0.6, needs_verification 0.5, insufficient 0 (higher), comfort = SpecSheet.comfortScore or 0.5 when missing (higher). Min-max normalize across the compared scenarios (all equal gives 0.5 each). Score = weighted sum with the user's priority weights. Return per-factor contributions per scenario. INCONCLUSIVE_MARGIN = 0.05 lives in /decision/config.ts. Signature: evaluate({ twin, scenarios, results, priorities, maxMonthlyBudget? }): DecisionEvaluation.
End with the summary.
```

---

## D4-S6 Break-even and sensitivity (hour 12 to 15, real at hour 14)

```
Task: build break-even and sensitivity analysis.

Context: read CLAUDE.md. Paste the P3-S1, S2, and S5 summaries. I own /decision.

Build:
1. findBreakEven(twin, keepScenario, replaceScenario, parameter, bounds): bisection search on ONE parameter (start with annualMiles and fuelPricePerGal) between tested bounds, finding where the preferred scenario changes (by net economic cost, or by evaluate()'s verdict, as an option). Return { found: true, threshold, unit, direction } or { found: false, reason: "no threshold within tested bounds", testedBounds }.
2. A reproduction helper: given the threshold, rerun both scenarios at threshold +/- a small step and show the flip, so a user typing the value by hand gets the same result.
3. sensitivity(...): low / base / high runs for depreciation and fuel price, returning the range of net cost per scenario, and a robustness count: how many of the Y tested assumption sets keep the same preferred scenario ("held in X of Y tested cases"). Not a probability. No confidence percentages anywhere.

Rules: be honest when no threshold exists (for example, a hybrid may never pay back inside the bounds). Do not claim multidimensional optimization. Document the bounds in config.

Tests: a case with a known break-even matches a hand-computed value within tolerance; a case with no threshold returns found: false; reproduction flips the preference across the threshold; robustness count is stable and deterministic.

Bounds and method: annual miles 5,000 to 40,000, fuel price $2 to $8 per gallon, bisection with 40 iterations or a tolerance of 0.5% of the range, searching for where evaluate() changes its preferred scenario. Signature: findBreakEven({ twin, keep, replace, parameter, ctx, priorities }): BreakEvenResult. Include the reproduction helper that reruns both scenarios just below and above the threshold. sensitivity({ twin, scenarios, ctx, priorities }): SensitivityResult with low/base/high runs for depreciation and fuel price and heldCount/totalCount.
End with the summary.
```

---

## D4-S7 Next best action (hour 13 to 15)

```
Task: build the Toyota next-best-action rules.

Context: read CLAUDE.md. Paste the P3-S5 and P3-S6 summaries. Official links come from Developer 3's spec data (verified ones only).

Build nextAction(evaluation, twin): { label, detail, officialLink? } using deterministic rules tied to simulation outputs:
- Keep, then "Keep your car and review the next scheduled maintenance milestone" (cite the next milestone mileage from the sim)
- Replace is preferred AND cargo or family constraints drive it, then "Investigate a RAV4 Hybrid" with the cited reasons
- Finance type unknown or payoff uncertain, then "Get a payoff or trade-in quote before deciding"
- Inconclusive, then "Reevaluate at X miles or date" with the threshold from break-even if one exists

Rules: the keep action must be reachable with no upsell bias. Never imply a booking, application, or financial action was completed. Links only from verified data; if none, omit the link. Every action references at least one modeled factor.

Tests: each rule fires in its own case; keep is returned when it should be; no output ever contains language like "booked" or "approved".
End with the summary.
```

---

## D4-S9 Full test pass (hour 18 to 21)

```
Task: run the full Developer 4 test and audit pass.

Context: read CLAUDE.md. All S-workstreams are built.

Do:
1. Run all tests and fix failures in /sim, /decision, /ai only.
2. Black-box scenarios against the real modules:
   - Raise annual miles 12,000 to 20,000: mileage, fuel, and service timing change.
   - Relocation next year plus family growth three years later: two scheduled events, correct projections.
   - Fork a scenario twice: parent and sibling unchanged.
   - Raise the RAV4 price: economics update including fees.
   - Switch priority from cost to family: verdict changes in a family-growth case.
   - Ask for a break-even mileage and fuel price: threshold or an explicit no-threshold result.
   - Remove the Gemini key: manual path works and nothing crashes.
   - Propose 20,000 mi/yr and do not confirm: profile and projections unchanged.
3. Determinism audit: run the same scenario 100 times and compare outputs.
4. Audit: no number in any AI-facing prompt or output that did not come from the sim.
5. Audit: no place where the LLM output reaches the profile without a confirm.
6. Write /sim/README.md and /ai/README.md with every export, its inputs, outputs, and the offline guarantee.

End with a pass/fail table and a list of assumptions the pitch should disclose as illustrative.
```
