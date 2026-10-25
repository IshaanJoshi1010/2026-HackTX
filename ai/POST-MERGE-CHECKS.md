# Dev 3 post-merge checks, 2026-10-24

Synced origin/main at e935e1f into dev3-data-ai with the requested fetch/merge/npm ci/push sequence. Installation completed with zero reported vulnerabilities. Changes in this working stretch stay in data, ai, app/api and contracts, plus Paarth's own HANDOFF row and the explicitly requested OPEN_QUESTIONS update.

## Listings and asset handoff

All four approved synthetic snapshots already exist and validate: camry-primary, camry-backup, rav4-primary, rav4-backup. No scraping or invented dealer screenshots. Primary and backup paint choices agree per car:

- Camry 2022 SE: Midnight Black Metallic, #1B1B1B, code 218.
- RAV4 2024 Hybrid XLE: Silver Sky Metallic, #A5A9AB, code 1D6.

Posted to the Coordigent team channel as requested. Kareem acknowledged the values and will fill the manifest paint fields, retain representative, and align its RAV4 vehicleId with rav4-2024-hybrid-xle. The merged GLBs and manifest exist now; geometry/year/trim are still representative, and data registry asset paths remain unassigned until the asset integration handoff. No exact-match verification was invented. Original C9 reports describe their historical checkout, not the current merged asset inventory.

## Contracts

contracts/REVIEW.md records registry verification flags, canonical odometer source at driver.provenance["mileage"], nonnegative scenario time and ISO history dates. Real and mock twin builders now supply the odometer label; the audit checks agreement with the metadata sidecar. No shared value fields or enum values were added. Older persisted twins are still schema-compatible; consumers may rebuild missing labels when migrating.

Anirudh explicitly confirmed FinanceState, VehicleSignals and AccountData sufficient and proposed the optional fourth nextAction results parameter. Dev 3 approved that clarification. Ishaan's agent acknowledged ownership and UI compatibility, but explicitly declined to freeze on Ishaan's behalf. Therefore the new freeze and canonical INTERFACES.md edit remain pending Ishaan's explicit OK. Ownership conflict alerts were clarified as false positives from synchronization and different mock paths; no competing contract edits were taken.

## API and model checks

Both production HTTP routes were checked with GEMINI_API_KEY disabled without reading or printing the secret:

- POST /api/interpret: HTTP 200, aiAvailable false.
- POST /api/explain: HTTP 200, aiAvailable false, usedFallback true, original computed action preserved.

The explanation route's no-key availability field is additive. The canonical explain() result remains text and usedFallback. With a configured key, no availability claim is added merely from its presence. Interpret/explain failures continue to fall back; numeric guard regressions reject invented numbers and unsupported percentage claims.

The first current live phrasing test matched only the short phrasing; the other outputs rewrote quotes or carried a date from relocation into undated mileage. We kept the grounding guard, improved field-specific retry feedback and instructed the model not to carry dates between clauses. The response schema now constrains quote to exact source text: the original prompt and its preserved clauses. It never creates a quote or calculates a numeric value.

With the tightened quote schema, all three phrasings produced equivalent live proposed events across a bounded full attempt and one targeted service-timeout retry:

- annualMiles 20000 at month 0.
- location Denver at month 12.
- children 2 at month 32, with June timing for the bare year labeled inferred.

Confirmed profile inputs remained unchanged. This is successful coverage of these three phrasings, not a clean uninterrupted run or a full 20-case production reliability claim. Sanitized evidence is in ai/fixtures/post-merge-demo-phrases.json; other live cases retain the limits documented in ai/LIVE-EVALUATION.md. No key, account credentials or real personal records are in either fixture.

## Integration and hosting

Exact imports/calls and browser requests are in ai/INTEGRATION.md, with the Alex story in data/DEMO-HANDOFF.md. Client code calls the API routes; it does not import server-only AI modules. Ishaan owns wiring the store and switching its mock flags. Preserve explicit confirmation and manual entry.

Hosting needs server-only GEMINI_API_KEY and GEMINI_MODEL=gemini-3.1-flash-lite to reproduce the tested model choice. The latter is public configuration. No NEXT_PUBLIC_ key or client bundle secret. Local secret remains only in ignored .env.local.

## Sponsor answers

Recorded Paarth's earlier report that the Toyota representative permits plausible fabricated demo data. No confirmed TFS sandbox, Toyota CAD delivery or identification of the unnamed source was supplied; those checkboxes stay open. Existing representative Sketchfab models are not evidence of a Toyota CAD response.

## Verification

633 tests across 49 files pass; TypeScript, full lint and production build checks run for this patch. The new review tests cover agreed provenance/time/date/supporting shapes. Quote-schema and retry tests cover original-order quotes and per-clause timing. No new public function signatures; the existing calls are listed in ai/INTEGRATION.md.

Commands: npm test; npx tsc --noEmit; npm run lint; npm run build.

## Subsequent live revalidation

The five earlier unverified cases (demo, multiple, pure-rav4-question, paid-off, break-even) now all pass in one targeted run on the source-grounded interpreter: one call each, no transport errors, confirmed context unchanged. See ai/fixtures/live-revalidation.json and the latest update in ai/LIVE-EVALUATION.md. This resolves the old five-case status; a fresh complete 20-case pass remains a separate reliability check.
