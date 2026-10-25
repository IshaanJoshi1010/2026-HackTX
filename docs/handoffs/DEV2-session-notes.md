# Dev 2 session notes (Ishaan), 2026-10-24

For whoever works on `dev2-ui` next (a person, or another AI tool). Read this, then `CLAUDE.md`, `contracts/INTERFACES.md`, and `ui/CLAUDE.md` (updated today). Never edit a folder you do not own: `/ui` and `/app` (except `/app/api`) are ours.

## Git state

- Branch `dev2-ui`, pushed. `main` already has all four branches (first integration merge, `e935e1f`). After that, `dev2-ui` was brought up to `main` and carries the B6 work, the Story A UI, the manual form fix and the polish.
- Not yet on `main`, waiting for the next integration merge: `dev1-3d` (the RAV4 manifest id fix, the particle reveal and the morph), `dev3-data-ai` (`7524da7`, odometer source), `dev4-sim` (docs). Merge them through a separate worktree with merge commits only, then run `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run build` before pushing.
- Never force-push, rebase, or edit another developer's folder. Write the request down instead.
- Coordigent flags overlap on `docs/HANDOFF.md` and on the contracts. Edit only the Dev 2 row of `HANDOFF.md`, and never edit `/contracts`.

## Commands

`npm run dev` (port 3000), `npm test` (720 tests), `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm start` after a build.
If styles look stale, run `rm -rf .next`. Do not run dev and build at the same time (shared `.next`). Next.js here is 16.x with Cache Components, so read `node_modules/next/dist/docs/` before changing routing or rendering.
The demo script is `docs/DEMO_SCRIPT.md`. With no `GEMINI_API_KEY` the whole demo still runs.

## What is built

Every module is real (all five `USE_MOCKS` flags are false in the app). Only tests use a stand-in, for the 3D stage, because jsdom has no WebGL. 720 tests.

