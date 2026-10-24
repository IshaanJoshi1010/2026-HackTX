# Fork data layer

Dev 3 owns data, ai and app/api. This module never imports sim, decision or ui. Dev 2 passes these outputs to Dev 4. Shared signatures remain in contracts/INTERFACES.md; source labels use the existing Source union.

## Demo and offline guarantee

The approved demo dataset is fictional except the saved EPA MPG figures. Use demoVins from registry.ts, identifyVehicle(vin, { offline: true }), then buildTwin({ vehicle, raw, provider? }) only if identification status is ok. SyntheticProvider is the default configurable provider; omit provider to use saved listing mileage and labeled finance defaults. For an explicit demo action, call buildDemoTwin() from data/demo.ts. It loads the primary Camry, all of Alex's synthetic fields and the matching synthetic provider offline. buildDemoTwin("rav4-2024-hybrid-xle") selects the other supported demo vehicle. For custom demo wiring, pass `{ ...alexProfile }` as raw and createProvider({ vehicleId }) as provider. Generic buildTwin({ vehicle }) deliberately retains neutral onboarding defaults and never silently loads Alex.

All four saved primary/backup VIN-format keys resolve without a network request. Primary cars have synthetic ownership/service history; backup/custom/picker cars do not inherit it. A changed odometer discards the old history rather than fabricating a catch-up reading. Custom unregistered VINs with offline true return an explicit unavailable/unsupported partial. Online NHTSA requests are optional and time out after three seconds. The twin builder itself performs no network calls; supplied providers may do IO, but both shipped demo providers are local.

Gemini lives in server-only ai modules, not this directory. Missing-key/network failures use manual onboarding and deterministic explanation fallback. Live Gemini extraction accuracy is untested without a key. UI confirmation and visual/simulation integration are separate responsibilities; this data audit does not certify the full rendered demo.

No live Toyota/Smartcar/TFS access is claimed. A synthetic VIN passing format/checksum is not known to be assigned to a real car. See SYNTHETIC-DATA.md and providers/SMARTCAR-NOTES.md.

## VIN and decode exports

- vin.ts: `validateVin(vin: string, opts?: { checkDigit?: boolean }): VinValidation`. Input is a VIN string; output is normalized uppercase VIN or the reason length/chars/forbidden_letter/check_digit. Checksum is optional. VinValidation is its tagged result type.
- decode.ts: `identifyVehicle(vin, opts?: { offline?: boolean; timeoutMs?: number }): Promise<IdentifyResult>`. Registry first; otherwise optional NHTSA decode. Output is a complete ok vehicle, invalid reason, or unsupported partial/reason. Never cast a partial into a full vehicle.
- `decodeVin(vin, { timeoutMs?, fetch? }?): Promise<DecodeResult>` is the low-level adapter. It returns sourced partial DecodedFields or an unavailable reason. DecodedFields includes vehicle, fieldSources and optional driveType. FetchLike is the injectable mock transport signature.
- `mergeVehicleSpecs(decoded, specs: readonly SpecEntry[]): DecodedFields` fills missing MPG/seats/cargo/MSRP only for a unique matching identity/powertrain/drivetrain. Each SpecEntry contains matching descriptors, a sheet and source string. It never fills paint/mileage/history.
- `createVehicleIdentifier(deps?: IdentifierDependencies)` returns an identifier with injectable registry, specs, fetch and registryMatchStatus. Bare injected entries cannot self-certify exact. NHTSA_BASE_URL is the public decoder endpoint constant. DecodeResult is the adapter result union.

## Registry and listing exports

- registry.ts: `demoVins` exposes immutable camry/rav4 primary/backup keys. `getRegistryEntries(): RegistryEntry[]`, `getRegistryEntry(vin): RegistryEntry | undefined`, and `getRegistryVehicles(): Record<string, VehicleConfig>` return isolated copies. The latter strips private registry metadata to the canonical config shape.
- RegistryEntry extends VehicleConfig with listingSnapshot, paintHex, VerificationFlags and fieldSources. ListingSnapshot holds disclosed fictional price/mileage/color/identity. Price is a used-listing assumption, distinct from original MSRP.
- `isSupportedVehicle(config: Partial<VehicleConfig>): boolean` checks the two supported identities.
- `matchStatus(entry, asset?: RegistryAsset): MatchStatus` requires all five model/year/trim/paint/geometry flags and matching asset metadata before exact. `getRegistryMatchStatus(vehicle, asset?)` uses authoritative saved flags and rejects altered identity as saved verification evidence. RegistryAsset is local matching metadata, not a new shared type.
- `confirmRepresentativePaint(partial, paint: ConfirmedPaint): RepresentativePaintResult` requires a name, six-digit hex and confirmed true. It returns a representative full config or a partial/error when required fields remain absent, without inventing them. It removes any old manufacturer paint code. ConfirmedPaintSchema validates the swatch input.
- listings/schema.ts: ListingSnapshotSchema validates each fictional snapshot including per-field synthetic provenance. listingSnapshotJsonSchema and listings/listing.schema.json expose the same schema for adding records. ListingSnapshot is the inferred type. The four primary/backup JSON files are the authoritative saved fictional snapshots.

