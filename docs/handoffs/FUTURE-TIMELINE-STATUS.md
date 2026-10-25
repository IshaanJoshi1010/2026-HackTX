# Future timeline redesign: status

Status: DONE in code. Spec: docs/handoffs/FUTURE-TIMELINE-SPEC.md. The new Future page is built, merged, tested and the old page is gone. One check is left: nobody has looked at it in a real browser yet.

## What is in
- Store clock and state: `activeMonth`, `selectedEventId`, `activeScenarioId` with `comparison`, `revision`, `lastChange`, `ui.playing`, `ui.drawer`, `ui.busy`; actions `selectEvent`, `selectFuture`, `play`, `pause`, `advanceMonth`, `openDrawer`, `closeDrawer`; `vehicleAtMonth` says which car is in a future at a month.
- The page: `ui/shell/FutureView.tsx` composes `ui/journey/*` (JourneyHeader, JourneyTimeline, Scrubber, EventCard, JourneyDrawers with Explain this, Compare costs and the recommendation). Data layer is `ui/journey/model.ts` and `useJourney.ts`.
- Tests: the `ui/journey/*.test.*` files cover the new page. `ui/shell/ForkApp.test.tsx`, `ui/customerWords.test.tsx`, `ui/integration/fuzz.test.tsx` and a new `ui/journey/FuturePage.spec.test.tsx` were being written in separate sessions while this cleanup ran, and are not on this branch. Until they land, `npx tsc --noEmit` fails only in `ui/shell/ForkApp.test.tsx` and `ui/integration/fuzz.test.tsx`, which still use the removed flags and `WindingTimeline`.

## Dead code removed (branch finish/cleanup)
- Files: `ui/shell/DeepDive.tsx`, `ui/compare/DecisionSummary.tsx`, `ui/compare/NextStep.tsx`, `ui/compare/Toggle.tsx`, `ui/timeline/WindingTimeline.tsx`, `steps.ts`, `windingMath.ts`, `Road.tsx`, `roadMath.ts`, `EventMarkers.tsx`, and every test that only covered them (this also removes the old failing test "each end looks at its own future").
- Trimmed: `ComparisonSection.tsx` keeps `useComparison`, `TermsSection`, `ComparisonChange`; `Verdict.tsx` keeps `verdictHeadline` and `robustnessLine`; `layout.ts` keeps `decisionsOf`, `pointAt`, `totalThrough`; `effectPhrase` moved into `effects.ts`; `signedUsd` and `selectActivePoint` and the `fork-draw` CSS are gone.
- Kept on purpose: `ui/timeline/useElementSize.ts` (the road measures itself with it), `effects.ts` and `useDecisionEffects.ts` and `FutureDetails.tsx` (the breakdown inside Compare costs).
- Store: `futureExpanded`, `futureDetails`, `futureCompare`, `futureWhy`, `futureTerms`, `futureBreakEven`, their setters, `setFuturePanel`, `openFuturePanel` and the `FuturePanel` type are removed. They were never saved, so old saved state still loads (there is a test with an old shaped save).

## What remains
1. Look at it in a browser at 1440, 1280, 1024 and 390 wide (script: scratchpad/shot/future.mjs) and fix what shows up. Nothing has been rendered yet.
2. Preview deploy, then prod on Ishaan's word.
3. Product gaps the cleanup found (not fixed, they are design calls):
   - The engine's next step has a detail sentence and sometimes an official link. The old page showed both; the new page shows only the label ("Next: ...") in the header. Restore from `01b8aaa:ui/compare/NextStep.tsx` into the recommendation drawer if wanted.
   - Typing "what would have to change..." runs the break-even but opens nothing. The answer is in the recommendation drawer, one tap on the heading away. Opening that drawer from the store when the outcome is `break_even` would fix it.
4. Small leftovers: `valueAt` in `ui/compare/costChartMath.ts` is only used by its test. `docs/prompts/dev2-ui.md` and `docs/handoffs/DEV2-session-notes.md` still name the removed files (they are history).
