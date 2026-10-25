# Two VINs, six recording cases

All inputs are fictional. Start every take from the selected VIN's fresh demo, with fixed date `2026-10-24`, equal priorities and unchanged purchase assumptions. Each VIN has one fixed owner/loan across all three of its prompts. Do not reuse another take's confirmed profile, events, edited terms or tradeoff picks. These outcomes are computed by the real engine; the expected verdict in the fixture is only a test assertion.

## Start with either fictional VIN

Enter **4T1G11AK1NU900001**. This is the existing reserved synthetic Camry VIN, with a valid check digit, explicitly designated as Alex's demo VIN. It resolves offline to the same 2022 Camry SE, 48,000 miles, Alex household and synthetic loan as the old sample-car flow. Reusing it keeps the saved paint, history and finance consistent. It does not establish an assigned real-world VIN or exact asset match.

The second entry is **4T3RWRFV0RU900001**, the reserved synthetic 2024 RAV4 Hybrid XLE VIN. It has 24,000 miles and the same fictional household/initial driving profile, with a separate, explicitly synthetic loan: **$24,000 balance, $650 monthly payment, 60 months remaining**. The Camry keeps its existing **$15,000 / $450 / 36 months** loan. These fixed facts are loaded by VIN, never changed to suit a prompt. Provider defaults outside the explicit demo helper are unchanged.

UI handoff to Ishaan: make the landing VIN-first and remove the initial sample-car selection step. Route exactly these two primary reserved VINs through `isDemoVin` / `getDemoVehicleId` and `buildDemoTwinFromVin`, preserve `demoTodayISO`, and proceed to the reveal/workspace. Ordinary VINs must retain generic onboarding. No UI changes were made in this branch.

## Camry VIN: 1. Close call

Paste: **I'm moving to Denver next year, driving 20,000 miles annually, and expecting my second child in 2029.**

Review and confirm three changes: Denver at month 12, annual driving 20,000 at month 0, and two children at month 32. Bare 2029 means June and must remain labeled inferred. Compare with the RAV4 at month 12. Expected: **Close call / inconclusive**, with the Camry cheaper. Five-year modeled net costs are about $31,287 and $35,862. Ask **What would have to change for keeping the Camry to be better?** The computed annual-mileage threshold is approximately **14,434 mi/yr**. Show the rerun, not a promised real-world threshold.

## Camry VIN: 2. Stay with the Camry

Paste: **I drive 8,000 miles a year.**

Confirm the mileage proposal and compare with replacing at month 12. Expected: **Keep Camry**. Five-year modeled net costs are approximately $22,304 keeping and $26,782 replacing. This demonstrates that the app can recommend keeping the customer's existing car.

## Camry VIN: 3. Switch to the RAV4

Paste: **I drive 30,000 miles a year, and I will have high cargo needs next year.**

Confirm annual driving 30,000 at month 0 and high cargo need at month 12. Compare with replacing at month 12. Expected: **Replace with RAV4**. Show the cargo-fit difference and fuel savings. The RAV4 still costs more in this model; its recommendation reflects the weighted fit, fuel and longevity tradeoffs, not a claim that it is the cheapest car.

## RAV4 VIN: 1. Stay with the RAV4

Paste: **I drive 30,000 miles a year, and I will have high cargo needs next year.**

Confirm mileage 30,000 at month 0 and high cargo at month 12. Compare keeping the RAV4 with switching to a Camry at month 12. Expected: **Keep RAV4**. Keeping better serves the stated cargo needs and fuel use, even though the Camry's modeled net ownership cost is lower. This is deliberately the SAME prompt as the Camry-to-RAV4 case; the current vehicle and its confirmed ownership facts change the appropriate action.

## RAV4 VIN: 2. Switch to the Camry

Paste: **I drive 6,000 miles a year.**

Confirm annual mileage 6,000 at month 0, then compare with a Camry at month 12. Expected: **Switch to Camry**. The fixed RAV4 loan and low driving make a less costly smaller car worth investigating. The fictional loan is a material assumption, visible in the owner/finance details. This is not a guaranteed trade-in, refinancing offer or dealer quote.

## RAV4 VIN: 3. Close call

Paste: **I drive 30,000 miles a year, and I pay $4 per gallon.**

Confirm annual mileage 30,000 and fuel price $4 at month 0. Compare with a Camry at month 12. Expected: **Close call / inconclusive**. Both cars are eligible: the Camry's lower modeled cost competes with RAV4 efficiency and remaining life. This is a genuine score-margin tie, not an unaffordable pair of scenarios. The real engine finds no annual-mileage threshold within its tested 5,000–40,000 bounds here. Show that honest limit and its next action rather than borrowing the Camry case's threshold.

For each take, finish with **Why?** to show the explanation and the concrete next step. AI explanation failure uses the engine's deterministic explanation. Confirmation is always required before a branch is created.

## Similar descriptions and limits