## Specs and history exports

- specs.ts: `getSpecs(vehicleId): SpecSheet` returns an isolated canonical sheet or throws for unknown IDs. `getSpecDetails(vehicleId): VehicleSpecDetails` adds powertrain/drive, every numeric leaf's NumericSource label/string, unverified-fit status, notes and user-confirmed official resource links (currently none).
- `getSpecEntries(): SpecEntry[]` supplies strict decoder descriptors. requiredFields lists canonical required sheet keys; supportedSpecIds lists the two supported IDs. NumericSource is `{ label: Source; source: string }`.
- EPA city/highway/combined MPG uses saved record 44348 for FWD Camry and 47392 for RAV4 Hybrid AWD. Other physical values are synthetic. Maintenance schedules/costs and depreciation assumptions are illustrative. All returned numeric leaves have a label and source string. EPA's default fuelCost08/youSaveSpend are not exported, and RAV4 zero luggage volumes are not treated as cargo measurements.
- history.ts: `getHistory(vehicleId): HistoryRecord[]` returns copied synthetic purchase, service and odometer records for primary demo cars, or [] for unknown IDs. The anchor is the saved 2026-10-24 snapshot, not the runtime clock. Same-day events are allowed; dates/mileage are non-decreasing and the final reading matches the demo odometer.

## Profile, defaults, questions and finance exports

- normalize.ts: `normalizeProfile(raw: RawProfileInput)` returns ok plus a Partial<DriverProfile>, or an error. `normalizeOnboarding(raw): NormalizedOnboarding` also exposes OnboardingHints (vague commute/budget/notes) and FinanceInput (payment/endMonth). Input is bounded structured data and supported numeric/commute phrases, not arbitrary NLP. No model calls occur.
- Commute annual miles = each-way miles × 2 × days/week × 52 + 4,000 estimated non-commute miles. Explicit annual input wins. Unknown/vague fields stay absent. Provenance follows supplied fields or explicit source labels.
- `mergeContradiction<T>(existing, incoming)` returns copied old/new values with needsConfirm true; it never applies the change.
- defaults.ts: `applyDefaults(partial): DriverProfile` fills only undefined fields and validates. Invalid supplied values throw; they are not overwritten. defaultsTable describes every seeded field, source and upgrade question; defaultSourceNotes gives disclosures. DefaultSource is the estimated/illustrative subset of Source. Fuel $3/gal is illustrative, not a verified local average. Cost/tax/insurance seeds are not automatically applied to the sim.
- gapCheck.ts: `gapCheck(profile, ctx: GapContext)` returns all impact-relevant missing keys plus at most one canonical question. ctx.view is keep/compare; optional phrase hints, uncertainFields, declined fields and financeQuestion preserve relevant context. Chips include I'm not sure. UI retains hints/declines across turns and must not show multiple questions.
- tradeoffs.ts: `mapTradeoffs(picks: TradeoffPick[]): DriverProfile["priorities"]` derives normalized rounded weights deterministically, independent of UI order. Invalid/duplicate pairs throw. Cargo maps to family fit because the frozen priorities shape has no cargo key. Empty picks yield labeled equal defaults through the normalizer.
- finance.ts: `resolveFinance(profile, input: FinanceInput, ctx: FinanceContext): FinanceResolution` returns finance, one eligible finance question, nextAction and assumptions. Context explicitly supplies price/vehicleYear/currentYear. Paid-off requires no finance question. Loan/lease missing values receive disclosed demo estimates; unknown flags get a payoff quote. Supplied payment/end month is user sourced. No actual debt or lending offer is inferred.
- twin-profile.ts: `prepareTwinProfile(raw?)` is the retained C7 compatibility adapter over normalizeProfile/applyDefaults, returning a complete validated profile or error.

## Twin exports

