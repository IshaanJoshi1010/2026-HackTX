# Dev 2 session notes (Ishaan), 2026-10-24

For whoever works on `dev2-ui` next (a person, or another AI tool). Read this, then `CLAUDE.md`, `contracts/INTERFACES.md`, and `ui/CLAUDE.md` (updated today). Never edit a folder you do not own: `/ui` and `/app` (except `/app/api`) are ours.

## Git state: read before running any git command

- Branch `dev2-ui`. Two local commits exist (the Paarth merge, then the first UI work). Nothing is pushed.
- **Everything since then is uncommitted:** Antigravity's session (command box, landing, reveal, profile card) plus the two-page redesign. Ask Ishaan before committing or pushing. A backup of the earlier state is at `/Users/ishaan/dev/2026-HackTX-backup-2026-10-24`.
- Coordigent warned that Anirudh's agent edits `contracts/mocks/index.ts`, `contracts/REVIEW.md`, and `docs/HANDOFF.md`. Do not touch them. Our Dev 2 row in `docs/HANDOFF.md` is stale.

## Commands

`npm run dev` (port 3000), `npm test` (155 tests), `npx tsc --noEmit`, `npm run lint`, `npm run build`.
If styles look stale, run `rm -rf .next`. Do not run dev and build at the same time (shared `.next`). Next.js here is 16.x with Cache Components, so read `node_modules/next/dist/docs/` before changing routing or rendering.

## What is built

Everything runs on mocks (all five `USE_MOCKS` flags are true). 287 tests.

- **Two pages, one stage.** `ui/shell/Workspace.tsx` keeps `CarStage` mounted and switches `store.ui.view`. **Car** (`CarView`): name, command bar, `ViewSwitch`. **Future** (`FutureView`): the road. The Future page ends above the bottom bar (measured with `useElementHeight`, a callback-ref hook; the bar mounts after the reveal).
- **The road** (`ui/timeline/Road.tsx`): one big road for the active future. The straight line is "if nothing changes" (the baseline). The road bends away from it by that future's net cost minus the baseline's, month by month: down costs more, up saves money. Math is in `roadMath.ts` (pure, tested): `deltaSeries`, `drawnRange` (never stretches a tiny difference), `roadY`, `assignLevels` (labels never overlap), `spreadLabels`, `smoothSeries` (a median filter for drawing only; numbers always use the raw series). Signposts are draggable decisions (arrow keys also work); decisions inherited from an earlier future are read-only. The readout at the top of the playhead says the effect in dollars with a source label.
- **Opt-in only** (store flags `ui.futureDetails`, `ui.futureCompare`, never saved, off every session): **Details** shows what each decision changed (`effects.ts` re-runs the future without that decision, using `simulationInputs(state)` and the sim facade) plus four supporting numbers. **Other futures** draws every future on the same road with names and where each ends. Asking to compare with a car turns Other futures on.
- The old stacked lanes (`FutureTimeline`, `ScenarioNode`, `Scrubber`) were removed on purpose: separate rows say nothing about what decisions did. Do not bring them back.
- **Your details sheet** (`DetailsSheet`, one header icon): car facts, profile, finance, priorities (tradeoffs and weights), history, 3D display options, low performance, switch sample car, start over. There are no side panels, HUD, or view-options bar. Do not bring them back.
- **Store** (`ui/store/useForkStore.ts`): all flows from `ui/CLAUDE.md`. New: `ui.view`, `ui.detailsOpen`, `setView` (opens Future on month 60 if the playhead is at 0), `addDraft`. Persistence (`fork:v1`) saves only `lowPerformance` plus the session; the page and the sheet are never saved.
- **Command bar** (`ui/command/`): one pill with voice and a plus for manual entry. The suggestion seeds the box and does not submit. With no AI, `extract.ts` proposes events using only what the user wrote: no invented places, miles, prices or counts, a labeled default month if timing is missing, and the keys the sim reads (`location`, `annualMiles`, `childrenDelta`, `fuelPricePerGal`). It belongs in Dev 3's offline interpret; move it when that lands. Confirming "Branch timeline" jumps to the Future page.
- **Entry**: `ui/landing/` (sample cars, VIN, model picker) and `ui/reveal/RevealOverlay` (progress line, spec row, rider question, skip).
- `ui/mocks/index.ts` facade with one flag per module. `ui/mocks/local.ts` and `CarStageStub.tsx` are throwaway stand-ins.

