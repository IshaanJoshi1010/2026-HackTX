# Input and recovery upgrades

Implemented on dev3-data-ai without UI edits. Shared contracts remain unchanged except the approved nextAction documentation clarification; the freeze approvals are recorded in contracts/REVIEW.md.

## Client-safe helpers for Dev 2

`interpretOffline(text: string, todayISO: string): OfflineReading` from `ai/offline.ts` replaces the UI-owned regular-expression interpreter. It has no network, server-only imports or clock dependency. Call it only after unavailable AI, using the session's date. It returns intent, unconfirmed event inputs, and an optional clarification note. Allocate draft IDs in the store. Display its note if no event was produced. Questions never create events. Negatives, corrections, unsupported timing and events outside month 0 to 60 require clarification. An odometer reading does not become annual driving. The parser intentionally does not turn ambiguous natural language into a guessed change. It does not return odometer/profile patches; use the existing profile manual form for those.

`resolveEventMonth(phrase: string | undefined, todayISO: string, pregnancy?: boolean): EventTiming` also accepts spelled-out quantities through twenty, explicit calendar months with year, this/next named month, and ISO dates at month granularity. Seasons and unspecified calendar years require clarification. Ten years resolves to 120, then the event mapper rejects it as outside the five-year horizon; no clamping. A bare year remains June, inferred. The supplied session date remains authoritative.

`prepareManualEvent(input: unknown)` from `ai/scenarioDraft.ts` validates structured manual relocation, annual mileage, family children count, cargo, budget and fuel changes. Input includes type, month, and the relevant payload field. Zero children and zero annual mileage are valid. Example: `prepareManualEvent({type: "budget_change", month: 0, monthlyBudget: 500})`. Returns `{ok:true,event}` with status proposed and no ID, or `{ok:false,error}`. Stage it and obtain explicit confirmation. No household size or car-seat count is inferred.

`prepareScenarioTerms(input: unknown)` and `scenarioTermFields` from `ai/scenarioDraft.ts` support a guided financial review. Only include fields actually entered, omit skipped fields, and show inherited estimates separately. Example:

```ts
const draft = prepareScenarioTerms({
  insurancePerMonth: 150, replacementPrice: 30000, downPayment: 5000,
  purchaseFees: 400, salesTaxPercent: 6.25,
  newLoanAprPercent: 6.5, newLoanTermMonths: 60,
});
// On draft.ok, display draft.assumptions and draft.provenance for review.
// Only after explicit confirmation merge the assumptions into a new/forked scenario.
// Do not mutate confirmedProfile, the baseline scenario, or sibling branches.
```

All dollar inputs are USD, APR/tax inputs are percent (6.5 means 6.5%), and code converts them once to newLoanApr/salesTaxRate fractions. loanAprPercent can override the existing loan's implied APR. Zero values stay zero. Down payment exceeding an explicitly entered price is rejected. If only down payment is supplied, validate it against the actual selected purchase price during integration. Empty input gives empty assumptions, never invented terms. Term bounds are 1 to 120 months; out-of-range values produce an error. The source for each supplied assumption is user; carry the provenance sidecar through review. These helpers neither call AI nor calculate financial outcomes. The simulation owner retains all cost calculations.

## Validation and service behavior

Numeric grounding now associates a value with field-specific words and units. A budget number cannot satisfy annual miles simply by appearing in the same quote. Spelled-out counts such as six days and five children work. The mapper rejects dropped timing, negative/hypothetical statements and question-as-change output. Interpretation still validates, retries once on invalid output, and creates proposed changes only.

The API reads request bodies with byte caps (interpret 128 KiB; explain 512 KiB), including chunked requests. Oversized requests return 413, invalid input or mismatched comparisons 400, cancelled body reads 499 before generation, and unexpected server failures a generic 500 without private error details. Both interpret and explain share a per-process generation gate: at most two concurrent requests and ten starts per minute, with a 60-second quota cooldown or eight-second 503/504 cooldown. Each validation retry counts as a generation. No key or unavailable service preserves the existing fallback contracts. No automatic retry loop was added. Hosting across multiple instances still needs a shared platform quota; process-local limits alone are not a distributed guarantee. Neither prompt text nor credentials are logged.

Front-end integration and stale-response guards are intentionally delegated to Ishaan in docs/polish/paarth.md. Until he wires the shared parser and draft helpers, his existing UI-owned parser/forms retain their previous behavior. API mapper fixes and request protection apply immediately when this branch is merged. No new live Gemini reliability claim is made by these deterministic tests; see FULL-LIVE-RUN.md for the last live evidence.

Verification: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.

Local verification: all 690 tests across 50 files pass, including 57 new upgrade regressions. Type checking and lint pass. No live Gemini calls were made for this upgrade batch.
