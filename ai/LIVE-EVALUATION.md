# First live Gemini evaluation, 2026-10-24

Model: gemini-3.1-flash-lite, configured only in the ignored local environment file. Key was never printed or committed. Tests used authored synthetic prompts and Alex's synthetic relevant profile fields. No real account, vehicle signals or financial records were sent.

## Results and limits

All 20 distinct authored cases were attempted through the actual createInterpreter/generateWithGemini pipeline. This was a diagnostic run followed by bounded targeted retries after fixes, not a single successful clean run. Comparison checked intent, event type, payload, month, certainty, proposed status, patch values/fields, unsupported handling and clarification field. It ignored wording, alternative valid quote spans, event IDs, and assumption phrasing.

- Initial pass: 17 cases attempted, 10 matching, six semantic mismatches, then a 429 quota failure stopped the pass before the remaining three cases. Safety checks never changed the confirmed context.
- Follow-up after grounding fixes: 10 failed/unfinished cases retried, four matching, five transport failures and one break-even intent mismatch. All 20 distinct cases had been attempted by this point.
- Final targeted retry after intent instructions: six cases attempted, one matching and five transport failures. This validated commute extraction against live Gemini after the fix.
- Latest recorded result by case across these runs: 15 matching; five requiring live revalidation due to unavailable generation. There is no claim of 20/20 passing or measured production reliability.
- Latest unavailable cases: demo, multiple, pure-rav4-question, paid-off and break-even. Responses included 503 service errors, 504 timeouts and an aborted request. Earlier behavior also exposed semantic failures for some of these; transport failure does not prove their extraction is fixed. The break-even intent prompt change still needs a successful live response.
- The manual fallback remained available and confirmed profile/context input stayed unchanged in every run.

Detailed sanitized case outcomes, expected/actual semantic results, retries, timings and status codes are in ai/fixtures/live-evaluation-results.json. No provider exception message or credential is included. Captured initial semantic failure responses are in ai/fixtures/live-extraction-failures.json for deterministic replay.

## Fixes from actual failures

1. Missing date: Gemini quoted only Denver or Austin and omitted the source clause's date. The mapper now flags an item as unresolved if its quote/source clause contains recognized future timing but the model omitted month. The interpreter retries once with actionable validation feedback, then clarifies instead of silently creating a month-zero event. No date is guessed or repaired by the model validator. This is a guard for recognized timing patterns, not a universal natural-language temporal parser.
2. Ordinal child count: the model converted second child into childrenDelta and omitted the date. Instructions now explicitly distinguish absolute ordinal counts from pregnancy deltas and require a full dated clause. Existing grounding rejects invalid deltas rather than applying them.
3. Context copying: a commute extraction copied annualMiles from the profile, with a quote absent from the actual prompt. That stays rejected. Instructions now explicitly prohibit context as extraction evidence; a successful live follow-up returned just the stated commute fields.
4. Query routing: pure comparisons discard any model-suggested profile/vehicle items while preserving the comparison intent, with no proposals or profile patches. Unsupported diagnoses normalize to CLARIFY with a deterministic explanation. Break-even instructions distinguish counterfactual threshold questions from ordinary comparisons; live revalidation remains pending for that prompt update.

Seven deterministic regression tests replay captured failures and check feedback/correction, date omission, context copying, pure comparison behavior, unsupported diagnoses and avoiding a model-year-as-date false positive. Those tests are safety/contract evidence, separate from live model accuracy.

## Verification and next action

215 automated tests pass, plus TypeScript, full lint and production build. Existing public signatures are unchanged. Changes stay in ai plus the Dev 3 handoff row; no UI, simulation, shared contract or credential changes are included.

Keep manual entry and explicit confirmation available during the demo. Re-run the five unavailable cases when generation is responding reliably, then run the complete live set once to establish a clean post-fix baseline. Use the synthetic case context; do not substitute real personal/account information. No billing settings or subscriptions were changed.

Google describes generation errors in its [API troubleshooting reference](https://ai.google.dev/gemini-api/docs/generate-content/api-errors). A model-list success verifies only that metadata can be read; it does not establish generation availability or project billing/quota eligibility.
