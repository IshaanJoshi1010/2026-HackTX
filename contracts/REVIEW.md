# D3-C0 contract review for Anirudh and Ishaan

C2 update: user-approved synthetic listing/VIN entries now live in data/registry.ts and data/listings. C0 fixtures retain their placeholder behavior. See data/C2-HANDOFF.md and data/SYNTHETIC-DATA.md. No shared type was changed.

Status: proposed implementation, not a newly agreed contract freeze. Existing root types and canonical interface fields are copied without changes. Dev 4's `SuitabilityResult` is already defined in INTERFACES.md and is reused verbatim.

## Undefined shapes proposed for review

- `HistoryRecord`: date (ISO date), type, description, mileage, source, provenance note. Should type be an enum once C4's event list is agreed?
- `FinanceState`: financeType, balance, monthlyPayment, remainingTermMonths, optional leaseEndMonth (relative month), provenance per present field. Are these names and units sufficient for loan and lease simulation? No interest or amortization terms have been invented.
- `AccountData`: finance plus source. Do providers need a separate account ID or other fields?
- `VehicleSignals`: mileage plus source. Which additional signals, if any, does Dev 4 need? Keep optional until agreed.
- `RawProfileInput`: `Record<string, unknown>` until C5 defines normalization inputs. Validation and narrowing must occur before using raw values.

## Questions before freezing

1. VehicleConfig has `specSources: string[]`, not per-field provenance or the five exact-match verification flags. C0 keeps the frozen fields intact. Where should C2 store verification flags and source detail without changing this interface?
2. `VehicleTwin.mileage` has no source field. Where should its provenance live? The C0 mock documents 48,000 miles as synthetic, but this needs a shared decision before a real twin ships.
3. Is `mockQuestion` the gapCheck-compatible function the store expects? C0 uses `(p, { view }) => { missing, question }`, matching the canonical gapCheck signature. `mockTwin`, `mockInterpret`, and `mockSpecs` match buildTwin, interpret, and getSpecs respectively.
4. Blank `modelAsset` means unavailable, not a real path. UI must use its stub until Kareem supplies an asset. Both vehicles remain representative with TODO paint and no fabricated VIN.
5. All numeric non-EPA vehicle/spec values are illustrative. EPA MPG comes from records 44348 (FWD Camry) and 47392 (RAV4 AWD). RAV4 cargo is an illustrative fixture, not EPA's unreported zero. EPA fuelCost08 and youSaveSpend are never exported into fixtures.
6. Alex's fuel price of $3/gal is a synthetic placeholder. No verified Austin local average was supplied, so C0 does not claim one. All driver and finance provenance is synthetic.
7. Chip questions include "I'm not sure". Draft and interpreted events validate as proposed; the generic LifeEvent type retains all documented statuses. Should relative month fields allow negative historical offsets? C0 permits only nonnegative integer scenario months.

## Files and integration

Types: `contracts/index.ts`. Zod schemas for every exported shared type: `contracts/schemas.ts`. `validate(schema, input)` returns `{ ok: true, data }` or `{ ok: false, error }` with readable field paths.

Fixtures: `data/fixtures/alex.ts`, `finance.ts`, `vehicles.ts`, `specs.ts`. Source strings for MPG are in each VehicleConfig's specSources and the unchanged EPA fixture. SpecSheet sources label maintenance/depreciation as illustrative; fit flags remain unverified.

Mocks: `contracts/mocks/index.ts`. Every result is offline; interpret returns aiAvailable false for manual input. mockTwin deliberately ignores raw/provider inputs until later tasks, preserves the caller's vehicle and mileage, uses Alex and synthetic finance, and has no history. It is not production validation or a real twin builder. mockQuestion returns a stable mock cargo question, not the real gap-check algorithm. Returned twins and specs are independent copies.

## Exported mock signatures

```ts
mockTwin(a: { vehicle: VehicleConfig; mileage?: number; raw?: RawProfileInput; provider?: ConnectionProvider }): Promise<{ ok: true; twin: VehicleTwin } | { ok: false; error: string }>;
mockInterpret(prompt: string, ctx: InterpretContext): Promise<InterpretResult>;
mockQuestion(p: DriverProfile, ctx: { view: "keep" | "compare" }): { missing: FieldKey[]; question: Question | null };
mockSpecs(vehicleId: string): SpecSheet;
validate<S extends z.ZodType>(schema: S, input: unknown): ValidationResult<z.output<S>>;
```

Checks: `npm test`, `npm run build`, `npx tsc --noEmit` (after Next generates its route types). Fixture tests cover provenance, weights, EPA drivetrain selection, proposed-only events, mock isolation, and readable rejection of invalid inputs. C1 has not started.
