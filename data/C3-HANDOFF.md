# D3-C3: vehicle spec sheets

Implemented for the 2022 Camry SE FWD and 2024 RAV4 Hybrid XLE AWD under Paarth's approved synthetic-data policy. No shared contract changed. C7 has not started.

## Created and updated

Created data/specs.ts, data/specs.test.ts and this handoff. Updated data/registry.ts and data/decode.ts to use the C3 sheets. Updated the Dev 3 handoff row. C0 mockSpecs retains its original illustrative fixtures so existing mock behavior does not change silently.

## Exports

```ts
getSpecs(vehicleId: string): SpecSheet;
getSpecDetails(vehicleId: string): VehicleSpecDetails;
getSpecEntries(): SpecEntry[];
```

`requiredFields` is an immutable list of the required SpecSheet keys. `supportedSpecIds` lists the two supported IDs. `VehicleSpecDetails` includes the sheet, powertrain, drivetrain, numericSources, fitStatus, officialResources and notes. NumericSource contains `{ label: Source; source: string }`.

Dev 2 passes the result of getSpecs into Dev 4's simulation context. Dev 4 does not import /data directly. Use getSpecDetails for detailed source strings and disclosure text. Per-field labels remain in the canonical SpecSheet.sources map, which is unchanged.

## Numbers and assumptions

- EPA city/highway/combined MPG is sourced from saved records 44348 (Camry FWD) and 47392 (RAV4 Hybrid AWD). Numeric source records include the official EPA API URL, fixture path and fetch date. No network is needed at runtime.
- Seats, rear-seat width, cargo, curb weight and original MSRP are plausible synthetic demo assumptions. They are not verified Toyota specifications. MSRP differs from the fictional used-listing purchase price.
- Maintenance has separate recurring tasks at 5k, 10k, 30k, 60k and 90k miles. Both schedule and incremental costs are illustrative. These are not overlapping service packages or official Toyota maintenance advice. Dev 4 owns calculating when they occur and aggregating spend.
- Depreciation has five retained-MSRP fractions (index 0 is after year 1) and a per-10k-mile fraction adjustment. All are illustrative. Dev 4 owns the formulas; confirm the mileage adjustment baseline and clamping rules with Anirudh rather than interpreting these as a real market forecast.
- numericSources covers every numeric leaf, including maintenance array members and each depreciation-curve element. Labels match the corresponding top-level SpecSheet.sources entry.
- Car-seat/packing fit booleans remain false, with explicit needs_verification statuses in the sidecar details. Synthetic rear-seat width is not a child-seat compatibility measurement.
- officialResources is empty because the user has not confirmed official Toyota resource URLs. EPA source URLs are citations, not Toyota resource recommendations.

## Integration

Registry MPG/seats/cargo/MSRP now come from getSpecs, preventing differences between the registry and simulation input. Per-field source strings are included in registry specSources. The default decoder also receives strict model/year/trim/powertrain/drivetrain descriptors via getSpecEntries. FWD Camry data cannot fill an AWD decode. Missing paint/assets still prevent an incomplete network decode from being returned as a full twin-ready vehicle.

## Validation

npm test
npx tsc --noEmit
npx eslint data/specs.ts data/specs.test.ts data/registry.ts data/decode.ts
npm run build

Tests verify all required fields, a label and source string for every numeric leaf, correct EPA rows, no EPA default fuel costs, no unreported-zero cargo, unverified fits, nested illustrative assumptions, strict decoder merge, registry consistency, unknown IDs, caller isolation and offline operation.

Next task: C7 twin builder, after confirming or handling the outstanding supporting-contract questions. C4/C5 provide its history and normalizer dependencies; use explicitly documented mocks until those tasks land. No history, normalizer, provider or AI implementation was added in C3.
