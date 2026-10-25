# Future page redesign (not built yet) and where the work stands

Written so the work survives the session. The spec below is Ishaan's, pasted as written. Everything here is on branch
`audit-fixes` (worktree `/Users/ishaan/dev/2026-HackTX-audit`). Production (https://fork-hacktx.vercel.app) is still
`audit-fixes` at `00aaa14`; the later work is pushed but not deployed.

## The spec

The main issue is that the same information appears in several places, with no clear order of importance. Keep the winding
timeline, but give each section one job.

Right now, users see life events in the journey, again in the cost chart, and again in the breakdown. They also see the
recommendation, selected event, next step, inputs, and history competing for attention.

1. Put the decision and financial comparison together at the top.
   "Life takes turns" can stay as a small introductory line. "Close call" should be the main heading, immediately followed
   by the numbers that explain the decision:
   `Keep your Camry | Switch to RAV4 | Difference` then `$31,287 | $35,639 | Switching adds $4,352`.
   Label the whole comparison "Modeled net cost over five years." Keep it as three aligned text columns, without separate
   cards. Below that, explain why the result is still a close call despite the cost difference. Use the actual priority
   calculations to supply that explanation.
2. Let the winding timeline show only events and choices. Each milestone needs just a short date, the event name, and a
   numbered marker. Remove "Adds to your cost," "No change to cost," and repeated "Close call" labels from the route. Put
   those details in the selected event area. Give the two endpoints matching styling (the boxed RAV4 label and unboxed
   Camry label feel inconsistent). Use a clear selected state, with recommendation status shown separately.
3. Make the area beneath the timeline the single home for event details. Keep the large "04." Tighten it to: selected event,
   then effect, then relevant explanation. For the fork, show the keep-versus-switch tradeoff. For Denver, show its modeled
   effects and assumptions. Keep this area the same height when switching events so the page stays still. The overall
   five-year totals stay at the top, not repeated inside every event.
4. Keep the deeper information, but group it by the question it answers:
   - Month-by-month costs and event cost contributions: **Costs** tab
   - Recommendation reasoning and "9 of 9 tested cases": **Why this result** tab
   - Conditions that would change the recommendation: **What could change** tab
   - Vehicle, household, financing, and priority inputs: **Edit assumptions** drawer
   - Other simulated futures: a selector beside the timeline
   - Previous runs and history: a History section inside the drawer
   Inside Costs, replace the second road graphic with a conventional cost chart with labeled dollar and time axes, with the
   breakdown directly underneath. The winding road already handles the storytelling.
5. Give the next step one prominent location, directly beneath the recommendation, for example "Reevaluate at 68,000
   miles or in 12 months."

Two things to fix beyond styling:
- Timing consistency: the journey makes the fork appear after the second child, while the lower chart places the
  replacement around year one. A decision's position should match its modeled date, or be clearly separated from the
  chronological milestones.
- Space allocation: the central content is narrow while the right panel is clipped. Use a wider main canvas and open
  assumptions in a properly sized drawer. Increase text size instead of trying to display every section at once.

The default screen should show the verdict, both costs, the journey, the selected event, and the next step. Everything else
stays one deliberate click away.

## Also asked, not done yet

- The rider chips' arc to the side panel is still a little laggy. Likely causes to fix: the panel frame uses
  `backdrop-blur` over the live 3D canvas; `SpecReadout` transitions `bottom` (a layout property) at the same moment the
  chips fly. Move both to transform/opacity, drop the blur, add `will-change: transform` and a short start delay.
- Do not overcrowd the page. Ideas: hide the progress pill once the specs show; put the specs in a left column mirroring the
  right rider panel instead of stacking at the bottom; keep the starter chip but not stacked under specs.
- Merge Paarth's AI branch when he sends the hash (`dev3-ai-integration`). He is fixing baby and month names, commute
  distance, daily miles, bare months and seasons, the pointless retry, and the rate limit (see his messages). Then preview,
  then production.

## Where the work stands

Done and pushed to `audit-fixes`: VIN-first landing, persistent specs that fade after 30 s, customer wording filter (no
"demo" or "data" on screen), winding Future timeline, expand button, rider chips flying to a side panel, confirm card shows
assumptions and values.

Done in the working tree, saved in the commit that holds this file: the sync fixes found by the random-session harness
(`ui/integration/fuzz.test.tsx`; run `FUZZ_SEQS=400 FUZZ_STEPS=50 npx vitest run ui/integration`). It found and the store now
fixes: stale results after a replayed reveal; confirming while looking at the other car; comparison not moving with a new
life; old replace futures being compared; a moved event not reaching futures built from it; "paid off" keeping a balance;
duplicate drafts; numbers that freeze the tab (`ui/store/eventRules.ts`); a morph left pointing at the wrong car; replay
dropping the car in view.

Still to write: a regression test for each of those fixes (the harness covers them, but each deserves its own).

## How to run it

`cd /Users/ishaan/dev/2026-HackTX-audit && npm run dev` (copy `.env.local` from the main worktree for live AI).
Gate before any push: `npx tsc --noEmit && npm run lint && npm test && npm run build`.
