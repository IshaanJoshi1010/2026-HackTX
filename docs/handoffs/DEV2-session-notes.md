# Dev 2 session notes (Ishaan), 2026-10-24

For whoever works on `dev2-ui` next (a person, or another AI tool). Read this, then `CLAUDE.md`, `contracts/INTERFACES.md`, and `ui/CLAUDE.md` (updated today). Never edit a folder you do not own: `/ui` and `/app` (except `/app/api`) are ours.

## Git state: read before running any git command

- Branch `dev2-ui`. **Nothing is committed.** Nothing is pushed.
- A merge of `origin/dev3-data-ai` is **staged but not committed** (`MERGE_HEAD` ac9083d). It brought in `contracts/`, `data/fixtures/`, and `zod`. Do not run `git pull`, `git merge`, `git checkout`, or `git stash` until it is resolved.
- Safe order: (1) `git commit` the staged merge alone, (2) then `git add ui app package.json package-lock.json docs` and commit our work. Ask Ishaan before committing or pushing.
- Full backup, including `.git` and the pending merge: `/Users/ishaan/dev/2026-HackTX-backup-2026-10-24`.
- Coordigent warned that Anirudh's agent edits `contracts/mocks/index.ts`, `contracts/REVIEW.md`, and `docs/HANDOFF.md`. We did not change the first two. Our Dev 2 row in `docs/HANDOFF.md` is filled but stale. Coordinate with Anirudh before touching HANDOFF.

## Commands

`npm run dev` (port 3000), `npm test` (155 tests), `npx tsc --noEmit`, `npm run lint`, `npm run build`.
If styles look stale, run `rm -rf .next`. Do not run dev and build at the same time (shared `.next`). Next.js here is 16.x with Cache Components, so read `node_modules/next/dist/docs/` before changing routing or rendering.

## What is built

- **B1 done:** shell, theme, store, mocks, tests. **B3 mostly done early:** the timeline.
- `ui/store/useForkStore.ts`: all flows from `ui/CLAUDE.md`. Persistence in `persistence.ts` (`fork:v1`, validated by Zod, derived results are recomputed on load, dropped if the `USE_MOCKS` mix changed).
- `ui/mocks/index.ts`: one `USE_MOCKS` flag per module (car, data, ai, sim, decision), all true. Flipping a flag before the real module is wired throws a clear error. `ui/mocks/local.ts` holds throwaway stand-ins. `ui/mocks/CarStageStub.tsx` is a throwaway for Kareem's stub.
- `ui/timeline/`: custom SVG timeline (not React Flow). `layout.ts` is pure and has its own tests. One lane per real Scenario, branches leave the parent at the fork month, draggable event markers (arrow keys also work), milestone ticks, focus mode, inherited events locked in focus mode.
- `ui/shell/`: the car fills the screen. Panels float and start closed. The HUD (`Hud.tsx`) shows a hint, then one headline number, then more on request, and hides its extras while Insights is open.
- `ui/profile/`: `SourceBadge`, `DataRow`, `Stat`, `sources.ts`, `metricSources.ts`.
- Still placeholder: `ui/shell/B1Placeholders.tsx` (landing) is a throwaway for B2. The command box slot draws nothing on purpose.

## Design direction (from Ishaan, overrides the old palette in root CLAUDE.md)

Tesla dark site: black and white only, every gray is white at an opacity (`text-ink/60`). No neon, glow, grid, or colored accents. One accent variable, `--fork-accent`, currently white. Source labels differ by shape, not color. Reveal information in layers. Never show the same number twice. No decorative controls.

## Rules that are enforced in code and tests (do not weaken)

AI proposals stay `proposed` in `draftChanges` and change nothing. Only `confirmDrafts` forks a scenario. Scenarios are replaced, never mutated. Every number has a source badge, and a missing source shows as a visible "no source" chip. No probabilities or confidence percentages. No em dashes in copy.

## Open requests (we cannot fix these; they belong to others)

- **Paarth:** add `mileage` to `alexProfile.provenance` (UI reads `driver.provenance.mileage`; until then Mileage and Upkeep show "no source"). Export `listSampleVehicles()` from the registry. Make `gapCheck` treat "I'm not sure" as answered. Paint is `"TODO: ..."` in both fixtures (UI hides it).
- **Anirudh:** real `simulate` and friends are on `origin/dev4-sim`. Notes from his agent: points cover months 1 to 60 (UI already looks points up by month); `fuelSpend` and `maintenanceSpend` are per month, not running totals (the UI's HUD and Insights label them as totals, so fix at swap); `canEditEvent`, `editEvent`, `deleteEvent`, `affectedFromMonth` exist; editing an inherited event throws `InheritedEventError`; the replacement event payload can carry `price` and `mileage`; ctx must include the RAV4 specs; fork ids are deterministic. Confirm `payload.vehicleId` on `vehicle_replacement` (the UI reads it) and which inputs feed each projected number (`metricSources.ts`).
- **Kareem:** the real canvas needs a transparent background (the floor glow sits behind it). Delete `ui/mocks/CarStageStub.tsx` and import `CarStageProps` and the reveal stage type from `@/ui/3d` when his lands.

## Next steps

1. Commit safely (see Git state).
2. B2: real landing (VinEntry, SampleCarPicker, ModelYearPicker), RevealOverlay with the rider chips, ProfileConfirmCard, history in the left panel. Replaces `B1Placeholders.tsx`.
3. B4: command box, live profile card, confirm flow, questions, tradeoff cards, manual forms.
4. B5 and B6: comparison, break-even, then swap mocks for real modules one flag at a time (run the demo after each). Add `canEditEvent`, `editEvent`, `deleteEvent` to the `SimApi` facade, and add edit and delete controls on timeline markers.
5. Confirm the real Devpost submission deadline.

## Gotchas

- `zsh` on this machine has no `timeout`. Headless Chrome scripts used for screenshots lived in a session scratch folder and are not in the repo.
- jsdom has no `ResizeObserver` or pointer capture. The code guards both.
- A `Marker` named like its lane label (for example "Move to Denver") matches two buttons in tests, so use exact names.
