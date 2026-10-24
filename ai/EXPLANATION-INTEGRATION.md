# Dev 4 explanation integration

Checked against dev4-sim commit 146bd22 on 2026-10-24.

## Changes

`explain` retains its frozen signature:

```ts
explain(evaluation: DecisionEvaluation, results: SimulationResult[]):
  Promise<{ text: string; usedFallback: boolean }>;
```

No shared contracts changed. No production or test imports from sim or decision were added. Dev 2 still passes computed evaluation/results through POST /api/explain.

Offline, unavailable-key and rejected-output responses now preserve the supplied engine rationale verbatim, including its computed verdict, cost, fuel, weights and score breakdown. They also include hard constraints, simulation warnings, recognized fit disclosures and the supplied next action. The explanation layer does not calculate a new result or select a winner. Empty rationale still has a generic fallback; inconclusive results stay explicit.

The generator receives each result's summary, milestones, warnings and final point, plus a deduplicated fitChecks list translated from known suitability keys across every supplied monthly point. This preserves earlier issues without sending the full monthly timeline. Fit checks describe issues anywhere in a scenario, not necessarily its final state. Car seat and packing disclosures remain unverified.

Generated percentage claims now use the deterministic fallback, even when the same numeric value occurs elsewhere in the input. This conservative rule prevents treating scores or unrelated month values as confidence percentages. A supplied warning containing a percentage can still appear verbatim in the deterministic fallback. The number guard alone checks numeric membership and cannot prove every semantic claim. Live Gemini behavior remains unverified.

This supersedes C8B-HANDOFF.md's description of a number-free fallback. Fallback values now come verbatim from supplied deterministic outputs.

## Compatibility fixture

ai/fixtures/dev4-explanation.json was captured by running the actual simulate, makeReplaceScenario and evaluate implementations from origin/dev4-sim at the recorded commit in an isolated in-memory TypeScript loader. Inputs were Dev 3's synthetic Alex, vehicle, finance and spec fixtures at e2cda7e. It compares keeping the Camry with a RAV4 replacement at the family change in month 12. The full horizon is 60 months; only monthly points 1, 12 and 60 were saved to keep the fixture small. Summary totals, milestones, warnings and evaluation rationale are unchanged engine outputs. The fixture is a regression snapshot, not a live integration or financial quote. Its metadata records both source commits.

Tests validate the fixture against frozen schemas, retain its rounded rationale numbers, check input immutability, retain an earlier passenger constraint when the final point no longer has it, reject invented savings/percentages, and preserve inconclusive decisions, warnings and constraints.

## Verification

npm test
npx tsc --noEmit
npm run lint
npm run build

New files: ai/explain.test.ts, ai/fixtures/dev4-explanation.json and this handoff. Updated: ai/explain.ts and ai/prompts/system.ts. No new public exports.
