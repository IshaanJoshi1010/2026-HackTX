# Alex demo dry-run corrections

## Explicit demo loading (Dev 2 integration)

Use this on the existing explicit demo-entry action, rather than calling buildTwin with only a vehicle:

```ts
import { buildDemoTwin, demoBrainDump, demoTodayISO } from "@/data/demo";

const result = await buildDemoTwin();
if (!result.ok) {
  // Show result.error using the UI's existing error state.
  return;
}
const twin = result.twin;
// Pass twin to the existing store's explicit demo initialization action.
// Use demoBrainDump as the demo prompt and demoTodayISO for its fixed snapshot.
```

The actual store call stays with Ishaan, who owns the UI. This patch supplies the preset and integration contract; it does not claim the UI call site has already switched. Do not automatically apply fictional Alex data to ordinary VIN entry. Existing custom demo callers may instead pass raw: { ...alexProfile } and createProvider({ vehicleId }) to buildTwin.

Exports: buildDemoTwin(vehicleId?: DemoVehicleId): Promise<BuildTwinResult>, demoBrainDump: string, demoTodayISO: string. DemoVehicleId accepts camry-2022-se or rav4-2024-hybrid-xle; Camry is the default. Both paths use primary saved registry entries, matching synthetic providers and no network calls. All synthetic profile provenance survives normalization; returned twins are independent copies. Shared contracts and generic buildTwin defaults are unchanged.

## Story consistency

Alex starts in Austin with a partner and one existing child: householdSize 3, children 1. The prompt's second child is an absolute children count of 2 at month 32, with inferred June timing for 2029. Proposals stay unconfirmed until the UI explicitly confirms. Dev 4 then adjusts household size to 4 without inferring car-seat needs.

Keep cargoNeed low, carSeats 0 and priorities equal at 0.2 each. These are explicit fictional inputs, not defaults inferred from household size. Car-seat physical fit is unverified. The family's car-seat needs may be entered explicitly; do not infer them from ages, pregnancy or child count.

The actual integrated check with dev4-sim 5d9e299 preserves the team's inconclusive story and computes a break-even of 14433.59375 mi/yr, rendered by Dev 4 as about 14,434. The action is to reevaluate if driving drops below that modeled threshold. These figures are computed from synthetic demo assumptions, never hardcoded as the explanation's decision rule. Changing priorities, cargo needs or other assumptions can change the result.

## Offline explanation

Fallback now starts with the supplied next action. Inconclusive results begin with "No option clearly leads on your priorities yet." The complete original rationale follows under a readable introduction, with warnings, fit checks and the financial-quote disclaimer preserved. No model or code in this module selects a new winner or calculates a new number.

## Verification

npm test
npx tsc --noEmit
npm run lint
npm run build

Additional isolated check executed the real Dev 4 engine with buildDemoTwin, the authored quoted extraction and fixture-confirmed events. It verified household/child counts before and after month 32, unchanged confirmed inputs, no inferred car seats, the inconclusive verdict and the computed next action. Captured engine output is regression-tested through POST /api/explain without a key. Live Gemini and full browser UI/3D acceptance remain separate.

Post-merge usage note: see ai/INTEGRATION.md for exact offline VIN, Alex preset, server interpretation/explanation and browser API calls. Odometer provenance now lives in driver.provenance["mileage"]. No-key /api/explain responses additionally carry aiAvailable: false while explain() still returns only text/usedFallback. The merged manifest/GLBs now exist; Kareem is applying the approved synthetic paint values and canonical RAV4 ID while retaining representative status.