`getDemoCases()` provides four tested descriptions per case (24 total), covering casing, punctuation, `8k`/`20k`/`30k`, named annual mileage and equivalent dates. All 24 pass offline extraction. All 24 descriptions have passed live Gemini checks: the prior 12 Camry checks plus 12 new RAV4 checks. The RAV4 batch initially passed 10 of 12; two service failures passed on explicit retry. Both failed attempts and retries remain in the evidence, rather than presenting retries as first-pass reliability. Thirty nearby-mileage parser checks retain the exact stated number instead of snapping to a demo preset. The real engine also reproduced the expected verdicts for 30 nearby inputs: Camry stay 6k–10k, Camry close 18k–22k, Camry switch/RAV4 stay 25k–35k, RAV4 switch 5k–7k, and RAV4 close 28k–32k with the same $4 fuel price. Other non-mileage events remain the same.

An initial live explanation incorrectly attributed the close-call sensitivity count to a Camry win despite an inconclusive verdict. A new explanation guard and regression tests reject that wording. The final explanation run safely returned deterministic engine fallbacks for all three cases; successful live interpretation does not guarantee live explanation availability or latency.

No fuzzy matcher selects a winner. Live AI interprets other wording, then quote/value/date validation gates its output. Vague, contradictory, negative and hypothetical inputs remain clarification requests. The AI cannot fabricate a mileage or verdict to make the demo succeed. Arbitrary language, service availability and unrelated user edits cannot be guaranteed.

All 54 computed runs (24 scripted variants plus 30 nearby inputs) held their verdict across all nine built-in fuel/depreciation sensitivity combinations. This is a finite regression grid, not a confidence percentage or a scalability benchmark. `data/fixtures/demo-case-verification.json` records actual computed costs/scores/break-even and sensitivity counts on deployed baseline `e4e386a`. It is evidence only and is never imported into runtime scoring. `ai/fixtures/demo-live-verification.json` records live model checks separately.

## Integration and regression

New/current exports from `data/demo.ts`:

- `demoStartingVins: Readonly<Record<DemoVehicleId, string>>`
- `getDemoVehicleId(vin: string): DemoVehicleId | undefined`
- `isDemoVin(vin: string): boolean`
- `alexDemoVin: string` (legacy Camry alias only)
- `isAlexDemoVin(vin: string): boolean`
- `buildDemoTwinFromVin(vin: string): Promise<BuildTwinResult>`

New parser export from `ai/dates.ts`: `splitClauses(text: string): string[]`.

New export from `data/demoCases.ts`: `getDemoCases(vehicleId?: DemoVehicleId): DemoCase[]`. Fresh copies prevent cross-take mutation. `DemoCase` includes starting VIN/vehicle, replacement vehicle, descriptions, expected event semantics, expected verdict, fixed date and replacement month. These are test inputs and assertions, never scoring overrides.

Ishaan's integration test should iterate the cases through the real UI facade: start from each case's `startingVin`, submit each description, verify drafts, confirm, compare and assert the real evaluation. For module-level wiring, use a fresh `buildDemoTwinFromVin(demo.startingVin)`, parse text through the shared interpreter, explicitly confirm the proposals, then call `simulate` and `evaluate` with the real specs and `demo.replacementVehicleId`. Keep vs replace uses the same life events and `makeReplaceScenario` with default replacement month 12. Assert `inconclusive`, keep scenario ID or replace scenario ID according to `expectedVerdict`. Also assert the original twin remains unchanged. Dev 3 does not import the simulation or decision modules in its own source/tests; the real-engine evidence was generated by an external scratch integration harness.

Targeted command: `npx vitest run ai/demoCases.test.ts data/demoVin.test.ts --maxWorkers=2`.

Full command: `npm test -- --maxWorkers=2`. Also run `npx tsc --noEmit`, `npm run lint`, and `npm run build`. These changes are on `dev3-demo-cases`, based directly on deployed main, with no reverted audit ancestry. They require integration and deployment before the hosted app changes.

Files created: `data/demoCases.ts`, `data/demoVin.test.ts`, `data/fixtures/demo-case-verification.json`, `ai/demoCases.test.ts`, `ai/fixtures/demo-live-verification.json`, and this guide. Existing parser and demo helpers were updated. No UI, sim, decision or contracts files changed.

Final six-case validation: 70 test files, 994 tests passed. Type checking, lint and production build passed. The 54 computed cases all held their expected verdict in all nine built-in sensitivity combinations; both close-call cases retained two eligible options.

## Integration details and known engine limitation

Call `getDemoCases("camry-2022-se")` or `getDemoCases("rav4-2024-hybrid-xle")` to obtain the three prompts for the selected starting car. These fixtures never override interpretation or scoring. Keep existing case IDs for compatibility; the new reverse cases are `rav4-stay`, `rav4-switch`, `rav4-close-call`.

For the RAV4 VIN, use `buildDemoTwinFromVin` or `buildDemoTwin("rav4-2024-hybrid-xle")` so the explicit fictional loan is applied. Do not construct its demo with generic `buildTwin` or a bare `SyntheticProvider`, which intentionally retain their existing generic/provider behavior. `isAlexDemoVin` remains a legacy Camry-only predicate; use `isDemoVin` for the two-VIN landing.

The deployed-baseline evaluator does not yet consider future budget_change events when selecting a verdict. This was reported to Anirudh; no demo depends on that behavior. This branch does not change the engine, UI or contracts.
