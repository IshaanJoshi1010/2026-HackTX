# D3-C9 audit, 2026-10-24

Scope: Dev 3 branch dev3-data-ai, including the shipped data modules and the existing mocked AI/API test suite. Audit completion does not mean the full integrated UI/3D demo or live model access is accepted.

## Results

| Check | Result | Evidence / limit |
| --- | --- | --- |
| Full tests | PASS | 188 tests across 13 files. |
| TypeScript | PASS | npx tsc --noEmit. |
| Repository lint | PASS | npm run lint, not just changed-file lint. |
| Production build | PASS | npm run build; both API routes registered. |
| Primary Camry identity/color | PASS | 2022 SE, Midnight Black Metallic, primary snapshot agrees; representative status. |
| Primary RAV4 identity/color | PASS | 2024 Hybrid XLE, Silver Sky Metallic, primary snapshot agrees; representative status. |
| Real model asset/manifest acceptance | FAIL — dependency missing | No public/models/manifest.json or assigned modelAsset paths in this checkout. Full visual matching cannot be verified. No exact label is claimed. |
| Invalid VIN produces no twin | PASS | Independent black-box regression; invalid vehicle yields typed failure with no twin. |
| Unsupported VIN label | PASS | Offline unknown VIN is unsupported/unavailable; mocked unknown model is unsupported; incomplete decoded config cannot become a twin. |
| Offline primary twin paths | PASS | Both primary twins built with explicit network failure stub, Alex's synthetic profile and matching local providers; no fetch calls. |
| Twin value provenance | PASS | Camry: 169 semantic leaf values labeled; RAV4: 105; missing paths: none. Citation/source/provenance containers excluded as metadata. |
| Numeric spec provenance | PASS | 29 numeric leaf values per sheet, 58 total; every label and source string present, including nested maintenance and depreciation. |
| Four listing JSON snapshots | PASS | No mismatch with saved registry snapshots; identity, paint, drive, synthetic mileage/price metadata preserved. |
| External dealer screenshots | NOT APPLICABLE | None exist. User-authorized synthetic JSON replaces real dealer sourcing/screenshots; this is not external listing verification. |
| Provider contradiction handling | PASS — fixed | Explicit payment and lease-end mismatches now require confirmation instead of being silently overwritten. Regression tests cover both. |
| Twenty extraction cases / equivalent phrasings | PASS — mocked only | Existing C8a/C8b suite verifies authored structured cases, proposals and date transformations. Not real model accuracy. |
| Live Gemini accuracy/access | NOT VERIFIED | No live request in this workstream; missing-key/manual behavior and mocked generation are tested. |
| Real Smartcar/TFS connections | NOT IMPLEMENTED | Smartcar-style provider is a local simulation; TFS remains a deliberate not-configured stub. |
| README/export documentation | PASS | data/README.md covers runtime exports, types, inputs/outputs, source labels and offline boundaries. |

## Primary twin evidence

The independent audit uses the saved primary VINs, identifies offline, then builds each twin with Alex's explicitly synthetic profile and the selected SyntheticProvider. Only the saved EPA MPG values are sourced externally. Camry has 34 fictional history records ending at 48,000 miles; RAV4 has 18 ending at 24,000 miles. All history values remain synthetic.

No missing source paths were found in those two demo twins. The strict audit reports missing source paths if vehicle values are modified away from the saved registry without supporting provenance; it does not assign invented labels. Structured odometer provenance is provided through buildTwinWithDetails metadata, with a parallel source note in vehicle.specSources. This is an unchanged-contract sidecar, not a new VehicleTwin field.

Every actual numeric leaf returned by getSpecs has a source label/string. EPA MPG is sourced. Seats, rear-seat width, cargo, curb weight and MSRP are synthetic assumptions. Maintenance intervals/costs and all depreciation-curve/mileage adjustments are illustrative. No EPA default fuel-cost figures or zero-as-cargo measurements are exported.

## Fix made during C9

The builder previously checked financeType contradictions but could silently prefer a provider payment or lease end over supplied values. C9 adds explicit equality checks and typed confirmation-required errors for those two conflicts. No UI, sim, decision, AI or shared-contract implementation was modified. New data/audit.ts and data/audit.test.ts make the provenance and black-box checks repeatable.

## Listing and asset findings

All four JSON snapshots match the registry; no JSON mismatch was found. The primary/backup identifiers, paint names/codes/hexes, prices and odometers are fictional, not real VIN assignments, CarMax advertisements or verified Toyota colors. Original listing screenshots were not generated or claimed.

The visual asset gate remains unmet in this branch. Kareem/Dev 1 must supply the actual manifest/paths and review model/year/trim/paint/geometry before anyone can claim exact. Dev 3 deliberately did not edit public/models or UI ownership folders to manufacture acceptance. The data retains representative status and an explicit unavailable asset path.

## Pitch disclosures

- Alex, driver/finance details, listing identities, VIN-format lookup keys, paint selections, mileage and service history are synthetic demo data.
- Vehicle dimensions, seats, cargo, curb weight and MSRP are synthetic assumptions. EPA MPG remains sourced from the saved fixture; fuel price is an illustrative placeholder.
- Maintenance schedules/costs, depreciation, financing estimates, tax/fee/insurance seeds and lease heuristics are illustrative or estimated, not service advice, a real valuation or a lender quote.
- Smartcar-style behavior is local simulation. No actual connected-car, account, TFS, CARFAX or diagnostic access exists.
- Gemini integration code and fallbacks are tested with mocks; real extraction accuracy and account/model access are unverified. Manual onboarding must remain available.
- 3D assets/fit are unverified here; models must remain representative. Child-seat compatibility and packing fit are not measured.
- Dates use the fixed 2026-10-24 demo snapshot. No fictional history should be described as externally retrieved or updated live.
- Final UI confirmation, 3D integration, simulation/recommendation behavior and end-to-end demo rehearsal require team integration. This audit certifies the tested Dev 3 scope only.

## Reproduce

C9_REPORT=1 npx vitest run data/audit.test.ts --disableConsoleIntercept
npm test
npx tsc --noEmit
npm run lint
npm run build

New export: auditTwinSources(twin: VehicleTwin, metadata: Pick<TwinMetadata, "mileage">): SourceAudit. SourceAudit contains labeled, missing and per-field source labels. Existing integration signatures are unchanged.
