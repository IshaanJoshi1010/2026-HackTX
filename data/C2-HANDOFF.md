# D3-C2: synthetic registry and honest matching

Status: registry and match logic implemented under Paarth's approval to use plausible fictional project data. See SYNTHETIC-DATA.md. C3 has not started.

## Created files

- data/listings/camry-primary.json, camry-backup.json, rav4-primary.json, rav4-backup.json: four fictional, fully disclosed listing snapshots with distinct VIN-format keys, mileage, price, colors and provenance for every field.
- data/listings/schema.ts: runtime Zod schema and JSON Schema export.
- data/listings/listing.schema.json: standalone generated JSON Schema for adding a snapshot.
- data/registry.ts: saved registry, match logic and user-confirmed representative paint.
- data/registry.test.ts: offline lookups, snapshot validation, match flags, asset mismatches, isolation and paint confirmation tests.
- data/SYNTHETIC-DATA.md and this handoff: policy and integration notes.

## Exported signatures

```ts
getRegistryEntries(): RegistryEntry[];
getRegistryEntry(vin: string): RegistryEntry | undefined;
getRegistryVehicles(): Record<string, VehicleConfig>;
getRegistryMatchStatus(vehicle: VehicleConfig, asset?: RegistryAsset): MatchStatus;
matchStatus(config: RegistryEntry, asset?: RegistryAsset): MatchStatus;
confirmRepresentativePaint(partial: Partial<VehicleConfig>, paint: ConfirmedPaint): RepresentativePaintResult;
isSupportedVehicle(config: Partial<VehicleConfig>): boolean;
```

`demoVins.camry.primary`, `.camry.backup`, `.rav4.primary`, `.rav4.backup` expose the demo keys. `ListingSnapshotSchema` and `listingSnapshotJsonSchema` are exported from data/listings/schema.ts. RegistryEntry extends the unchanged shared VehicleConfig with listingSnapshot, paintHex, five verification flags and per-field sources. Price and odometer live in listingSnapshot.fields, not VIN-derived data.

The canonical identifyVehicle(vin, opts?) export remains in data/decode.ts. It now uses this saved demo registry by default. All four sample/backup keys resolve to full, schema-valid representative VehicleConfigs even with the network disabled. Consumers can get the associated synthetic mileage and price through getRegistryEntry.

## Match rules

All five flags must explicitly be true before exact is even considered. Asset metadata must also match vehicleId/model/year/trim/paintName/paintHex and a nonempty modelAsset path. The saved lookup recomputes match status rather than trusting a caller's label, and does not accept changed vehicle identity as saved verification evidence.

Current saved entries have all flags false and no modelAsset path because no real mesh has been verified. They remain representative. The tests supply clearly isolated asset metadata to verify that all five flags permit exact, that flipping each flag downgrades it, and that unsupported models never become exact. These tests are not real asset verification.

## Unsupported VIN and paint

confirmRepresentativePaint requires `{ name, hex, confirmed: true }`. It preserves decoded specs, adds user-source paint evidence, drops any old manufacturer paint code, and forces representative. If required VehicleConfig details are missing, it returns `{ ok: false, partial, error }`; do not build a twin from that partial. A complete unsupported config can be displayed with an explicitly representative swatch, while VIN identification still reports models outside the two-car scope as unsupported.

## What remains

- Kareem's actual asset manifest, paths and five visual verification checks. Synthetic listing colors are changeable demo choices.
- C3 spec sheets with detailed source strings. Registry seats/cargo/MSRP are currently disclosed synthetic assumptions; EPA combined MPG remains sourced.
- C7 real twin builder, including reading synthetic odometer/price from the selected snapshot. C0 mockTwin still uses its original fixture behavior.
- Anirudh's review of the proposed supporting shared types.

Checks: npm test; npx tsc --noEmit; npx eslint data/registry.ts data/registry.test.ts data/listings/schema.ts data/decode.ts; npm run build.
