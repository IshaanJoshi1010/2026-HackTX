# Dev 2: Ishaan, product UI, integration and merge owner

Branch: `dev2-ui`
You own: `/app` (except `/app/api`), `/ui` (except `/ui/3d`)
Do not touch: the canvas (Kareem), `/data`, `/ai`, `/app/api` (Paarth), `/sim`, `/decision` (Anirudh). You review `/contracts` but do not write it.

## Do this first

1. Sync: `git fetch origin && git checkout dev2-ui && git merge origin/main && npm ci`
2. The repo scaffold (`D2-B0`) is already done and pushed: Next.js, TypeScript, Tailwind, shadcn/ui, Vitest, CI, folders, branches, PR template. Do not redo it. Verify with `npm run build && npm test`. CI on `main` is already green.
3. Run the kickoff prompt `D2-00` from `docs/prompts/dev2-ui.md`. It only confirms you understand the job. No code yet.
4. Run `D2-B1`: shell, theme, and the store, all on mocks. Until Kareem's `CarStageStub` lands at hour 2, use a throwaway local stub with the same props and delete it later.
5. Confirm the real submission deadline on Devpost. Hacking ends 5pm Sunday Oct 25, but the Devpost cutoff may be earlier.

## Merge owner duty

Every branch lands on `main` through you.
- Merge at least every two hours, right after a five-minute sync: what works, what is blocked, what is being cut.
- `main` must build and pass `npm test` before anyone merges on top.
- Check each PR against the template: builds, tests pass, only touched own folders, `docs/HANDOFF.md` updated, no contract change without all four devs.
- Run the gates: hour 1 contracts frozen, hour 8 sample VIN to timeline, hour 13 brain dump to branch, hour 18 full 90-second demo and feature freeze, hour 21 deployed with a fallback video.

## What you receive

| When | From | What |
| --- | --- | --- |
| Hour 2 | Kareem | `CarStageStub` |
| Hour 2 | Paarth | Mocks and `SpecSheet` fixtures |
| Hour 2 | Anirudh | Sim mocks |
| Hour 5 | Anirudh | Real `simulate` |
| Hour 6 | Paarth | Real `buildTwin` and real `SpecSheet`s |
| Hour 8 | Anirudh, Paarth | Real `applyEvents`, `fork`, `gapCheck`, `normalizeProfile`, history |
| Hour 11 | Anirudh | Real `assessSuitability`, `evaluate` |
| Hour 13 | Paarth | Real `interpret`, `explain` |
| Hours 14 to 15 | Anirudh | Real `findBreakEven`, `sensitivity`, `nextAction` |
| Hours 14 to 18 | Kareem | Real reveal, then morph |

You swap each mock for the real module one `USE_MOCKS` flag at a time in `/ui/mocks/index.ts`, and run the demo after each swap.

## What you owe

Nothing others depend on. You are the only one who wires modules together, so you pass `getSpecs` output and `VehicleConfig` into Anirudh's functions as arguments. He never imports `/data`.

## Rules that are easy to get wrong

- Every number renders through `SourceBadge`, and source labels come from the data, never hardcoded.
- Every control reads or writes the store. No decorative controls.
- Never show a probability or confidence percentage. Robustness reads "held in X of Y tested cases."
- Unconfirmed proposals change nothing.

## Cut line

Cut in this order: confidence meter, event dragging, voice button, cost curves. Never cut the timeline, the confirm flow, the comparison, or the break-even visual.

## Every session

End by printing files created, components with props, and the run or test command. When you finish a stretch, fill your row in `docs/HANDOFF.md`.
