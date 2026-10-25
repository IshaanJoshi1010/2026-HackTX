# Full live Gemini run and contract answer, 2026-10-24

Dealer lookup is Anirudh's task. Dev 3 accepts the new-files-only scope app/api/dealers/, data/dealers/, and data/fixtures/dealers-*.json. No dealer implementation or dealer file change is included here; /contracts remains owned by Paarth.

## Original five cases

The previous five cases (demo, multiple, pure-rav4-question, paid-off, break-even) passed their targeted revalidation 5/5, one call each, recorded in ai/fixtures/live-revalidation.json. Those same five also matched in the full paced run below. They are no longer awaiting initial successful live verification.

## Full run

A first attempt stopped at the project/model's free-tier rate limit. Google reported a quota value of 15 requests per minute and a retry delay. That attempt also exposed a greeting routed as COMPARE_SCENARIOS with no actions. The extraction instruction now explicitly maps greetings with no facts/question to CLARIFY and no items. Existing quote/value/date guards and the confirmation gate remain unchanged.

Then ran the complete 20-case set through the actual configured Gemini generator and interpreter, pacing generation starts at least 4.5 seconds apart, including validation retries. One uninterrupted suite attempt reached all 20 cases without a quota rejection:

- 15 matched expected semantic behavior.
- Five could not generate successfully: contradiction (504), vague-commute (504), commute (504), fuel (503), payment (504).
- Zero semantic mismatches among successful responses, including the corrected greeting.
- The confirmed context stayed unchanged throughout; generated events remained proposed.
- This is a complete attempted suite, not a 20/20 clean pass or a production accuracy rate. Manual entry and deterministic explanation fallback remain necessary.

Results, raw synthetic extraction outputs, timings, calls, exact prompt hash and safe error statuses are in ai/fixtures/full-live-run.json. It contains no credential. Source base commit and the one prompt change are identified. Model: gemini-3.1-flash-lite. Local secret stays in ignored .env.local; no billing, key, hosting or dealer changes were made.

Semantic comparison checks intent, event type/month/payload/certainty/status, patch fields/values, unsupported handling and clarification field. It ignores equivalent quote spans, generated IDs, assumption wording and question wording. These 20 authored examples are diagnostic coverage, not a production-distribution accuracy measurement.

## Contract answer

Paarth / Dev 3 explicitly APPROVES:

- Exact-match flags remain in the registry, with all five required for exact.
- Odometer provenance is driver.provenance["mileage"].
- Scenario months remain nonnegative; history uses ISO calendar dates.
- Existing FinanceState, VehicleSignals and AccountData are sufficient.
- Anirudh's optional fourth results argument and comment for nextAction match the shipped implementation and preserve three-argument call compatibility.

This answer is recorded in contracts/REVIEW.md and was sent to Anirudh and Ishaan's agents. Anirudh has confirmed. Ishaan's explicit OK remains required before applying the canonical INTERFACES.md clarification and marking the contracts newly frozen; no consent is inferred from silence.

## Checks

npm test
npx tsc --noEmit
npx eslint ai

Production implementation changes in this follow-up are limited to the greeting instruction. Existing public signatures remain unchanged. The full merged suite and earlier build checks are described in ai/POST-MERGE-CHECKS.md; this diagnostic does not change the already verified no-key fallback behavior.
