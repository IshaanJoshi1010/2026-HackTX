# Future timeline redesign: status when the session stopped

Spec: docs/handoffs/FUTURE-TIMELINE-SPEC.md. Branch: `audit-fixes` (worktree /Users/ishaan/dev/2026-HackTX-audit).

## Merged into audit-fixes (committed, typecheck clean)
- Store clock and state (e74fcf1, 4e9d239): selectedEventId, playback (play/pause/advanceMonth), drawers (openDrawer/closeDrawer), revision, lastChange, vehicleAtMonth, selection kept when confirming on the switch future.
- journey/model (useJourney, useJourneyActions), journey/scrubber (Scrubber, usePlayback), journey/drawers (Drawer, JourneyDrawers, CostsContent, RecommendationContent, JourneyHeader), journey/explain (EventCard, ExplainContent, impact, useEventImpact).

## Update: the road is now merged
The road (journey/timeline, 632ec59) is merged and FutureView is committed, so the page compiles and `npm run dev` shows it. Typecheck is clean and `npx vitest run ui/journey` passes. Not done:
1. Old tests that pin the previous layout still fail: ui/shell/ForkApp.test.tsx (future page, expanded timeline, answer fits the page), ui/customerWords.test.tsx (future steps), ui/integration/fuzz.test.tsx screen checks. Rewrite for the new testids (journey-timeline, event-marker, destination, time-marker, event-card, scrubber, JourneyHeader, drawers).
2. Remove dead code: ui/shell/DeepDive.tsx, ui/compare/DecisionSummary.tsx, ui/timeline/WindingTimeline.tsx + steps.ts + windingMath.ts (keep ui/timeline/useElementSize.ts: the road imports it), the expand button state (futureExpanded) and other old future flags if unused.
3. Look at it in a browser at 1440, 1280, 1024 and 390 wide (script: scratchpad/shot/future.mjs) and fix what shows up. Nothing has been rendered yet.
4. Preview deploy, then prod on Ishaan's word.
