# Developer 3: Data and AI (`/data`, `/ai`, `/app/api`)

Read the root `CLAUDE.md` and `/contracts/INTERFACES.md` first. Copy this file to `/data/CLAUDE.md` and `/ai/CLAUDE.md`.

## Mission

Own everything Fork knows about the car and the person, and the only code that talks to an LLM. Output one: a validated `VehicleTwin`. Output two: validated, confirm-gated proposals from the brain dump box.

## You own / you do not own

| You own | You do not own |
| --- | --- |
| `/data`, `/ai`, `/app/api` | Simulation or any displayed number (Dev 4) |
| VIN validation and decode, registry, specs, history | UI (Dev 2), 3D assets (Dev 1) |
| Normalizer, defaults, gap check, tradeoff mapping | Verdicts and break-even (Dev 4) |
| Providers, Gemini routes, extraction, explanation | What the user's profile is: only the confirm gate decides |

You co-write `/contracts` with Dev 4 in hour 1. Never import from `/sim` or `/decision`.

## File map

```text
/data/vin.ts, decode.ts, registry.ts, specs.ts, history.ts, defaults.ts, normalize.ts,
  gapCheck.ts, tradeoffs.ts, twin.ts
/data/listings/camry-primary.json, camry-backup.json, rav4-primary.json, rav4-backup.json
/data/providers/types.ts, synthetic.ts, smartcar.ts, tfs.ts, index.ts
/data/fixtures/alex.ts, vehicles.ts, finance.ts
/ai/schema.ts, dates.ts, mapper.ts, interpret.ts, explain.ts, numberCheck.ts,
  manualForms.ts, returnVisit.ts, testDumps.ts, prompts/system.ts
/app/api/interpret/route.ts, /app/api/explain/route.ts
```

## Exports

Exact signatures are in `/contracts/INTERFACES.md`: `validateVin`, `identifyVehicle`, `buildTwin`, `normalizeProfile`, `applyDefaults`, `gapCheck`, `mapTradeoffs`, `getHistory`, `getSpecs`, `interpret`, `explain`, and the `ConnectionProvider` implementations.

## Rules that are easy to get wrong

1. **NHTSA.** `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/<vin>?format=json`, 3000 ms timeout. Sample VINs never hit the network.
2. **Exact match.** `exact` only when the registry entry has all five flags true: model, year, trim, paint, geometry. Any false means `representative`. Unknown model means `unsupported`.
3. **A VIN does not give** paint, mileage, history, finance, or anything about the driver. Those come from the registry, the listing snapshot, the provider, or the user.
4. **Annual miles from a commute.** `milesEachWay x 2 x daysPerWeek x 52` plus a labeled non-commute estimate (default 4,000).
5. **Priority mapping.** Start every weight at 0.20. For each pick winner +0.10, loser -0.10 with a floor of 0.05, renormalize to sum 1, round to 2 decimals, give the remainder to the largest. Pairs: `cost_vs_cargo`, `longevity_vs_fuel`, `comfort_vs_cost`. Same picks give the same weights.
6. **Gap check order.** First that applies: `financeType` (view = compare), `cargoNeed` (compare), `commuteMilesOneWay` (when a commute change is vague), `monthlyBudget` (only if a budget phrase was captured). Return `null` if every visible number is backed. Chips questions always include "I'm not sure."
7. **Relative dates.** Month 0 is the current month. "Next year" is 12. "In N years" is 12N. A bare year (2029) is June of that year, flagged `inferred`. "Wife's pregnant" is +1 child at month 9, flagged `inferred`. The helper takes `todayISO` so it is pure.
8. **Gemini.** `GEMINI_API_KEY` and `GEMINI_MODEL` are server-side only. Check Google's docs for the current model name and SDK before coding. Send only vehicle model, year, relevant profile fields, and event summaries.
9. **Model output.** Zod-validate, retry once, then return a `CLARIFY` result. Network or key failure returns `{ aiAvailable: false }`.
10. **Explain.** The model gets computed numbers and writes prose. `numberCheck` extracts every number from the output and rejects it if any number is not in the input. On rejection use a deterministic template.
11. **Never.** No arbitrary generated code. No AI write to the profile or a scenario. No invented diagnoses, vehicle histories, or quotes. Never scrape CarMax.
12. **TFS.** Sandbox access is requested via api_services@toyota.com, needs approval, uses OAuth2. Not assumed. `TFSProvider` stays a stub unless a sponsor gives credentials. Ask the Toyota reps in hour 1.

## Defaults table (`/data/defaults.ts`)

| Field | Default | Source label | Upgrade |
| --- | --- | --- | --- |
| Annual miles | 12,000 | estimated | Commute sentence |
| Cargo need | From household size | estimated | Inline Low/Medium/High |
| Fuel price | Local average | illustrative | User override |
| Maintenance | Seeded schedule | illustrative | Not editable |
| Trade-in value | Seeded depreciation | illustrative | Replace branch edit |
| New car price, tax, fees, interest | Seeded | illustrative | One-tap edit |
| Insurance | Seeded | illustrative | Tier 3 edit |
| Finance | From model, year, typical term | estimated | Payment field |
| Priority weights | From tradeoff picks | derived | Nudge |

Tiers: Tier 1 (vehicle, mileage, household size, one priority) gates the first result. Tier 2 and 3 default and upgrade later. Finance: paid off needs nothing more; loan asks payment else estimates; lease asks payment and end date else estimates; unknown estimates and makes the next action "get a payoff quote."

## Tasks

- **C0 (hour 0 to 1, with Dev 4).** `/contracts/index.ts`, Zod schemas, fixtures, your mocks.
- **C1 (1 to 4).** `validateVin`, `identifyVehicle`, NHTSA client with mock.
- **C2 + C3 + C7 (3 to 6).** Registry with real listing data, `SpecSheet` for both cars, `buildTwin`. Real twin to Dev 2 and real specs to Dev 4 at hour 6.
- **C4 (6 to 8).** Ownership history. Real by hour 8.
- **C5 + C8a (8 to 11).** Normalizer, defaults, `gapCheck`, `mapTradeoffs`, then the extraction schema and the 20 messy dumps.
- **C8b (11 to 14).** Gemini routes, `interpret`, `explain`, `numberCheck`, manual forms. Gate 2 at hour 13.
- **C6 (14 to 18).** Providers, return-visit prompt, hardening, help Dev 2 integrate.
- **C9 (18 to 21).** Full test and audit pass.

## Definition of done

- [ ] Both sample VINs return correct year, trim, color, asset. `exact` only if all five flags are true.
- [ ] Invalid VIN creates no twin. Valid unsupported VIN is never `exact`.
- [ ] Everything works with the network off.
- [ ] 20 test dumps pass, including contradictions, vague timing, multiple events, unsupported questions, and "hi."
- [ ] Three phrasings of the demo sentence give equivalent events.
- [ ] `explain` rejects an invented number. No key means `aiAvailable: false`, no crash.
- [ ] Every field has a source label. Every synthetic record says synthetic.

## Cut line (cut in this order)

Smartcar simulation, extra Toyota specs beyond the two cars, return-visit prompt, explain polish. Never cut the registry, the offline path, honest match labels, the confirm gate, or the 20-dump test.

## Outside-code to-dos

1. Wait for Dev 1's asset gate, THEN pick CarMax listings in the matching colors. Copy by hand, screenshot, save JSON, grab one backup VIN per car.
2. Ask Toyota reps about a TFS sandbox and any CAD assets.

## Session hygiene

One task per Claude session. End each session by printing: files created, exported signatures, and the test command.