- **Two pages, one stage.** `ui/shell/Workspace.tsx` keeps `CarStage` mounted and switches `store.ui.view`. **Car** (`CarView`): name, command bar, `ViewSwitch`. **Future** (`FutureView`): the road. The Future page ends above the bottom bar (measured with `useElementHeight`, a callback-ref hook; the bar mounts after the reveal).
- **The road** (`ui/timeline/Road.tsx`): one big road for the active future. The straight line is "if nothing changes" (the baseline). The road bends away from it by that future's net cost minus the baseline's, month by month: down costs more, up saves money. Math is in `roadMath.ts` (pure, tested): `deltaSeries`, `drawnRange` (never stretches a tiny difference), `roadY`, `assignLevels` (labels never overlap), `spreadLabels`, `smoothSeries` (a median filter for drawing only; numbers always use the raw series). Signposts are draggable decisions (arrow keys also work); decisions inherited from an earlier future are read-only. The readout at the top of the playhead says the effect in dollars with a source label.
- **Opt-in only** (store flags `ui.futureDetails`, `ui.futureCompare`, never saved, off every session): **Details** shows what each decision changed (`effects.ts` re-runs the future without that decision, using `simulationInputs(state)` and the sim facade) plus four supporting numbers. **Other futures** draws every future on the same road with names and where each ends. Asking to compare with a car turns Other futures on.
- The old stacked lanes (`FutureTimeline`, `ScenarioNode`, `Scrubber`) were removed on purpose: separate rows say nothing about what decisions did. Do not bring them back.
- **Your details sheet** (`DetailsSheet`, one header icon): car facts, profile, finance, priorities (tradeoffs and weights), history, 3D display options, low performance, switch sample car, start over. There are no side panels, HUD, or view-options bar. Do not bring them back.
- **Store** (`ui/store/useForkStore.ts`): all flows from `ui/CLAUDE.md`. New: `ui.view`, `ui.detailsOpen`, `setView` (opens Future on month 60 if the playhead is at 0), `addDraft`. Persistence (`fork:v1`) saves only `lowPerformance` plus the session; the page and the sheet are never saved.
- **Command bar** (`ui/command/`): one pill with voice and a plus for manual entry. The suggestion seeds the box and does not submit. With no AI, `extract.ts` proposes events using only what the user wrote: no invented places, miles, prices or counts, a labeled default month if timing is missing, and the keys the sim reads (`location`, `annualMiles`, `childrenDelta`, `fuelPricePerGal`). It belongs in Dev 3's offline interpret; move it when that lands. Confirming "Branch timeline" jumps to the Future page.
- **Entry**: `ui/landing/` (sample cars, VIN, model picker) and `ui/reveal/RevealOverlay` (progress line, spec row, rider question, skip).
- `ui/mocks/index.ts` is the facade with one flag per module. The real slots: data (`@/data/*`, Paarth), sim and decision (`@/sim`, `@/decision`, Anirudh), AI (`fetch` to `/api/interpret` and `/api/explain`, because Gemini stays server side), the stage (`@/ui/3d/CarStage`, lazy and client only). `ui/mocks/local.ts` and `CarStageStub.tsx` are stand-ins.
- **Entry.** Sample cars and the registry's sample VINs open Paarth's explicit Alex demo (`buildDemoTwin`, date pinned to 2026-10-24). The model picker and decoded VINs are ordinary entry with labeled estimates.
- **The pipeline** (store): `evaluate`, `withSensitivity`, then `nextAction(e, twin, be, results)`; `runBreakEven` adds `reproduceBreakEven`. An input change clears a stale threshold. Explanations are requested whenever the evaluation changes and a late answer about old numbers is dropped.
- **Offline.** With the AI unavailable the store reads the sentence with `command/extract.ts` (Paarth's date rules; "second child" is a count) and routes questions by intent. The manual form starts empty and never guesses.
- **Story A on the Future page** (`ui/compare/`): once you compare, the headline is the verdict, then the road, then the next step; "What would change it" and "Why" are opt-in. Numbers match `sim/DEMO.md` and are pinned by tests.
- **A model that will not load never hangs the app:** a reported model error skips the reveal or finishes the morph.

## Design direction (from Ishaan, overrides the old palette in root CLAUDE.md)

Tesla dark site: black and white only, every gray is white at an opacity (`text-ink/60`). No neon, glow, grid, or colored accents. One accent variable, `--fork-accent`, currently white. Source labels differ by shape, not color. Reveal information in layers. Never show the same number twice. No decorative controls.

## Rules that are enforced in code and tests (do not weaken)

AI proposals stay `proposed` in `draftChanges` and change nothing. Only `confirmDrafts` forks a scenario. Scenarios are replaced, never mutated. Every number has a source badge, and a missing source shows as a visible "no source" chip. No probabilities or confidence percentages. No em dashes in copy.

## Open requests (we cannot fix these; they belong to others)

- **Ishaan (contracts, awaiting your OK):** Anirudh and Paarth propose one documentation line in `contracts/INTERFACES.md`: `nextAction(e, twin, be?, results?)`. The UI already passes `results`. Paarth also wants your explicit OK on the four contract review decisions before he marks `REVIEW.md` frozen. The UI reads `driver.provenance.mileage`, and from `FinanceState` only `financeType`, `monthlyPayment`, `leaseEndMonth` and `provenance`.
- **Kareem:** (1) the RAV4 manifest key (fixed on `dev1-3d`, needs the merge). (2) A transparent canvas (`alpha: true`, no scene background); until then the stage's lower edge is masked. (3) Remove the stage's own "Camry / Representative model" label, which collides with the FORK wordmark. (4) Pausing the render loop while the stage is hidden behind the Future page would save the GPU.
- **Paarth:** odometer source (`7524da7`, needs the merge). Until it lands, "Current odometer" shows a visible "no source" chip.
- **Anirudh:** copy nit in the next step detail: "tested between 5000 and 40000" has no thousands separators. The detail is his text, so the UI leaves it alone.

## Next steps

1. Run the second integration merge (see Git state), then rehearse with `docs/DEMO_SCRIPT.md` on a machine with a real GPU. Check Kareem's particle reveal and morph against the store (`onRevealStage`, `onTransitionComplete`, `onModelStatus`).
2. Open items on our side: an assumptions editor (`setAssumption` exists in the store with no UI), cost curves, edit and delete controls on signposts (`canEditEvent`, `editEvent`, `deleteEvent` exist in `@/sim`), and the real Devpost deadline.
3. Do not deploy until Ishaan says so. Make a fallback video once the particle reveal is in.

## Gotchas

- `zsh` on this machine has no `timeout`. Headless Chrome scripts used for screenshots lived in a session scratch folder and are not in the repo.
- jsdom has no `ResizeObserver` or pointer capture. The code guards both.
- A `Marker` named like its lane label (for example "Move to Denver") matches two buttons in tests, so use exact names.
