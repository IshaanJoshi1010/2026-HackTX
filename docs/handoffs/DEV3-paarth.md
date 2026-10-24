# Dev 3: Paarth, data and AI

**Data policy update, 2026-10-24:** Paarth approved plausible fabricated demo data after consulting Toyota. Use labeled synthetic listings/VINs and assumptions instead of waiting for real CarMax records. Keep sourced EPA MPG and honest visual-match labels. See `/data/SYNTHETIC-DATA.md`. This supersedes the real-listing prerequisites below.

Branch: `dev3-data-ai`
You own: `/data`, `/ai`, `/app/api`. You co-write `/contracts` with Anirudh.
Do not touch or import: `/sim`, `/decision` (Anirudh), `/ui` (Ishaan, Kareem).

## Do this first

1. Sync: `git fetch origin && git checkout dev3-data-ai && git merge origin/main && npm ci`
2. Your branch already has `data/fixtures/epa.json`: EPA fuel economy for the 2022 Camry LE/SE (FWD and AWD) and the 2024 RAV4 Hybrid AWD. Use it for the `SpecSheet` mpg fields. Read its `_meta.notes` first: EPA does not report RAV4 cargo (0 means not reported), and its fuel cost field must not be displayed.
3. Run the kickoff prompt `D3-00` from `docs/prompts/dev3-data-ai.md`. It only confirms you understand the job. No code yet.
4. Run `D3-C0`, contracts and fixtures. You go first on `/contracts`: create `/contracts/index.ts`, the Zod schemas, your fixtures, and your mocks. Push to your branch and tell Anirudh and Ishaan right away. List the contract questions for Anirudh to review before anything is frozen.
5. Ask the Toyota reps (see `docs/OPEN_QUESTIONS.md`): is there a Toyota Financial Services sandbox, and is there CAD for the two cars? TFS sandbox access is requested through api_services@toyota.com, needs approval, and uses OAuth2. Do not assume it. `TFSProvider` stays a stub unless a sponsor gives credentials.
6. After Kareem's asset gate, pick two CarMax listings in the matching colors. Copy each by hand, save the JSON, and grab one backup VIN per car. Never scrape. Files go in `/data/listings`.
7. Then `D3-C1`, VIN validation and decode.

## What you owe

| When | To | What |
| --- | --- | --- |
| Hour 1 | Anirudh, everyone | Frozen contracts, co-written with Anirudh |
| Hour 2 | Ishaan, Anirudh | Mocks and `SpecSheet` fixtures |
| Hour 6 | Ishaan, Anirudh | Real `buildTwin` and real `SpecSheet`s |
| Hour 8 | Ishaan | Real `gapCheck`, `normalizeProfile`, history |
| Hour 13 | Ishaan | Real `interpret`, `explain` |

## What you are waiting on

Kareem, at hour 1: model, year, trim, paint name, paint hex and match status for each car.

## Rules that are easy to get wrong

- A VIN gives make, model, year, usually trim, engine and fuel type. It does not give paint, mileage, history, finance, or anything about the driver.
- `exact` only when the registry entry has all five flags true: model, year, trim, paint, geometry.
- The AI never produces a number. It turns words into structured events and explains numbers it is handed. `explain` rejects any output with a number that was not in the input.
- Put `GEMINI_API_KEY` and `GEMINI_MODEL` in `.env.local`. Never commit a key. Check Google's docs for the current model name before coding.
- The full demo must work with Gemini and NHTSA offline, using seeded data.

## Cut line

Cut in this order: Smartcar simulation, extra Toyota specs beyond the two cars, return-visit prompt, explain polish. Never cut the registry, the offline path, honest match labels, the confirm gate, or the 20-dump test.

## Every session

End by printing files created, exported signatures, and the test command. When you finish a stretch, fill your row in `docs/HANDOFF.md`.
