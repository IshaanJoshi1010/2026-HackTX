# Daily driving input repair

User report: Screenshot 2026-10-24 at 11.06.39 PM.png. Exact input:

> im going to drive 100 miles a day next year in denver

Before the fix, the deployed /api/interpret returned HTTP200, aiAvailable true, CLARIFY, and no proposals or profile patches (2.28 seconds). The application displayed its generic nothing-found message because only annual miles/commute distance were recognized.

## Behavior

Daily mileage is copied by the model as a raw STRING in the existing annualMiles extraction slot. The model does not multiply. `deriveAnnualDriving(raw: string, evidence: string): AnnualDrivingEstimate | null` in data/drivingRate.ts validates quoted daily units and code calculates annual miles.

- 100 miles a day: 36,500 annual miles with an explicit 365-days/year assumption, certainty inferred.
- 100 miles a day, 5 days a week: 26,000 annual miles, assuming 52 weeks and no additional driving.
- Weekdays means five driving days/week; weekends means two. Those remain inferred annual estimates.
- Zero and decimal daily distances are supported. Negative/unsafe/unquoted amounts, unsupported weekly frequencies, short-trip durations and commute statements without a weekly schedule require clarification rather than silently assuming a full calendar year.
- The exact screenshot sentence produces one proposed mileage_change at month12, payload annualMiles36500, and no present-day profile patch. Driving in Denver alone does not assert a relocation. A model-generated location item is discarded in this specific driving-place context, so it cannot suppress a separately grounded daily rate or invent a move. Other invalid values still fail normal validation.
- Future dates stay with their own quoted change. Independently dated current and future daily rates remain separate proposals; conflicting rates in the same slot are withheld.
- Only code-authored conversion assumptions are used for daily rates. Model arithmetic/assumptions are not copied into the resulting event.

No shared contracts or extraction enum fields changed. Existing annual-mileage numbers still require their existing evidence. Gemini and the shared offline parser use the same conversion helper. Local validation and the confirmation gate remain intact.

## Verification

The exact screenshot sentence was tested with real gemini-3.1-flash-lite after the fix: one generation, 1.365seconds, aiAvailable true, one mileage_change at month12/36500, inferred, status proposed. This is a successful local-provider smoke check, not a verified production deployment. Initial live debugging showed the model continuing to infer relocation even after a retry; the deterministic context filter prevents that action rather than relying on prompt wording alone.

Tests cover the exact screenshot, raw-unit grounding, AI-math rejection/retry, date and profile immutability, alternate daily phrasings, stated schedules, zero/decimal values, negatives/questions/contradictions, model-inferred relocation and invented assumption arithmetic. Run `npm test -- --maxWorkers=2`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.

## UI ownership and deployment

Work is isolated on dev3-driving-rate, based on published audit-fixes367b521. dev3-data-ai was restored to its unchanged remote a240b8a; no pending audit changes are pushed through that branch. Ishaan merges/reviews/deploys this feature through the audit branch. This commit does not edit UI code.

The existing ConfirmProposalCard shows an inferred badge but does not render draft.assumptions. The required UI follow-up is in docs/polish/paarth.md: show the calculation/frequency assumption before confirmation and provide a correction path. Do not describe 36,500 as directly stated by the user, or claim the live website is repaired until the owner integrates and redeploys it.

Final verification: all 1,187 tests across 78 files pass, including 27 daily-driving regressions; lint, standalone type checking and the production build pass. The actual local HTTP route returned the exact expected proposed month12/36500 result in2.73seconds after the code-authored-assumption filter was applied.