- twin.ts: `buildTwin(a: BuildTwinInput): Promise<BuildTwinResult>` takes a full VehicleConfig plus optional mileage/raw/provider. It returns a fully validated VehicleTwin or a typed error with no half-built twin.
- `buildTwinWithDetails(a): Promise<DetailedTwinResult>` adds TwinMetadata: mileage source/note, historyState, warnings and onboarding hints/finance question/nextAction. The canonical result stays unchanged. Source notes also travel in vehicle.specSources.
- `createTwinBuilder(deps?: TwinDependencies)` injects getHistory and currentYear for tests. CurrentYear defaults to the current UTC year for finance estimation.
- Input mileage wins over provider signals, which win over saved listing mileage. Provider finance is schema validated. Conflicting explicit finance type, payment or lease end requires confirmation; providers cannot silently replace those values. Missing custom-vehicle mileage is an error. An arbitrary supplied exact label never bypasses visual verification.
- BuildTwinInput, BuildTwinResult, DetailedTwinResult, TwinMetadata and TwinDependencies are local integration types. All functions return copies and never mutate confirmedProfile, provider fixtures or scenarios.

## Provider exports

- providers/index.ts: `createProvider(config?: ProviderConfig): ConnectionProvider` defaults to synthetic/Camry. IDs are synthetic, smartcar-simulated and tfs; vehicleId must be one of the two demo IDs. Invalid config throws.
- `providerRegistry` is an immutable list of ProviderDescriptor labels/modes/disclosures. `getProviderDescriptor(id: ProviderId)` returns a copy. Always show the relevant disclosure in the UI; two providers using synthetic labels must not look like real account connections.
- SyntheticProvider, SimulatedSmartcarProvider and TFSProvider implement getAccount/getVehicleSignals. The first two are deterministic local synthetic data. TFS always throws ProviderNotConfiguredError with code TFS_NOT_CONFIGURED; it is not implemented even if credentials later become available.
- `mapProviderData(account, signals, profile?): ProviderMappingResult` validates and returns a draft profile, finance, mileage/source or error. `loadProviderData(provider, profile?)` reads both methods and maps, sanitizing failures. Neither updates confirmed data.
- providers/types.ts exports ProviderConfigSchema, ProviderConfig, ProviderId, DemoVehicleId, ProviderDescriptor and ProviderNotConfiguredError, and re-exports the shared ConnectionProvider type. No custom simulated Source tag is introduced.

## Fixtures and audit exports

- demo.ts exports buildDemoTwin(vehicleId?: DemoVehicleId): Promise<BuildTwinResult>, demoBrainDump: string and demoTodayISO: string. The demo is opt-in, offline, synthetic and isolated between calls.
- fixtures/alex.ts exports alexProfile: a synthetic complete DriverProfile for the fictional Austin persona. fixtures/finance.ts exports syntheticFinance, a synthetic loan. Their values are not real records.
- fixtures/vehicles.ts exports camryVehicle, rav4Vehicle and vehicleFixtures, C0 placeholder configs with representative status and no asset. fixtures/specs.ts exports specFixtures, the original illustrative C0 integration sheets. Current registry/simulation inputs use specs.ts; old mocks deliberately retain their original fixtures. fixtures/epa.json is the sourced EPA snapshot and provider/limitations metadata.
- audit.ts: `auditTwinSources(twin, metadata: Pick<TwinMetadata, "mileage">): SourceAudit` audits semantic leaf values, listing exact missing source paths. SourceAudit has labeled count, missing and path-to-Source fields. Source/citation/provenance containers are metadata, not recursively self-labeled data. Unknown or modified vehicle fields fail this strict saved-registry source audit rather than being given a made-up source.

## Verification and boundaries

Run npm test, npx tsc --noEmit, npm run lint, npm run build. The independent C9 checks are in data/audit.test.ts; detailed statuses and disclosures are in C9-AUDIT.md. All live-service success claims remain unverified: no actual Gemini key, Smartcar connection or TFS sandbox is configured.

Missing model assets/manifest in this branch prevent exact visual acceptance. Real car-seat/packing fit is unverified. Shared type approval remains separate except Anirudh's reported FinanceState acceptance. This data module supplies drafts/fixtures and computed normalization; it does not own UI confirmation, the 3D viewer, simulation or recommendation formulas.

Alex's current fictional baseline is a household of three with one existing child, low cargo need, zero explicitly configured car seats and equal priority weights. The second-child demo proposes children=2 at month 32; it does not infer car-seat need or change the current confirmed twin. See data/DEMO-HANDOFF.md.
