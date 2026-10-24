# Dev 1: Kareem, 3D experience

Branch: `dev1-3d`
You own: `/ui/3d`, `/public/models`, `/public/points`, `/scripts/3d`
Do not touch: anything else. Need a change in someone else's folder? Write a request and stop.

## Do this first

1. Sync: `git fetch origin && git checkout dev1-3d && git merge origin/main && npm ci`
2. Run the kickoff prompt `D1-00` from `docs/prompts/dev1-3d.md`. It only confirms you understand the job. No code yet.
3. Run `D1-A0`, the asset gate. This is a hard checkpoint. Ask the Toyota reps for CAD or configurator assets first (see `docs/OPEN_QUESTIONS.md`). Then try Sketchfab (downloadable, CC-BY is fine, avoid NonCommercial), then TurboSquid or CGTrader. Need a 2022 Camry SE and a 2024 RAV4 Hybrid XLE. No exact match means the car is labeled `representative`.
4. Run `D1-A1` to ship `CarStageStub`.

## What you owe

| When | To | What |
| --- | --- | --- |
| Hour 1 | Paarth (Dev 3) | For each car: model, year, trim, paint name, paint hex, match status |
| Hour 1 | Paarth (Dev 3) | `/public/models/manifest.json` (he reads it for the registry) |
| Hour 2 | Ishaan (Dev 2) | `CarStageStub` and `preloadCars` stub, with the final `CarStageProps` |
| Hours 14 to 18 | Ishaan (Dev 2) | The real reveal, then the Camry to RAV4 morph |

## What you are waiting on

Nothing for the first two hours. Review `/contracts` when Paarth and Anirudh freeze it.

## Rules that are easy to get wrong

- Never claim `exact` in the UI. Show the label for the `matchStatus` you are given.
- Never block interaction. Skipping the reveal must leave a fully usable app.
- All particle motion happens in the vertex shader. Never update positions in JS per frame.
- Commit the license and credit line for every asset in the manifest.
- Do not read or compute any simulation value. You render what you are told.

## Cut line

Cut in this order: wireframe mode, point-cloud mode, low-quality tuning, reveal polish. Never cut the real viewer, a working reveal, or a morph with the cross-fade fallback.

## Every session

End by printing files created, exports with signatures, and the run or test command. Paste that into the next session that depends on it. When you finish a stretch, fill your row in `docs/HANDOFF.md`: what you built, how to call it, what is still mock.
