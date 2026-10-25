# Fork contract review, 2026-10-24

Status: awaiting Anirudh and Ishaan's explicit confirmations for this review. Do not mark newly frozen until both confirmations are recorded. Paarth is the sole editor of /contracts under the current team instructions; other developers send proposals here rather than editing these files directly.

## Agreed decisions from Paarth's current instructions

- Exact-match verification flags stay in data/registry.ts: model, year, trim, paint, geometry. VehicleConfig does not gain these fields. All five flags plus matching asset metadata are required for exact; approved synthetic listing data does not establish a verified visual match. Current representative assets stay representative.
- VehicleTwin.mileage is the odometer value. Its canonical source label is DriverProfile.provenance["mileage"]. This is metadata for the twin's odometer, not an extra DriverProfile mileage value. Builders set it from the selected value: explicit input is user, provider signals use their source, saved synthetic snapshots use synthetic. buildTwinWithDetails retains its explanatory sidecar and the audit checks the canonical label agrees with it. Existing schemas still accept older persisted twins; the UI should rebuild or label them when migrating.
- LifeEvent.month, Scenario.forkMonth, projection months and lease-relative months remain nonnegative integer offsets. No negative historical scenario time is added. Historical records use calendar dates instead.
- HistoryRecord.date is an ISO calendar date YYYY-MM-DD, validated with z.iso.date(). type remains a string; source and provenance remain required. History is not inferred from a VIN.

These decisions do not add fields to VehicleConfig or the shared DriverProfile/VehicleTwin interfaces. DriverProfile.provenance is already a Record<string, Source>.

## Supporting types requested from Anirudh

Anirudh explicitly confirmed all three shapes sufficient via Coordigent on 2026-10-24:

```ts
interface FinanceState {
  financeType: DriverProfile["financeType"];
  balance: number;                 // nonnegative USD
  monthlyPayment: number;          // nonnegative USD per month
  remainingTermMonths: number;     // nonnegative integer count
  leaseEndMonth?: number;          // nonnegative integer offset from scenario month 0
  provenance: Record<string, Source>; // label for every present finance field
}
interface VehicleSignals { mileage: number; source: Source }
interface AccountData { finance: FinanceState; source: Source }
```

FinanceState was previously confirmed sufficient by Anirudh; the fresh finalization request includes VehicleSignals and AccountData too. No APR field is added. Any APR inferred from balance/payment/term belongs to deterministic simulation and carries an estimate label. AccountData.source does not replace its nested per-field finance provenance. VehicleSignals currently supplies only odometer mileage, with no GPS, diagnostics, behavior, service history or finance inference.

RawProfileInput remains Record<string, unknown>, narrowed and validated by the data normalizer. No supporting type extension is assumed merely because a provider could eventually supply more data.

## nextAction signature clarification

The implementation accepts:

```ts
nextAction(e: DecisionEvaluation, twin: VehicleTwin,
  be?: BreakEvenResult, results?: SimulationResult[]): NextAction;
```

The optional fourth argument defaults to an empty array. Dev 2 should pass the evaluated results to preserve result-dependent service/action reasoning. Anirudh proposed this exact amendment plus the comment that results default to [] and are needed by keep/replace rules; Dev 3 approved. Only Paarth applies the canonical INTERFACES.md edit once Ishaan says OK. It is a signature clarification, not permission to change the shared evaluation shape. Project label/detail/optional officialLink into DecisionEvaluation.nextAction; keep factors on the separate NextAction result.

## Confirmation record

- Paarth: records the four decisions above under the user's current instructions and implements the canonical odometer source label in real/mock twin builders.
- Anirudh: explicitly confirmed all three supporting shapes and their sufficiency, including estimated APR inference. Proposed the exact optional fourth nextAction argument plus its default/results comment; Dev 3 approved. Canonical INTERFACES.md application awaits Ishaan's OK.
- Ishaan: agent acknowledged sole contract ownership and confirmed the UI already consumes driver.provenance.mileage. It reads finance.financeType/provenance and writes financeType/monthlyPayment/leaseEndMonth/provenance; no requested type change. The agent explicitly withheld approval to freeze on Ishaan's behalf, so Ishaan's freeze confirmation remains pending.

Freeze checklist: both reviewers explicitly confirm, supporting type/units accepted, signature proposal incorporated or explicitly deferred, current checks pass. Do not infer consent from silence, merged code or green CI.

## Integration and verification

See data/DEMO-HANDOFF.md and ai/INTEGRATION.md for exact demo/API calls, source labels and environment variables. Shared mocks are offline compatibility tools, not proof of a real provider connection. Keep manual forms and user confirmation available.

Commands: npm test, npx tsc --noEmit, npm run lint, npm run build. contracts/review.test.ts checks date/time domains, supporting shape validation, real/mock odometer labeling and audit detection of mismatched provenance.
