# Three recording cases

All inputs are fictional. Start every take from a fresh Alex demo, with the fixed demo date `2026-10-24`, equal priorities, the saved Camry loan and unchanged purchase assumptions. Do not reuse another take's confirmed profile, events, edited terms or tradeoff picks. These outcomes are computed by the real engine; the expected verdict in the fixture is only a test assertion.

## Start with the fictional VIN

Enter **4T1G11AK1NU900001**. This is the existing reserved synthetic Camry VIN, with a valid check digit, explicitly designated as Alex's demo VIN. It resolves offline to the same 2022 Camry SE, 48,000 miles, Alex household and synthetic loan as the old sample-car flow. Reusing it keeps the saved paint, history and finance consistent. It does not establish an assigned real-world VIN or exact asset match.

UI handoff to Ishaan: make the landing VIN-first and remove the initial sample-car selection step. Route this exact reserved VIN to the explicit Alex demo path, preserve `demoTodayISO`, and proceed to the reveal/workspace. Ordinary VINs must retain generic onboarding. No UI changes were made in this branch.

## 1. Close call

Paste: **I'm moving to Denver next year, driving 20,000 miles annually, and expecting my second child in 2029.**

Review and confirm three changes: Denver at month 12, annual driving 20,000 at month 0, and two children at month 32. Bare 2029 means June and must remain labeled inferred. Compare with the RAV4 at month 12. Expected: **Close call / inconclusive**, with the Camry cheaper. Five-year modeled net costs are about $31,287 and $35,862. Ask **What would have to change for keeping the Camry to be better?** The computed annual-mileage threshold is approximately **14,434 mi/yr**. Show the rerun, not a promised real-world threshold.

## 2. Camry wins

Paste: **I drive 8,000 miles a year.**

Confirm the mileage proposal and compare with replacing at month 12. Expected: **Keep Camry**. Five-year modeled net costs are approximately $22,304 keeping and $26,782 replacing. This demonstrates that the app can recommend keeping the customer's existing car.

## 3. RAV4 wins

Paste: **I drive 30,000 miles a year, and I will have high cargo needs next year.**

Confirm annual driving 30,000 at month 0 and high cargo need at month 12. Compare with replacing at month 12. Expected: **Replace with RAV4**. Show the cargo-fit difference and fuel savings. The RAV4 still costs more in this model; its recommendation reflects the weighted fit, fuel and longevity tradeoffs, not a claim that it is the cheapest car.

For each take, finish with **Why?** to show the explanation and the concrete next step. AI explanation failure uses the engine's deterministic explanation. Confirmation is always required before a branch is created.

## Similar descriptions and limits

`getDemoCases()` provides four tested descriptions per case, covering casing, punctuation, `8k`/`20k`/`30k`, named annual mileage and equivalent dates. All twelve passed both the offline parser and a live Gemini run. Thirty nearby-mileage parser checks retain the exact stated number instead of snapping to a demo preset. The real engine also reproduced the expected verdicts for fifteen nearby inputs: Camry 6k–10k, close call 18k–22k with the same family/move events, and RAV4 25k–35k with the same high-cargo event.

An initial live explanation incorrectly attributed the close-call sensitivity count to a Camry win despite an inconclusive verdict. A new explanation guard and regression tests reject that wording. The final explanation run safely returned deterministic engine fallbacks for all three cases; successful live interpretation does not guarantee live explanation availability or latency.

No fuzzy matcher selects a winner. Live AI interprets other wording, then quote/value/date validation gates its output. Vague, contradictory, negative and hypothetical inputs remain clarification requests. The AI cannot fabricate a mileage or verdict to make the demo succeed. Arbitrary language, service availability and unrelated user edits cannot be guaranteed.

All 27 computed runs (12 scripted variants plus 15 nearby inputs) held their verdict across all nine built-in fuel/depreciation sensitivity combinations. This is a finite regression grid, not a confidence percentage or a scalability benchmark. `data/fixtures/demo-case-verification.json` records actual computed costs/scores/break-even and sensitivity counts on deployed baseline `e4e386a`. It is evidence only and is never imported into runtime scoring. `ai/fixtures/demo-live-verification.json` records live model checks separately.

## Integration and regression

New exports from `data/demo.ts`:

- `alexDemoVin: string`
- `isAlexDemoVin(vin: string): boolean`
- `buildDemoTwinFromVin(vin: string): Promise<BuildTwinResult>`

New parser export from `ai/dates.ts`: `splitClauses(text: string): string[]`.

New export from `data/demoCases.ts`: `getDemoCases(): DemoCase[]`. Fresh copies prevent cross-take mutation. `DemoCase` includes descriptions, expected event semantics, expected verdict, fixed date and replacement month. These are test inputs and assertions, never scoring overrides.

Ishaan's integration test should iterate the cases through the real UI facade: start from `alexDemoVin`, submit each description, verify drafts, confirm, compare and assert the real evaluation. For module-level wiring, use a fresh `buildDemoTwinFromVin(alexDemoVin)`, parse text through the shared interpreter, explicitly confirm the proposals, then call `simulate` and `evaluate` with the real specs. Keep vs replace uses the same life events and `makeReplaceScenario` with default replacement month 12. Assert `inconclusive`, keep scenario ID or replace scenario ID according to `expectedVerdict`. Also assert the original twin remains unchanged. Dev 3 does not import the simulation or decision modules in its own source/tests; the real-engine evidence was generated by an external scratch integration harness.

Targeted command: `npx vitest run ai/demoCases.test.ts data/demoVin.test.ts --maxWorkers=2`.

Full command: `npm test -- --maxWorkers=2`. Also run `npx tsc --noEmit`, `npm run lint`, and `npm run build`. These changes are on `dev3-demo-cases`, based directly on deployed main, with no reverted audit ancestry. They require integration and deployment before the hosted app changes.

Files created: `data/demoCases.ts`, `data/demoVin.test.ts`, `data/fixtures/demo-case-verification.json`, `ai/demoCases.test.ts`, `ai/fixtures/demo-live-verification.json`, and this guide. Existing parser and demo helpers were updated. No UI, sim, decision or contracts files changed.

Final validation: 70 test files, 974 tests passed; type checking, lint and production build passed. The two new demo test files contain 54 tests.
