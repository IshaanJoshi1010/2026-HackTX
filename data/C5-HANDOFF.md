# D3-C5: deterministic onboarding data logic

## Created and updated

Created data/normalize.ts, defaults.ts, gapCheck.ts, tradeoffs.ts, finance.ts, onboarding.test.ts and this handoff. Updated twin.ts, the compatibility twin-profile.ts adapter, twin tests and the Dev 3 handoff row. No shared contract edits or AI/model calls.

## Exported signatures

```ts
normalizeProfile(raw: RawProfileInput): { ok: true; profile: Partial<DriverProfile> } | { ok: false; error: string };
normalizeOnboarding(raw: RawProfileInput): NormalizedOnboarding;
applyDefaults(p: Partial<DriverProfile>): DriverProfile;
gapCheck(p: DriverProfile, ctx: GapContext): { missing: FieldKey[]; question: Question | null };
mapTradeoffs(picks: TradeoffPick[]): DriverProfile["priorities"];
mergeContradiction<T>(existing: T, incoming: T): { newValue: T; oldValue: T; needsConfirm: true };
resolveFinance(profile: DriverProfile, input: FinanceInput, ctx: FinanceContext): FinanceResolution;
```

Canonical signatures and question/missing result names are preserved from contracts/INTERFACES.md. `GapContext` has required view keep/compare plus optional vagueCommute, budgetMentioned, declined and financeQuestion. The optional context fields do not change shared types. UI callers using only `{ view }` continue working.

`defaultsTable` exports each seed/source/upgradeQuestion, including non-editable seeded maintenance, seeded depreciation, replacement price, tax, fees, APR, insurance and finance. Descriptor strings identify vehicle-specific seeds; they are not calculated simulation results. `defaultSourceNotes` carries disclosure text. Fuel remains an illustrative $3/gal placeholder, not a verified local average. Nothing silently applies tax/insurance seeds to an engine; Dev 2/4 must opt into them.

## Parsing, provenance and defaults

normalizeProfile accepts structured driver fields, numeric strings, simple annual-mile phrases and a deterministic commute grammar, plus tradeoffPicks and financePayment/financeEndMonth. Examples: `like 20k a year`, `20,000 miles annually`, `$500/month`, `4 people`, and `30 miles each way, 4 days`. It rejects ambiguous alternatives, incorrect units, negative/non-finite values, unknown keys and invalid schemas. It is not a general natural-language or AI extraction layer. Missing/no-idea values stay absent, and vague commute changes carry no invented numeric value.

A complete commute calculates miles each way × 2 × days per week × 52 + 4,000 estimated non-commute miles. Annual-mile provenance is estimated and hints.notes discloses the allowance. An explicit annual-mile value wins; conflicting commute distance/day inputs are rejected for confirmation. Values with supplied provenance retain it; otherwise provided values are user sourced.

applyDefaults fills only undefined fields, preserves zeroes, retains source labels, derives a cargo default from household size and validates the full DriverProfile. It never replaces invalid supplied values. Equal priority defaults are estimated; explicit tradeoff selections yield deterministic user-input-derived weights. The Source union has no derived tag and has not been changed.

normalizeOnboarding adds sidecar hints, notes and financeInput without adding fields to DriverProfile. Partial commute distance can trigger a days-per-week question through its hints. These hints must be retained by Dev 2 if the normalized result is serialized; do not expect gapCheck to infer a discarded phrase from a filled profile.

## One-question rule

Use normalizeOnboarding, then applyDefaults. Call resolveFinance if finance is needed, then gapCheck(profile, { view, ...hints, financeQuestion, declined }). The result exposes all eligible missing keys but only one question. Priority order is finance type in compare view, cargo need in compare view, incomplete/vague commute, budget only when mentioned, then any relevant finance payment/lease-end followup. Chip questions include I'm not sure. Unknown/skipped fields can stay at labeled defaults; store declined fields to avoid repetitive questions. Do not render both gapCheck.question and resolveFinance.question: feed the latter into gapCheck so one question is selected.

A finance question is never added for a paid-off profile; a lease end question is only relevant to a lease. Location, maintenance assumptions and optional fields without captured impact do not trigger generic questioning. The caller selects the view and retains actual phrase-impact hints.

## Deterministic tradeoffs

Start at 0.20 per weight, winner +0.10, loser floored at 0.05, normalize/round to cents and give any rounding remainder to the largest weight. Pairs are applied in canonical order, so reordered UI selections return the same output. Duplicate or invalid pair choices are rejected. cost_vs_cargo maps to cost versus family fit because the frozen priorities type has no cargo key; Anirudh/Ishaan should review this interpretation before freezing. No AI weights or simulation-module imports.

## Finance

resolveFinance requires price, vehicleYear and currentYear explicitly. Loans estimate remaining term from a seeded 72-month original term less whole-year age, with a 12-month minimum. A 20% down-payment assumption plus a straight-line age adjustment estimates balance, and deterministic amortization at an illustrative 7% APR estimates payment. These are disclosed demo estimates, not actual debt, lending offers or market rates. Leases default to 1.2% of price monthly and 24 months remaining; supplied payment/end month are user sourced. Paid-off yields zero balance/payment/term and no finance question. Unknown estimates and flags get a payoff quote.

The twin builder uses the current UTC year for estimates, with injectable currentYear in createTwinBuilder for reproducible tests. Valid provider finance wins; explicit contradictions require confirmation. Registered demo cars without supplied finance fields keep the synthetic demo fixture. Other cases use the C5 resolver. buildTwinWithDetails adds onboarding hints, the eligible finance question and nextAction in metadata, plus disclosure notes in specSources. The canonical buildTwin result stays unchanged.

## Confirmation and boundaries

mergeContradiction only returns old/new copies with needsConfirm true. It does not apply changes. All normalized/proposed data still needs the UI's explicit confirmation gate before replacing confirmedProfile or affecting scenarios. Raw finance fields live in a sidecar, not an expanded DriverProfile. C8a extraction schema, 20 AI dumps, Gemini calls and C6 concrete providers remain unimplemented.

## Checks

npm test
npx tsc --noEmit
npx eslint data/defaults.ts data/normalize.ts data/gapCheck.ts data/tradeoffs.ts data/finance.ts data/twin-profile.ts data/twin.ts data/onboarding.test.ts data/twin.test.ts
npm run build

Tests cover ten messy structured inputs, wrong units/ambiguity, provenance, commute estimates, defaults/skip path, confirmation-only contradictions, gap priorities, uncertainty options, all eight full tradeoff combinations and order independence, loan/lease/paid-off/unknown rules, estimated price/age sensitivity and complete twin integration.

Next task: C8a extraction schema and 20 test dumps, before model calls.

## Received coordination update

Anirudh's agent reported on 2026-10-24 that real applyEvents/simulate were pushed to dev4-sim at 8181ea3, that FinanceState is sufficient for his simulation, and that the sim derives an implied APR from balance/payment/term with an estimated label. This is review of FinanceState only, not approval of all supporting contracts. No Dev 4 code was imported or edited in C5.

For C8a/C8b, his reported supported payload keys are annualMiles, commuteMilesOneWay, commuteDaysPerWeek, householdSize, children, carSeats, childrenDelta, fuelPricePerGal, monthlyBudget, cargoNeed, location and vehicleId. Values are absolute except keys ending Delta. childrenDelta also adjusts householdSize unless explicitly set. vehicleId is for replacement. Unknown keys/wrong types produce warnings. Verify these against the integrated canonical code when building the extractor; they are recorded here as a teammate's report.
