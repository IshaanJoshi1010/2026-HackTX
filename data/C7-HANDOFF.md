# D3-C7: validated twin builder

**C4 follow-up:** getHistory now includes detailed synthetic purchase/service milestones and quarterly odometers for primary demo cars. The minimal-history limitations below describe C7 at delivery; see C4-HANDOFF.md for current behavior. C5/C6 remain pending.

**C5 follow-up:** the twin now delegates to normalizeOnboarding/applyDefaults and the deterministic finance resolver. The structured-only and default-finance limitations below are historical; see C5-HANDOFF.md for the current pipeline. Concrete C6 providers remain pending.

## Files and exports

Created data/twin.ts, data/twin-profile.ts, data/history.ts, data/twin.test.ts and this handoff. Updated the Dev 3 row in docs/HANDOFF.md. Shared contracts are unchanged.

```ts
buildTwin(a: BuildTwinInput): Promise<BuildTwinResult>;
buildTwinWithDetails(a: BuildTwinInput): Promise<DetailedTwinResult>;
createTwinBuilder(deps?: TwinDependencies): (a: BuildTwinInput) => Promise<DetailedTwinResult>;
prepareTwinProfile(raw?: RawProfileInput): { ok: true; profile: DriverProfile } | { ok: false; error: string };
getHistory(vehicleId: string): HistoryRecord[];
```

BuildTwinInput is the canonical `{ vehicle: VehicleConfig; mileage?: number; raw?: RawProfileInput; provider?: ConnectionProvider }`. BuildTwinResult is `{ ok: true; twin: VehicleTwin } | { ok: false; error: string }`. DetailedTwinResult adds metadata with mileage source/note, historyState and warnings on success. TwinDependencies permits injecting getHistory for tests and later integration.

## Integration note for Ishaan

Call identifyVehicle(vin, { offline: true }) for a sample VIN and pass its vehicle to buildTwin({ vehicle, raw, mileage?, provider? }) only when identification status is ok. Model/year/trim picker selections must supply a full VehicleConfig and odometer input, unless a connected provider supplies mileage. A custom decoded vehicle must also be complete; never cast an unsupported partial into VehicleConfig. Handle ok:false without creating a twin. On success the entire output has passed VehicleTwinSchema. Use buildTwinWithDetails for structured mileage provenance, history availability and disclosure warnings, or read the same disclosures in twin.vehicle.specSources when using the canonical function. Dev 2 passes the twin and getSpecs results into Dev 4's engines. Keep confirmation gating in the UI; the builder does not mutate confirmedProfile or scenarios.

## Decisions

- Mileage precedence: explicit input (user), then valid provider signals (provider source), then saved fictional listing odometer (synthetic). Unknown mileage is an error; never use a made-up zero. Explicit mileage avoids a needless signals request.
- Provider finance is schema validated. Account failures or invalid signals return a typed error rather than silently inventing a connected account. Conflicting explicit financeType and provider financeType requires confirmation.
- Registered demo vehicles without an explicit financeType use the synthetic C0 loan fixture. Other cases use clearly labeled illustrative loan/lease/paid-off assumptions, not a personalized estimate. Unknown finance remains marked unknown. C5/C6 must implement the proper finance-estimation workflow. These defaults are disclosed in metadata and the twin's source strings.
- Only primary demo registry VINs use the minimal seeded odometer history. Backup records, picker configs and custom VINs have no history available. An input/provider odometer that differs from the seed invalidates that history for this build, rather than inventing a new historical reading.
- The minimal history is synthetic, chronological, non-decreasing, and ends at the built twin's mileage. No service records have been invented as real events.
- No arbitrary exact label is accepted: supported configs remain representative and other complete configs unsupported until actual visual verification is integrated. Saved VIN identity cannot be silently swapped with a different vehicle.
- No imports from /sim, /decision or /ui. The default builder makes no network calls. Providers may perform their own IO, but the sample/demo path needs no provider.

## Explicit dependencies still pending

C7 is an orchestration implementation with a working structured-input path. C4 has not been completed: data/history.ts currently has two synthetic odometer readings for each primary demo car, not detailed service/ownership records. C5 has not been completed: prepareTwinProfile validates structured driver fields, preserves provenance, labels defaults and derives a basic cargo default, but does not parse prose, calculate commute miles, ask gap questions or map tradeoff picks. It deliberately rejects loose/unknown fields instead of silently ignoring them. C6 providers have not been implemented; the builder can consume any provider conforming to the current proposed contract.

Do not describe those later modules as complete. The adapter is named prepareTwinProfile rather than claiming to be the full normalizeProfile/applyDefaults implementation. Replace its integration when C5 lands. All supporting contract definitions still need Anirudh's review before freezing.

## Checks

npm test
npx tsc --noEmit
npx eslint data/twin.ts data/twin-profile.ts data/history.ts data/twin.test.ts
npm run build

Tests cover primary/backup offline lookup-to-twin, picker configs, complete unsupported custom configs, invalid VIN/no half-built twins, required mileage, input/provider/listing precedence, provider failures and contradictions, source labels, history mismatch, invalid history, schema validation, structured-input errors and caller isolation.

Next step: C4 full synthetic ownership and service history; then C5 onboarding logic. Both strengthen C7 without changing its canonical call signature.