## Design direction (from Ishaan, overrides the old palette in root CLAUDE.md)

Tesla dark site: black and white only, every gray is white at an opacity (`text-ink/60`). No neon, glow, grid, or colored accents. One accent variable, `--fork-accent`, currently white. Source labels differ by shape, not color. Reveal information in layers. Never show the same number twice. No decorative controls.

## Rules that are enforced in code and tests (do not weaken)

AI proposals stay `proposed` in `draftChanges` and change nothing. Only `confirmDrafts` forks a scenario. Scenarios are replaced, never mutated. Every number has a source badge, and a missing source shows as a visible "no source" chip. No probabilities or confidence percentages. No em dashes in copy.

## Open requests (we cannot fix these; they belong to others)

- **Paarth:** add `mileage` to `alexProfile.provenance` (UI reads `driver.provenance.mileage`; until then Mileage and Upkeep show "no source"). Export `listSampleVehicles()` from the registry. Make `gapCheck` treat "I'm not sure" as answered. Paint is `"TODO: ..."` in both fixtures (UI hides it).
- **Anirudh:** every Dev 4 export is now real on `origin/dev4-sim` (simulate, applyEvents, fork, moveEvent, editEvent, deleteEvent, canEditEvent, affectedFromMonth, assessSuitability, evaluate, evaluateDetailed, findBreakEven, reproduceBreakEven, sensitivity, withSensitivity, withParameter, nextAction). His call flow: simulate each scenario, `evaluate`, `findBreakEven` (keep or replace direction is chosen for you), `reproduceBreakEven` for the visual, `sensitivity` then `withSensitivity`, `nextAction(e, twin, be, results)`. Each call is about 15 ms. Earlier notes: Notes from his agent: points cover months 1 to 60 (UI already looks points up by month); `fuelSpend` and `maintenanceSpend` are per month, not running totals (the UI's HUD and Insights label them as totals, so fix at swap); `canEditEvent`, `editEvent`, `deleteEvent`, `affectedFromMonth` exist; editing an inherited event throws `InheritedEventError`; the replacement event payload can carry `price` and `mileage`; ctx must include the RAV4 specs; fork ids are deterministic. Confirm `payload.vehicleId` on `vehicle_replacement` (the UI reads it) and which inputs feed each projected number (`metricSources.ts`).
- **Kareem:** the real canvas needs a transparent background (the floor glow sits behind it). Delete `ui/mocks/CarStageStub.tsx` and import `CarStageProps` and the reveal stage type from `@/ui/3d` when his lands.

## Next steps

1. Ask Ishaan about committing (see Git state).
2. **B6, swap mocks for the real modules**, one flag at a time, running the demo after each. Start with sim and decision (Dev 4 is ready): wire the real exports into the `real*` slots in `ui/mocks/index.ts`, add `editEvent`, `deleteEvent`, `canEditEvent` to `SimApi`, and compute cumulative fuel and upkeep in the UI (the real sim gives per-month values, and the Future page labels say "so far"). The local stub sim now reacts to `annualMiles` and `fuelPricePerGal` decisions and car swaps (so the road bends in the demo), but ignores everything else; the real sim will also move other numbers. Check the road and the Details effects against the real sim.
3. **B5, comparison and break-even** on the Future page: `BreakEvenViz` (use `reproduceBreakEven`), keep or replace verdict with `nextAction`, assumptions editor, "held in X of Y tested cases".
4. Edit and delete controls on timeline markers (respect `canEditEvent`).
5. Confirm the real Devpost submission deadline.

## Gotchas

- `zsh` on this machine has no `timeout`. Headless Chrome scripts used for screenshots lived in a session scratch folder and are not in the repo.
- jsdom has no `ResizeObserver` or pointer capture. The code guards both.
- A `Marker` named like its lane label (for example "Move to Denver") matches two buttons in tests, so use exact names.
