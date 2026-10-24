# D3-C6: connection providers

Created data/providers/types.ts, synthetic.ts, smartcar.ts, tfs.ts, index.ts, mapping.ts, providers.test.ts, SMARTCAR-NOTES.md and this handoff. Updated the twin builder to preserve the actionable TFS not-configured error and the Dev 3 handoff row. Shared contracts are unchanged.

## Exports

```ts
createProvider(config?: ProviderConfig): ConnectionProvider;
getProviderDescriptor(id: ProviderId): ProviderDescriptor;
mapProviderData(account: unknown, signals: unknown, profile?: Partial<DriverProfile>): ProviderMappingResult;
loadProviderData(provider: ConnectionProvider, profile?: Partial<DriverProfile>): Promise<ProviderMappingResult>;
```

All are exported from data/providers/index.ts, alongside providerRegistry, SyntheticProvider, SimulatedSmartcarProvider, TFSProvider and ProviderNotConfiguredError. Every provider implements the existing getAccount(): Promise<AccountData> and getVehicleSignals(): Promise<VehicleSignals> methods.

ProviderConfig has optional id synthetic/smartcar-simulated/tfs and vehicleId camry-2022-se/rav4-2024-hybrid-xle. Defaults are synthetic and Camry. Invalid provider or vehicle config is rejected, never silently swapped for a successful provider.

## Provider behavior

- SyntheticProvider returns Alex's fictional loan account: balance 15,000, payment 450, term 36 months. Mileage matches the selected primary listing, 48,000 for Camry or 24,000 for RAV4. Finance, source and odometer labels are synthetic. It reads local fixtures only.
- SimulatedSmartcarProvider is a local deterministic simulation. It returns a different fictional account (balance 12,500, payment 410, term 34) and odometer (49,000 Camry or 25,000 RAV4). All values remain synthetic. It imports no Smartcar SDK, authenticates no vehicle and makes no network requests. The finance fields do not claim to be Smartcar-provided financial data. See providers/SMARTCAR-NOTES.md for the required feasibility review and official sources.
- TFSProvider is intentionally unimplemented. Both methods reject with ProviderNotConfiguredError/code TFS_NOT_CONFIGURED and a clear not-configured message. It does not accept a token or pretend credentials alone make an integration work. The project-provided sandbox process is to ask api_services@toyota.com for approved access, then implement OAuth2. No request email was sent and no sponsor credentials were assumed.

The shared Source enum has no simulated value. Both local providers truthfully use synthetic, while providerRegistry exposes distinct label/mode/disclosure values. UI must show the descriptor disclosure, not infer a live connection from the class name. TFS is marked configured false.

## Mapping and integration

Use `const provider = createProvider({ id, vehicleId })` and pass it to the existing buildTwin({ vehicle, raw, provider }) call. No UI-specific provider implementation or new shared output shape is needed. Always select vehicleId to match the chosen demo vehicle; the frozen signals/account shapes have no vehicle ID and cannot independently verify pairing.

loadProviderData reads both methods, validates each response, and maps financeType into a draft DriverProfile with provider provenance. It returns finance, mileage and mileageSource separately. A conflicting supplied financeType requires confirmation. Supplied profile data and provider fixtures are never mutated; returned data is independent. The mapping is a draft, not authorization to overwrite confirmedProfile.

With the default provider, primary demo history matches. Selecting the local Smartcar-style simulation changes the odometer, so the twin correctly marks its old primary history unavailable instead of inventing an updated historical reading. Explicit mileage still wins over provider signals. TFS produces a typed failed build with no partial twin and the not-configured message.

Concrete providers currently use no real accounts, telemetry or network. They are usable offline. Richer vehicle signals are not added because the frozen VehicleSignals contract contains only mileage/source. Synthetic and local-simulation labels change through descriptors without changing the source-label enum.

## Validation

npm test
npx tsc --noEmit
npx eslint data/providers data/twin.ts
npm run build

Tests cover default and selected-vehicle mileage, canonical schemas, all finance labels, shape stability when swapping providers, differing data and descriptor labels, returned-object isolation, no network, invalid config, TFS failure, mapping provenance, confirmation conflicts, sanitized errors and both providers through buildTwin.

## Coordination status

The dashboard screenshot already showed this repository and dev3-data-ai. A fresh heartbeat/status check on 2026-10-24 confirmed this session as working on dev3-data-ai with zero conflicts. No new agent or replacement branch was created.

Next: C9 full Dev 3 test/audit pass. Live Gemini testing still requires a configured user-owned key; asset/fit verification and remaining shared-type reviews remain separate team dependencies.
