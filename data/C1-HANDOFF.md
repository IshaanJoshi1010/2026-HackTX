# D3-C1: VIN validation and decode

**C2 follow-up:** the default identifier now uses four disclosed synthetic demo registry entries under Paarth's revised data permission. The empty-registry and real-listing prerequisites described below are historical C1 limitations; see C2-HANDOFF.md for current behavior.

## Exports

```ts
validateVin(vin: string, opts?: { checkDigit?: boolean }): VinValidation;
identifyVehicle(vin: string, opts?: { offline?: boolean; timeoutMs?: number }): Promise<IdentifyResult>;
decodeVin(vin: string, opts?: { timeoutMs?: number; fetch?: FetchLike }): Promise<DecodeResult>;
createVehicleIdentifier(deps?: IdentifierDependencies): typeof identifyVehicle;
mergeVehicleSpecs(decoded: DecodedFields, specs: readonly SpecEntry[]): DecodedFields;
```

Import validation from `data/vin.ts`, and identification and helpers from `data/decode.ts`.

## Behavior

VIN validation enforces 17 ASCII letters/digits, excludes I/O/Q, normalizes lowercase, and optionally checks the North American checksum. Whitespace and punctuation are rejected. Passing no options preserves the canonical validation call signature.

The identifier validates first, then checks its saved registry, then uses NHTSA DecodeVinValues. `offline: true` prevents network calls. The default 3-second deadline covers both fetch and response-body parsing; the request is aborted on timeout. Bad responses, nonzero decoder error codes, mismatched returned VINs, HTTP failures and network failures return an explicit `Decode unavailable` reason. A nonzero NHTSA code is treated conservatively, even if the response offers corrected identity fields.

NHTSA make/model/year/trim/powertrain fields carry source strings. Engine, fuel and drive evidence is retained in specSources because the shared VehicleConfig has no dedicated engine/drive fields. Unknown fields are omitted. Missing electrification is not assumed to mean a non-hybrid gasoline vehicle.

The spec merge requires a unique exact match on make, model, year, trim, powertrain and decoded driveType. It fills only missing mpg, seats, cargoCuFt and msrp, keeps each SpecSheet source label, and includes the caller-supplied source string. It refuses ambiguous variants and mismatched FWD/AWD entries. Callers must supply reviewed spec descriptors; C0 illustrative specs are used only in tests.

## Integration dependencies and deliberate limits

- Production `identifyVehicle` currently has no saved registry or spec entries: real primary/backup VINs, listing snapshots and Kareem's assets are not supplied. No VINs are fabricated. C2/C3 should construct it with reviewed registry/spec dependencies through createVehicleIdentifier.
- Offline primary/backup routing is implemented and tested with test-only injected entries. Those VINs are not real Fork listing records and never become production demo data.
- A successful network decode can still be incomplete. With the unchanged IdentifyResult contract, it returns status `unsupported`, the known `partial` fields, and an explicit reason describing missing details. A recognized supported identity has partial.matchStatus `representative`; a model outside scope has `unsupported`. Consumers must branch on result.status and must not build a twin from a partial.
- The required full VehicleConfig cannot be honestly produced from a VIN alone: paint, assets and verified numeric specs require later inputs. Nothing is filled from C0's mock vehicle/spec fixtures. No shared contract changes were needed.
- All C1 results remain representative/unsupported, including saved entries marked exact by a caller. C2 must add the five explicit verification flags before an exact status can be honored. This avoids falsely certifying entries while verification metadata is absent.
- C1 creates no twin. The full twin builder remains C7. Sample VIN network-free acceptance against real listing data remains pending C2.

## Checks and sources

`npm test`, `npx tsc --noEmit`, `npx eslint data/vin.ts data/decode.ts data/vin.test.ts data/decode.test.ts`, `npm run build`.

Tests use a mocked transport, including response-body and request hangs with fake timers. There are no live network calls in the suite.

NHTSA flat decoder documentation: https://vpic.nhtsa.dot.gov/api/
Checksum reference: https://static.nhtsa.gov/nhtsa/downloads/MfrMail/ORG7173.pdf

Created: data/vin.ts, data/decode.ts, data/vin.test.ts, data/decode.test.ts and this handoff. No C2 implementation or shared-contract edits are included.
