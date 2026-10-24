# Fork Claude Kit (4 developers): how to use this

## What's in here

```
fork-kit/
  CLAUDE.md                     shared rules + frozen contract (repo root)
  README.md                     this file
  contracts/INTERFACES.md       every boundary, signature, mock, and handoff hour (copy to /contracts)
  dev1-3d/      CLAUDE.md  PROMPTS.md   3D experience           (copy CLAUDE.md to /ui/3d)
  dev2-ui/      CLAUDE.md  PROMPTS.md   product UI + integration (copy CLAUDE.md to /ui)
  dev3-data-ai/ CLAUDE.md  PROMPTS.md   data + AI                (copy CLAUDE.md to /data and /ai)
  dev4-sim/     CLAUDE.md  PROMPTS.md   simulation + decisions  (copy CLAUDE.md to /sim and /decision)
```

## The four roles

| Dev | Role | Folders | Prompt ids |
| --- | --- | --- | --- |
| Dev 1 | 3D experience | `/ui/3d`, `/public/models`, `/public/points`, `/scripts/3d` | D1-A0 to D1-A6 |
| Dev 2 | Product UI + integration + merge owner | `/app` (except `/app/api`), `/ui` (except `/ui/3d`) | D2-B0 to D2-B8 |
| Dev 3 | Data + AI | `/data`, `/ai`, `/app/api` | D3-C0 to D3-C9 |
| Dev 4 | Simulation + decisions | `/sim`, `/decision` | D4-S0 to D4-S9 |

Dev 3 and Dev 4 co-write `/contracts` in hour 1. Dev 1 and Dev 2 review it.

## Setup (Dev 2 does this in hour 0 to 1, prompt D2-B0)

1. Create the repo (Next.js App Router, TypeScript, Tailwind, shadcn/ui).
2. Make folders: `/contracts`, `/contracts/mocks`, `/data`, `/ai`, `/sim`, `/decision`, `/ui`, `/ui/3d`, `/app/api`, `/scripts/3d`, `/public/models`, `/public/points`, `/docs`.
3. Copy `CLAUDE.md` to the repo root and `contracts/INTERFACES.md` to `/contracts/INTERFACES.md`.
4. Copy each developer `CLAUDE.md` into their folders (see the tree above).
5. Create branches `dev1-3d`, `dev2-ui`, `dev3-data-ai`, `dev4-sim`. Everyone starts from the same commit.
6. Keep each `PROMPTS.md` in `/docs` or on a phone. Claude does not need to load them.

Claude Code loads the root `CLAUDE.md` plus any `CLAUDE.md` in the folder it is working in, so each developer automatically gets the shared rules plus their own scope.

## How to run a session

1. One task = one fresh Claude session. Never paste the whole PRD into one session.
2. Paste ONE prompt from your `PROMPTS.md`. Run its kickoff first, once.
3. When it finishes, it prints files created, exports, and the test command. Run the test command yourself.
4. Paste that summary into the next session that depends on it (each prompt says which).
5. If Claude wants to change a shared type or signature, STOP. All four developers agree, one person edits `/contracts`, everyone pulls the same hour.
6. End each working stretch with three lines in `/docs/HANDOFF.md`: what was built, what to call, what is still mock.

## First hour

| Who | Do |
| --- | --- |
| Dev 1 | D1-00, then D1-A0 (asset gate). Send Dev 3 the model, year, trim, paint name, paint hex, match status. |
| Dev 2 | D2-00, then D2-B0 (repo scaffold). |
| Dev 3 | D3-00, then D3-C0 with Dev 4 (contracts and fixtures). Ask the Toyota reps about a TFS sandbox and CAD assets. |
| Dev 4 | D4-00, then D4-S0 with Dev 3 (contracts), then publish sim mocks by hour 2. |

After Dev 1's asset gate, Dev 3 picks the two CarMax listings in the matching colors, snapshots them, and grabs a backup VIN each.

## Handoff schedule

| Hour | From | To | What |
| --- | --- | --- | --- |
| 1 | Dev 1 | Dev 3 | Model, year, trim, paint per car |
| 1 | Dev 3 + Dev 4 | All | Frozen contracts |
| 2 | Dev 1 | Dev 2 | `CarStageStub` |
| 2 | Dev 3 | Dev 2, Dev 4 | Mocks, `SpecSheet` fixtures |
| 2 | Dev 4 | Dev 2 | Sim mocks |
| 5 | Dev 4 | Dev 2 | Real `simulate` |
| 6 | Dev 3 | Dev 2, Dev 4 | Real `buildTwin`, real `SpecSheet`s |
| 8 | Dev 4 | Dev 2 | Real `applyEvents`, `fork` (Gate 1) |
| 8 | Dev 3 | Dev 2 | Real `gapCheck`, `normalizeProfile`, history |
| 11 | Dev 4 | Dev 2 | Real `assessSuitability`, `evaluate` |
| 13 | Dev 3 | Dev 2 | Real `interpret`, `explain` (Gate 2) |
| 14 | Dev 4 | Dev 2 | Real `findBreakEven`, `sensitivity` |
| 15 | Dev 4 | Dev 2 | Real `nextAction` |
| 14 to 18 | Dev 1 | Dev 2 | Real reveal, then morph |

## Gates

1. **Gate 0, hour 1:** contracts frozen, both 3D assets confirmed or labeled representative, branches created.
2. **Gate 1, hour 8:** sample VIN to twin to `simulate` to timeline to `CarStage`, with mock AI.
3. **Gate 2, hour 13:** a brain dump becomes proposed events, one tap confirms, a new branch appears with the real `interpret`.
4. **Gate 3, hour 18:** the 90-second demo runs end to end. Feature freeze.
5. **Gate 4, hour 21 onward:** deployed, fallback video recorded, pitch rehearsed. The real submission deadline overrides the nominal 24 hours.

## Merge protocol

Merge to `main` at least every two hours, through Dev 2, right after the two-hour sync (five minutes: what works, what blocks, what is being cut). `main` must build and pass `npm test` before anyone merges on top. Touch only your own folders. Need a change in someone else's folder? Write a request.

## Pitch honesty (all four should be able to say this)

- The decode, simulation, and recommendation engines work on any Toyota VIN. We built verified 3D configurations for two cars. Scaling that is a licensing and asset problem.
- Service history, loan balances, and lease terms are synthetic until Toyota or TFS provides access. The connection layer is an interface, so real data replaces the synthetic provider without UI changes.
- The AI never does the math. It turns words into structured events and explains computed results.
- A hybrid comparison may genuinely show no break-even point, and Fork says so.
