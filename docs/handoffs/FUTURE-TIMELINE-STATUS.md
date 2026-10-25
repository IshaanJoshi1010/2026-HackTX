# Future timeline redesign: status when the session stopped

Spec: docs/handoffs/FUTURE-TIMELINE-SPEC.md. Branch: `audit-fixes` (worktree /Users/ishaan/dev/2026-HackTX-audit).

## Merged into audit-fixes (committed, typecheck clean)
- Store clock and state (e74fcf1, 4e9d239): selectedEventId, playback (play/pause/advanceMonth), drawers (openDrawer/closeDrawer), revision, lastChange, vehicleAtMonth, selection kept when confirming on the switch future.
- journey/model (useJourney, useJourneyActions), journey/scrubber (Scrubber, usePlayback), journey/drawers (Drawer, JourneyDrawers, CostsContent, RecommendationContent, JourneyHeader), journey/explain (EventCard, ExplainContent, impact, useEventImpact).

## NOT done
1. The road. A background agent was still writing it on branch `journey/timeline`, worktree
   /private/tmp/claude-501/-Users-ishaan-dev-2026-HackTX/01d0c7d4-d4f3-4caf-a534-b7252dcafab6/scratchpad/wt-jtimeline
   (ui/journey/JourneyTimeline.tsx + roadGeometry.ts; geometry tests written, component tests not). Check `git log journey/timeline` for a commit.
   To use it: delete the two temporary UNTRACKED copies in ui/journey/ (JourneyTimeline.tsx, roadGeometry.ts), then `git merge journey/timeline`.
2. ui/shell/FutureView.tsx is rewritten (uncommitted in the working tree) to compose header, road, scrubber, event card and drawers. It needs the road to compile. Commit it together with the road.
3. Old tests pin the old page: ui/shell/ForkApp.test.tsx (future page, expanded timeline, answer fits the page, details), ui/customerWords.test.tsx, ui/integration/fuzz.test.tsx checks. Rewrite for the new testids.
4. Remove dead code once the new page is in: ui/shell/DeepDive.tsx, ui/compare/DecisionSummary.tsx, ui/timeline/WindingTimeline.tsx + steps.ts + windingMath.ts, the expand button state (futureExpanded) and other old future flags if unused.
5. Browser check: script at scratchpad/shot/future.mjs (run against `next start` on 3100 after `npm run build`); inspect screenshots at 1440, 1280, 1024 and 390 wide. Then preview deploy, then prod on Ishaan's word.
